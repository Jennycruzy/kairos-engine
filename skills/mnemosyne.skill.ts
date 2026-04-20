import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { Client, VisibilityType, Long } from '@bnb-chain/greenfield-js-sdk'
import type {
  KairosRecord,
  AuditReport,
  TokenDNA,
  PreLaunchTokenInput,
  LaunchAdvisorReport,
  AgentMetadata,
  ArchiveReceipt,
} from '@/types/kairos.types'
import {
  GREENFIELD_BUCKET,
  GREENFIELD_RECORDS_PREFIX,
  GREENFIELD_ABORTS_PREFIX,
  GREENFIELD_ADVISOR_PREFIX,
  GREENFIELD_IDENTITY_PREFIX,
} from '@/config/constants'

// ─── MONOLOGUE CALLBACK ────────────────────────────────────────────────────────
type MonologueCallback = (source: string, text: string, level?: string) => void
let monologueCb: MonologueCallback = () => {}
export function setMonologueCallback(cb: MonologueCallback) { monologueCb = cb }
function log(text: string, level = 'INFO') { monologueCb('MNEMOSYNE', text, level) }

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const GREENFIELD_RPC_URL = 'https://greenfield-chain.bnbchain.org'
const GREENFIELD_CHAIN_ID = '1017'
const SETUP_FLAG_FILE = path.join(process.cwd(), '.kairos-greenfield-setup')

// ─── SINGLETON ────────────────────────────────────────────────────────────────
let instance: MnemosyneSkill | null = null

type GFClient = ReturnType<typeof Client.create>

export class MnemosyneSkill {
  private gfClient: GFClient | null = null
  private spEndpoint: string = ''
  private bucketReady: boolean = false

  private constructor() {
    this.initGreenfield()
  }

  static getInstance(): MnemosyneSkill {
    if (!instance) instance = new MnemosyneSkill()
    return instance
  }

  // ─── INIT ─────────────────────────────────────────────────────────────────
  private initGreenfield() {
    const pk = process.env.GREENFIELD_PRIVATE_KEY
    const account = process.env.GREENFIELD_ACCOUNT_ADDRESS

    if (!pk || !account) {
      log('Greenfield credentials not configured — archive in dry-run mode.', 'WARN')
      return
    }

    try {
      this.gfClient = Client.create(GREENFIELD_RPC_URL, GREENFIELD_CHAIN_ID)
      // If setup flag exists, bucket is ready — skip re-creation
      if (fs.existsSync(SETUP_FLAG_FILE)) {
        this.bucketReady = true
      }
      log('Greenfield client initialized.', 'SUCCESS')
    } catch (err) {
      log(`Greenfield init error: ${(err as Error).message}`, 'WARN')
      this.gfClient = null
    }
  }

  // ─── BUCKET SETUP ─────────────────────────────────────────────────────────
  private async ensureBucket(): Promise<void> {
    if (this.bucketReady || !this.gfClient) return

    const pk = process.env.GREENFIELD_PRIVATE_KEY!
    const account = process.env.GREENFIELD_ACCOUNT_ADDRESS!

    // Fetch an in-service SP
    const allSPs = Array.from(await this.gfClient.sp.getStorageProviders()) as Array<{
      endpoint: string
      operatorAddress: string
      status: number
    }>
    const sp = allSPs.find(s => s.status === 0)
    if (!sp) throw new Error('No in-service Greenfield storage providers found')
    this.spEndpoint = sp.endpoint

    // Check if bucket already exists
    let bucketExists = false
    try {
      await this.gfClient.bucket.headBucket(GREENFIELD_BUCKET)
      bucketExists = true
      log(`Bucket '${GREENFIELD_BUCKET}' verified on Greenfield.`)
    } catch {
      bucketExists = false
    }

    if (!bucketExists) {
      log(`Creating Greenfield bucket '${GREENFIELD_BUCKET}'...`)
      const createBucketTx = await this.gfClient.bucket.createBucket({
        bucketName: GREENFIELD_BUCKET,
        creator: account,
        visibility: VisibilityType.VISIBILITY_TYPE_PUBLIC_READ,
        chargedReadQuota: Long.fromNumber(0),
        primarySpAddress: sp.operatorAddress,
        paymentAddress: account,
      })
      const simInfo = await createBucketTx.simulate({ denom: 'BNB' })
      const broadcastRes = await createBucketTx.broadcast({
        denom: 'BNB',
        gasLimit: Number(simInfo.gasLimit),
        gasPrice: simInfo.gasPrice,
        payer: account,
        granter: '',
        privateKey: pk,
      })
      if (broadcastRes.code !== 0) {
        throw new Error(`Bucket creation failed: ${broadcastRes.rawLog}`)
      }
      log(`Bucket '${GREENFIELD_BUCKET}' created on Greenfield.`, 'SUCCESS')
    }

    // Enable primary SP as delegate agent (allows one-step delegateUploadObject)
    log('Enabling SP as delegate agent for the bucket...')
    try {
      const toggleTx = await this.gfClient.bucket.toggleSpAsDelegatedAgent({
        bucketName: GREENFIELD_BUCKET,
        operator: account,
      })
      const simInfo = await toggleTx.simulate({ denom: 'BNB' })
      await toggleTx.broadcast({
        denom: 'BNB',
        gasLimit: Number(simInfo.gasLimit),
        gasPrice: simInfo.gasPrice,
        payer: account,
        granter: '',
        privateKey: pk,
      })
      log('SP delegate agent enabled.', 'SUCCESS')
    } catch (err) {
      // If toggle fails because delegate is already enabled, that's fine
      log(`SP delegate toggle: ${(err as Error).message} — proceeding.`, 'WARN')
    }

    // Write setup flag so we skip this on next boot
    try { fs.writeFileSync(SETUP_FLAG_FILE, 'ready') } catch { /* ignore */ }
    this.bucketReady = true
  }

