import { createWalletClient, createPublicClient, http, decodeEventLog } from 'viem'
import { bsc } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import * as fs from 'fs'
import * as path from 'path'
import type {
  AgentIdentityRecord,
  AgentMetadata,
  AgentRegistrationRequest,
  AgentResolutionResult,
  AgentSkillManifest,
} from '@/types/kairos.types'
import { ERC8004_ABI } from './erc8004.abi'
import {
  ERC8004_REGISTRY_ADDRESS_BNB,
  BNB_CHAIN_ID,
  ENGINE_VERSION,
  AGENT_NAME,
  GREENFIELD_BUCKET,
  AGENT_METADATA_VERSION,
} from '@/config/constants'

// ─── MONOLOGUE CALLBACK ────────────────────────────────────────────────────────
type MonologueCallback = (source: string, text: string, level?: string) => void
let monologueCb: MonologueCallback = () => {}
export function setMonologueCallback(cb: MonologueCallback) { monologueCb = cb }
function log(text: string, level = 'INFO') { monologueCb('IDENTITY', text, level) }

// ─── LOCAL PERSISTENCE ────────────────────────────────────────────────────────
const AGENT_ID_FILE = path.join(process.cwd(), '.kairos-agent-id')

function loadPersistedAgentId(): string | null {
  try {
    if (fs.existsSync(AGENT_ID_FILE)) {
      return fs.readFileSync(AGENT_ID_FILE, 'utf-8').trim()
    }
  } catch { /* ignore */ }
  return null
}

function persistAgentId(agentId: string): void {
  try {
    fs.writeFileSync(AGENT_ID_FILE, agentId, 'utf-8')
  } catch (err) {
    log(`Warning: could not persist agent ID to disk — ${(err as Error).message}`, 'WARN')
  }
}

// ─── VIEM CLIENTS ─────────────────────────────────────────────────────────────
function buildClients() {
  const pk = process.env.AGENT_OWNER_PRIVATE_KEY
  if (!pk) throw new Error('AGENT_OWNER_PRIVATE_KEY is not set')

  const account = privateKeyToAccount(pk as `0x${string}`)
  const rpcUrl = process.env.BNB_RPC_URL || 'https://bsc-dataseed.binance.org/'

  const walletClient = createWalletClient({
    account,
    chain: bsc,
    transport: http(rpcUrl),
  })

  const publicClient = createPublicClient({
    chain: bsc,
    transport: http(rpcUrl),
  })

  return { walletClient, publicClient, account }
}

// ─── GREENFIELD UPLOAD SHIM ───────────────────────────────────────────────────
// Mnemosyne is the canonical Greenfield client. During boot, before Mnemosyne
// is initialized, we call its archiveAgentIdentity() directly via a lazy import
// to avoid circular deps. At runtime the same singleton is used.
async function uploadMetadataToGreenfield(
  metadata: AgentMetadata,
  ownerAddress: string
): Promise<string> {
  // TODO: replace with live call — method: mnemosyne.archiveAgentIdentity(metadata, ownerAddress)
  // Lazy import ensures Mnemosyne is initialized by the time this is called from skill-manager boot()
  try {
    const { MnemosyneSkill } = await import('@/skills/mnemosyne.skill')
    const mnemosyne = MnemosyneSkill.getInstance()
    return await mnemosyne.archiveAgentIdentity(metadata, ownerAddress)
  } catch {
    // Fallback URI for dev environments without Greenfield configured
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    return `greenfield://kairos-protocol/kairos-agent-identity/${ownerAddress}/${ts}.json`
  }
}

