import crypto from 'crypto'
import { createWalletClient, createPublicClient, http, parseEther, isAddress } from 'viem'
import { bsc } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import type { Bounty, BountySubmission, MimeticLore, TokenDNA } from '@/types/kairos.types'

// ─── MONOLOGUE CALLBACK ────────────────────────────────────────────────────────
type MonologueCallback = (source: string, text: string, level?: string) => void
let monologueCb: MonologueCallback = () => {}
export function setMonologueCallback(cb: MonologueCallback) { monologueCb = cb }
function log(text: string, level = 'INFO') { monologueCb('AGORA', text, level) }

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const DEFAULT_REWARD_BNB = 0.0003    // ~$0.10 per human at ~$300 BNB
const DEFAULT_MAX_SLOTS  = 5
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://kairos-engine.duckdns.org'

// ─── IN-MEMORY STORE ─────────────────────────────────────────────────────────
// Bounties live in memory for the session. Lost on restart — acceptable for demo.
const bounties = new Map<string, Bounty>()

// ─── VIEM CLIENTS ─────────────────────────────────────────────────────────────
function buildClients() {
  const pk = process.env.AGENT_OWNER_PRIVATE_KEY
  if (!pk) throw new Error('AGENT_OWNER_PRIVATE_KEY not set — cannot issue payouts')
  const account = privateKeyToAccount(pk as `0x${string}`)
  const rpcUrl = process.env.BNB_RPC_URL || 'https://bsc-dataseed.binance.org/'
  const walletClient = createWalletClient({ account, chain: bsc, transport: http(rpcUrl) })
  const publicClient = createPublicClient({ chain: bsc, transport: http(rpcUrl) })
  return { walletClient, publicClient, account }
}

// ─── CREATE BOUNTY ────────────────────────────────────────────────────────────
export function createBounty(
  token: Pick<TokenDNA, 'ticker' | 'address'>,
  lore: MimeticLore,
  maxSlots = DEFAULT_MAX_SLOTS,
  rewardBNB = DEFAULT_REWARD_BNB
): Bounty {
  const id = crypto.randomBytes(6).toString('hex')

  const bounty: Bounty = {
    id,
    tokenTicker: token.ticker,
    sovereignName: lore.sovereignName,
    loreParagraph: lore.loreParagraph,
    rewardBNB,
    maxSlots,
    submissions: [],
    createdAt: new Date(),
    status: 'OPEN',
  }

  bounties.set(id, bounty)

  const url = `${BASE_URL}/bounty/${id}`
  log(`Bounty created for ${token.ticker} — ${maxSlots} slots @ ${rewardBNB} BNB each. URL: ${url}`, 'SUCCESS')
  return bounty
}

// ─── SUBMIT WORK ─────────────────────────────────────────────────────────────
export function submitWork(
  bountyId: string,
  wallet: string,
  postUrl: string
): { ok: true; submission: BountySubmission } | { ok: false; error: string } {
  const bounty = bounties.get(bountyId)
  if (!bounty) return { ok: false, error: 'Bounty not found' }
  if (bounty.status !== 'OPEN') return { ok: false, error: `Bounty is ${bounty.status}` }
  if (!isAddress(wallet)) return { ok: false, error: 'Invalid BNB wallet address' }
  if (!postUrl.startsWith('http')) return { ok: false, error: 'Invalid post URL' }

  // Prevent duplicate wallet submissions
  const alreadySubmitted = bounty.submissions.some(s => s.wallet.toLowerCase() === wallet.toLowerCase())
  if (alreadySubmitted) return { ok: false, error: 'Wallet already submitted for this bounty' }

  const submission: BountySubmission = {
    id: crypto.randomBytes(4).toString('hex'),
    wallet,
    postUrl,
    submittedAt: new Date(),
    paid: false,
  }

  bounty.submissions.push(submission)

  const slotsUsed = bounty.submissions.length
  if (slotsUsed >= bounty.maxSlots) {
    bounty.status = 'FULL'
    log(`Bounty ${bountyId} (${bounty.tokenTicker}) — all ${bounty.maxSlots} slots filled. Triggering payouts.`, 'SUCCESS')
    // Fire payouts asynchronously — don't block the HTTP response
    executeAllPayouts(bountyId).catch(err =>
      log(`Payout error for bounty ${bountyId}: ${err.message}`, 'WARN')
    )
  } else {
    log(`Bounty ${bountyId} — submission ${slotsUsed}/${bounty.maxSlots} from ${wallet.slice(0, 8)}...`)
  }

  return { ok: true, submission }
}

// ─── EXECUTE PAYOUTS ─────────────────────────────────────────────────────────
export async function executeAllPayouts(bountyId: string): Promise<void> {
  const bounty = bounties.get(bountyId)
  if (!bounty) return

  log(`Executing payouts for bounty ${bountyId} (${bounty.tokenTicker})...`)

  let { walletClient, publicClient } = buildClients()
  const unpaid = bounty.submissions.filter(s => !s.paid)

  for (const submission of unpaid) {
    try {
      const txHash = await walletClient.sendTransaction({
        to: submission.wallet as `0x${string}`,
        value: parseEther(bounty.rewardBNB.toString()),
      })

      // Wait for confirmation
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      submission.paid = true
      submission.txHash = txHash
      log(`Paid ${bounty.rewardBNB} BNB → ${submission.wallet.slice(0, 8)}... tx: ${txHash.slice(0, 12)}...`, 'SUCCESS')
    } catch (err) {
      log(`Failed to pay ${submission.wallet.slice(0, 8)}...: ${(err as Error).message}`, 'WARN')
    }
  }

  bounty.status = 'CLOSED'
  bounty.closedAt = new Date()
  log(`Bounty ${bountyId} closed. ${unpaid.length} payouts executed.`, 'SUCCESS')
}

// ─── PAY SINGLE SUBMISSION ───────────────────────────────────────────────────
// Can also be called individually (e.g. on slot fill, not just when all full)
export async function paySubmission(bountyId: string, submissionId: string): Promise<string> {
  const bounty = bounties.get(bountyId)
  if (!bounty) throw new Error('Bounty not found')

  const submission = bounty.submissions.find(s => s.id === submissionId)
  if (!submission) throw new Error('Submission not found')
  if (submission.paid) return submission.txHash!

  const { walletClient, publicClient } = buildClients()

  const txHash = await walletClient.sendTransaction({
    to: submission.wallet as `0x${string}`,
    value: parseEther(bounty.rewardBNB.toString()),
  })

  await publicClient.waitForTransactionReceipt({ hash: txHash })

  submission.paid = true
  submission.txHash = txHash
  log(`Paid ${bounty.rewardBNB} BNB → ${submission.wallet.slice(0, 8)}... tx: ${txHash.slice(0, 12)}...`, 'SUCCESS')
  return txHash
}

// ─── READ BOUNTY ─────────────────────────────────────────────────────────────
export function getBounty(id: string): Bounty | null {
  return bounties.get(id) ?? null
}

export function getAllBounties(): Bounty[] {
  return Array.from(bounties.values())
}

export function getOpenBounties(): Bounty[] {
  return Array.from(bounties.values()).filter(b => b.status === 'OPEN')
}

// ─── BOUNTY URL ───────────────────────────────────────────────────────────────
export function getBountyUrl(bountyId: string): string {
  return `${BASE_URL}/bounty/${bountyId}`
}
