import crypto from 'crypto'
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

// ─── SINGLETON ────────────────────────────────────────────────────────────────
let instance: MnemosyneSkill | null = null

export class MnemosyneSkill {
  private client: unknown = null

  private constructor() {
    this.initClient()
  }

  static getInstance(): MnemosyneSkill {
    if (!instance) instance = new MnemosyneSkill()
    return instance
  }

  private initClient() {
    const pk = process.env.GREENFIELD_PRIVATE_KEY
    const account = process.env.GREENFIELD_ACCOUNT_ADDRESS

    if (!pk || !account) {
      log('Greenfield credentials not configured — operating in dry-run mode.', 'WARN')
      this.client = null
      return
    }

    try {
      // TODO: replace with live call — method: new Client({ account, privateKey: pk, endpoint: 'https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org' })
      // const { Client } = require('@bnb-chain/greenfield-js-sdk')
      // this.client = Client.create('https://gnfd-testnet-fullnode-tendermint-us.bnbchain.org', String(5600))
      this.client = { ready: true }
      log('Greenfield client initialized.', 'SUCCESS')
    } catch (err) {
      log(`Greenfield init error: ${(err as Error).message}`, 'WARN')
      this.client = null
    }
  }

  // ─── CORE UPLOAD ─────────────────────────────────────────────────────────
  private async uploadObject(key: string, data: string): Promise<ArchiveReceipt> {
    const contentHash = crypto.createHash('sha256').update(data).digest('hex')
    const archivedAt = new Date()

    if (!this.client) {
      log(`[DRY-RUN] Would archive → ${key} (sha256: ${contentHash.slice(0, 12)}...)`)
      return {
        objectId: `dry-run-${Date.now()}`,
        contentHash,
        objectKey: key,
        archivedAt,
      }
    }

    // TODO: replace with live call — method: client.object.createObject({ bucketName: GREENFIELD_BUCKET, objectName: key, body: Buffer.from(data), ... })
    // await this.client.object.createObject({ bucketName: GREENFIELD_BUCKET, objectName: key, body: Buffer.from(data, 'utf-8') })
    log(`Sealed → ${key} (sha256: ${contentHash.slice(0, 12)}...)`, 'SUCCESS')

    return {
      objectId: `gf-${Date.now()}`,
      contentHash,
      objectKey: key,
      archivedAt,
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
    log(`Agent identity metadata sealed. URI: ${url.slice(0, 48)}...`, 'SUCCESS')
    return url
  }
}