  // ─── CORE UPLOAD ─────────────────────────────────────────────────────────
  private async uploadObject(key: string, data: string): Promise<ArchiveReceipt> {
    const contentHash = crypto.createHash('sha256').update(data).digest('hex')
    const archivedAt = new Date()

    if (!this.gfClient) {
      log(`[DRY-RUN] Would archive → ${key} (sha256: ${contentHash.slice(0, 12)}...)`)
      return {
        objectId: `dry-run-${Date.now()}`,
        contentHash,
        objectKey: key,
        archivedAt,
      }
    }

    const pk = process.env.GREENFIELD_PRIVATE_KEY!

    try {
      await this.ensureBucket()

      // Resolve SP endpoint if not cached
      if (!this.spEndpoint) {
        this.spEndpoint = await this.gfClient.sp.getSPUrlByBucket(GREENFIELD_BUCKET)
      }

      const buf = Buffer.from(data, 'utf-8')
      const nodeFile = { name: key.split('/').pop()!, type: 'application/json', size: buf.length, content: buf }

      const result = await this.gfClient.object.delegateUploadObject(
        {
          bucketName: GREENFIELD_BUCKET,
          objectName: key,
          body: nodeFile as unknown as File,
          endpoint: this.spEndpoint,
          delegatedOpts: {
            visibility: VisibilityType.VISIBILITY_TYPE_PUBLIC_READ,
          },
        },
        {
          type: 'ECDSA',
          privateKey: pk,
        }
      )

      if (result.code !== 0) {
        throw new Error(`SP upload rejected: ${JSON.stringify(result)}`)
      }

      log(`Sealed → ${key} (sha256: ${contentHash.slice(0, 12)}...)`, 'SUCCESS')
      return {
        objectId: `gf-${Date.now()}`,
        contentHash,
        objectKey: key,
        archivedAt,
      }
    } catch (err) {
      log(`Greenfield upload failed: ${(err as Error).message} — dry-run fallback.`, 'WARN')
      log(`[DRY-RUN] Would archive → ${key} (sha256: ${contentHash.slice(0, 12)}...)`)
      return {
        objectId: `dry-run-${Date.now()}`,
        contentHash,
        objectKey: key,
        archivedAt,
      }
    }
  }

  private buildObjectUrl(key: string): string {
    return `https://greenfield.bnbchain.org/view/${GREENFIELD_BUCKET}/${key}`
  }

  // ─── ARCHIVE GRADUATION ──────────────────────────────────────────────────
  async archiveGraduation(record: KairosRecord): Promise<ArchiveReceipt> {
    log(`Archiving graduation record for ${record.ticker}...`)
    const ts = new Date().toISOString()
    const key = `${GREENFIELD_RECORDS_PREFIX}/${record.tokenAddress}/${ts}.json`
    const data = JSON.stringify(record, null, 2)
    const receipt = await this.uploadObject(key, data)
    log(`Graduation record sealed for ${record.ticker}.`, 'SUCCESS')
    return receipt
  }

  // ─── ARCHIVE ABORT ───────────────────────────────────────────────────────
  async archiveAbort(
    auditReport: AuditReport,
    token: TokenDNA | PreLaunchTokenInput
  ): Promise<ArchiveReceipt> {
    const ticker = (token as TokenDNA | PreLaunchTokenInput).ticker
    log(`Archiving abort record for ${ticker}...`)
    const ts = new Date().toISOString()
    const key = `${GREENFIELD_ABORTS_PREFIX}/${ticker}/${ts}.json`
    const data = JSON.stringify({ auditReport, token }, null, 2)
    const receipt = await this.uploadObject(key, data)
    log(`Abort record archived. Feeds future Themis training data.`, 'SUCCESS')
    return receipt
  }

  // ─── ARCHIVE ADVISOR REPORT ──────────────────────────────────────────────
  async archiveAdvisorReport(report: LaunchAdvisorReport): Promise<ArchiveReceipt> {
    log(`Sealing advisor report for ${report.originalTicker} to Greenfield...`)
    const ts = new Date().toISOString()
    const key = `${GREENFIELD_ADVISOR_PREFIX}/${report.originalTicker}/${ts}.json`
    const data = JSON.stringify(report, null, 2)
    const receipt = await this.uploadObject(key, data)
    log(`Advisor report archived for ${report.originalTicker}.`, 'SUCCESS')
    return receipt
  }

  // ─── ARCHIVE AGENT IDENTITY ──────────────────────────────────────────────
  async archiveAgentIdentity(
    metadata: AgentMetadata,
    ownerAddress: string
  ): Promise<string> {
    log(`Uploading agent identity metadata to Greenfield...`)
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const key = `${GREENFIELD_IDENTITY_PREFIX}/${ownerAddress}/${ts}.json`
    const data = JSON.stringify(metadata, null, 2)
    await this.uploadObject(key, data)
    const url = this.buildObjectUrl(key)
    log(`Agent identity metadata sealed. URI: ${url.slice(0, 60)}...`, 'SUCCESS')
    return url
  }
}