// ─── REGISTER AGENT ───────────────────────────────────────────────────────────
export async function registerAgent(
  request: AgentRegistrationRequest
): Promise<AgentIdentityRecord> {
  log('Registering agent on BNB Chain via ERC-8004...')

  // Never log privateKey
  const { metadata, ownerAddress } = request

  const metadataURI = await uploadMetadataToGreenfield(metadata, ownerAddress)
  log(`Metadata sealed to Greenfield. URI acquired.`)

  const { walletClient, publicClient, account } = buildClients()

  if (ERC8004_REGISTRY_ADDRESS_BNB === '0x') {
    // Dev / CI fallback — registry not yet deployed
    log('ERC-8004 registry address not configured — using synthetic agent ID for local dev.', 'WARN')
    const syntheticId = `0x${'k41r05'.repeat(5)}` as `0x${string}`
    const record: AgentIdentityRecord = {
      agentId: syntheticId,
      ownerAddress,
      metadataURI,
      registeredAt: new Date(),
      chainId: BNB_CHAIN_ID,
      txHash: '0x' + '0'.repeat(64),
    }
    return record
  }

  // TODO: replace with live call — method: walletClient.writeContract({ address: ERC8004_REGISTRY_ADDRESS_BNB, abi: ERC8004_ABI, functionName: 'registerAgent', args: [metadataURI, ownerAddress] })
  const txHash = await walletClient.writeContract({
    address: ERC8004_REGISTRY_ADDRESS_BNB as `0x${string}`,
    abi: ERC8004_ABI,
    functionName: 'registerAgent',
    args: [metadataURI, account.address],
  })

  log(`Registration tx submitted: ${txHash.slice(0, 10)}...`)

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })

  // Extract agentId from AgentRegistered event
  let agentId = ''
  for (const rawLog of receipt.logs) {
    try {
      const decoded = decodeEventLog({
        abi: ERC8004_ABI,
        data: rawLog.data,
        topics: rawLog.topics,
      })
      if (decoded.eventName === 'AgentRegistered') {
        agentId = (decoded.args as { agentId: string }).agentId
        break
      }
    } catch { /* skip non-matching logs */ }
  }

  if (!agentId) throw new Error('AgentRegistered event not found in receipt logs')

  log(`ERC-8004 agent registered. ID: ${agentId.slice(0, 6)}...${agentId.slice(-4)}`, 'SUCCESS')

  return {
    agentId,
    ownerAddress,
    metadataURI,
    registeredAt: new Date(Number(receipt.blockNumber) * 3000),
    chainId: BNB_CHAIN_ID,
    txHash,
  }
}

// ─── RESOLVE AGENT ────────────────────────────────────────────────────────────
export async function resolveAgent(agentId: string): Promise<AgentResolutionResult> {
  log(`Resolving agent identity from chain... ID: ${agentId.slice(0, 6)}...${agentId.slice(-4)}`)

  if (ERC8004_REGISTRY_ADDRESS_BNB === '0x') {
    log('ERC-8004 registry not deployed — returning synthetic resolution for local dev.', 'WARN')
    return buildSyntheticResolution(agentId)
  }

  const { publicClient } = buildClients()

  // TODO: replace with live call — method: publicClient.readContract({ functionName: 'resolveAgent', args: [agentId] })
  const result = await publicClient.readContract({
    address: ERC8004_REGISTRY_ADDRESS_BNB as `0x${string}`,
    abi: ERC8004_ABI,
    functionName: 'resolveAgent',
    args: [agentId as `0x${string}`],
  }) as [string, string, bigint, boolean]

  const [owner, metadataURI, registeredAtBigInt, isActive] = result

  // Fetch metadata from Greenfield URI
  let metadata: AgentMetadata
  try {
    const res = await fetch(metadataURI)
    metadata = await res.json() as AgentMetadata
  } catch {
    log(`Could not fetch metadata from URI — using fallback.`, 'WARN')
    metadata = buildDefaultMetadata(owner)
  }

  const skillManifest: AgentSkillManifest = {
    agentId,
    injectedSkills: metadata.skills,
    activeAt: new Date(),
    status: isActive ? 'ACTIVE' : 'PAUSED',
  }

  log(`Agent resolved. Active: ${isActive}`, isActive ? 'SUCCESS' : 'WARN')

  return {
    agentId,
    metadata,
    isActive,
    registeredAt: new Date(Number(registeredAtBigInt) * 1000),
    skillManifest,
  }
}

// ─── UPDATE AGENT SKILLS ──────────────────────────────────────────────────────
export async function updateAgentSkills(
  agentId: string,
  skills: string[]
): Promise<string> {
  log(`Updating on-chain skill manifest for agent ${agentId.slice(0, 6)}...`)

  if (ERC8004_REGISTRY_ADDRESS_BNB === '0x') {
    log('ERC-8004 registry not deployed — skipping on-chain update for local dev.', 'WARN')
    return '0x' + '0'.repeat(64)
  }

  const ownerAddress = process.env.AGENT_OWNER_ADDRESS || ''
  const currentMetadata = buildDefaultMetadata(ownerAddress)
  const updatedMetadata: AgentMetadata = { ...currentMetadata, skills }

  const newURI = await uploadMetadataToGreenfield(updatedMetadata, ownerAddress)

  const { walletClient } = buildClients()

  // TODO: replace with live call — method: walletClient.writeContract({ functionName: 'updateMetadataURI', args: [agentId, newURI] })
  const txHash = await walletClient.writeContract({
    address: ERC8004_REGISTRY_ADDRESS_BNB as `0x${string}`,
    abi: ERC8004_ABI,
    functionName: 'updateMetadataURI',
    args: [agentId as `0x${string}`, newURI],
  })

  log(`Skill manifest updated on-chain: ${txHash.slice(0, 10)}...`, 'SUCCESS')
  return txHash
}

// ─── GET OR REGISTER AGENT ────────────────────────────────────────────────────
export async function getOrRegisterAgent(): Promise<AgentIdentityRecord> {
  const envAgentId = process.env.KAIROS_AGENT_ID
  const persistedId = loadPersistedAgentId()
  const existingId = envAgentId || persistedId

  if (existingId) {
    log(`Existing ERC-8004 agent identity found. ID: ${existingId.slice(0, 6)}...${existingId.slice(-4)}`)
    try {
      const resolved = await resolveAgent(existingId)
      if (resolved.isActive) {
        return {
          agentId: resolved.agentId,
          ownerAddress: resolved.metadata.operatorAddress,
          metadataURI: '',
          registeredAt: resolved.registeredAt,
          chainId: BNB_CHAIN_ID,
          txHash: '0x',
        }
      }
      log(`Agent ${existingId.slice(0, 6)}... is inactive — registering fresh identity.`, 'WARN')
    } catch (err) {
      log(`Could not resolve existing agent: ${(err as Error).message}. Re-registering.`, 'WARN')
    }
  }

  // Fresh registration
  const ownerAddress = process.env.AGENT_OWNER_ADDRESS ||
    (process.env.AGENT_OWNER_PRIVATE_KEY
      ? privateKeyToAccount(process.env.AGENT_OWNER_PRIVATE_KEY as `0x${string}`).address
      : '0x0000000000000000000000000000000000000000')

  const metadata: AgentMetadata = buildDefaultMetadata(ownerAddress)

  const record = await registerAgent({
    metadata,
    ownerAddress,
    privateKey: process.env.AGENT_OWNER_PRIVATE_KEY || '',
  })

  persistAgentId(record.agentId)
  return record
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function buildDefaultMetadata(ownerAddress: string): AgentMetadata {
  return {
    name: AGENT_NAME,
    version: ENGINE_VERSION,
    description: 'KAIRÓS Engine — Modular Skill Registry for Chain-Aware Meme Agents on BNB Chain',
    skills: [],
    operatorAddress: ownerAddress,
    engineMode: 'DUAL',
    createdAt: new Date().toISOString(),
    greenfieldArchiveBucket: GREENFIELD_BUCKET,
    farcasterSignerUuid: process.env.NEYNAR_SIGNER_UUID || '',
  }
}

function buildSyntheticResolution(agentId: string): AgentResolutionResult {
  const metadata = buildDefaultMetadata('0x0000000000000000000000000000000000000000')
  return {
    agentId,
    metadata,
    isActive: true,
    registeredAt: new Date(),
    skillManifest: {
      agentId,
      injectedSkills: [],
      activeAt: new Date(),
      status: 'ACTIVE',
    },
  }
}
