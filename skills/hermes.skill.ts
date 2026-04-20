import type { MimeticLore, BondingCurveSnapshot, TokenDNA, BroadcastResult } from '@/types/kairos.types'
import { CAST_RATE_LIMIT_PER_MINUTE } from '@/config/constants'

// ─── MONOLOGUE CALLBACK ────────────────────────────────────────────────────────
type MonologueCallback = (source: string, text: string, level?: string) => void
let monologueCb: MonologueCallback = () => {}
export function setMonologueCallback(cb: MonologueCallback) { monologueCb = cb }
function log(text: string, level = 'INFO') { monologueCb('HERMES', text, level) }

// ─── RATE LIMITER ─────────────────────────────────────────────────────────────
class RateLimiter {
  private timestamps: number[] = []
  private readonly limit: number
  private readonly windowMs: number

  constructor(limit: number, windowMs: number) {
    this.limit = limit
    this.windowMs = windowMs
  }

  async acquire(): Promise<void> {
    const now = Date.now()
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs)

    if (this.timestamps.length >= this.limit) {
      const oldest = this.timestamps[0]
      const waitMs = this.windowMs - (now - oldest) + 100
      log(`Rate limit reached. Waiting ${(waitMs / 1000).toFixed(1)}s before broadcast...`, 'WARN')
      await new Promise(r => setTimeout(r, waitMs))
    }

    this.timestamps.push(Date.now())
  }
}

const rateLimiter = new RateLimiter(CAST_RATE_LIMIT_PER_MINUTE, 60_000)

// ─── FRAME V2 BUILDER ─────────────────────────────────────────────────────────
function buildFramePayload(
  lore: MimeticLore,
  snapshot: BondingCurveSnapshot,
  token: TokenDNA
): object {
  const progress = snapshot.percentComplete.toFixed(1)
  const progressBar = '█'.repeat(Math.floor(snapshot.percentComplete / 5)) +
    '░'.repeat(20 - Math.floor(snapshot.percentComplete / 5))

  return {
    version: 'vNext',
    image: {
      src: token.imageUrl ?? `${process.env.NEXT_PUBLIC_APP_URL}/api/frame-image/${token.address}`,
      aspectRatio: '1.91:1',
    },
    title: `${token.ticker} — ${lore.sovereignName}`,
    body: lore.loreParagraph,
    quote: {
      text: lore.historicalQuote,
      attribution: lore.quoteAttribution,
    },
    progressBar: {
      label: `Bonding Progress: ${progress}% (${snapshot.currentBNB.toFixed(3)} / ${snapshot.targetBNB} BNB)`,
      value: snapshot.percentComplete / 100,
      display: progressBar,
    },
    buttons: [
      {
        label: '🔗 View on Four.Meme',
        action: 'link',
        target: `https://four.meme/token/${token.address}`,
      },
      {
        label: '📜 Cast This Lore',
        action: 'post',
        target: `${process.env.NEXT_PUBLIC_APP_URL}/api/cast-lore/${token.address}`,
      },
    ],
  }
}

// ─── BROADCAST ───────────────────────────────────────────────────────────────
export async function broadcast(
  lore: MimeticLore,
  snapshot: BondingCurveSnapshot,
  token: TokenDNA
): Promise<BroadcastResult> {
  await rateLimiter.acquire()

  log(`Preparing Farcaster Frame v2 for ${token.ticker}...`)

  const apiKey = process.env.NEYNAR_API_KEY
  const signerUuid = process.env.NEYNAR_SIGNER_UUID

  if (!apiKey || !signerUuid) {
    log('Neynar credentials not configured — broadcast skipped (dry-run).', 'WARN')
    const fakeHash = `0x${Buffer.from(token.address + Date.now()).toString('hex').slice(0, 40)}`
    return {
      castHash: fakeHash,
      frameUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/frames/${token.address}`,
      publishedAt: new Date(),
    }
  }

  const framePayload = buildFramePayload(lore, snapshot, token)

  const castText = `${lore.sovereignName} approaches graduation on @fourmeme — ${snapshot.percentComplete.toFixed(1)}% bonded.`

  try {
    // TODO: replace with live call — method: neynarClient.publishCast({ signerUuid, text: castText, embeds: [{ url: frameUrl }] })
    const { NeynarAPIClient } = await import('@neynar/nodejs-sdk')
    const neynarClient = new NeynarAPIClient({ apiKey })

    const frameUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/frames/${token.address}`

    const result = await neynarClient.publishCast({
      signerUuid,
      text: castText,
      embeds: [{ url: frameUrl }],
    })

    const castHash = result.cast.hash

    log(`Frame broadcast complete. Cast: ${castHash.slice(0, 12)}...`, 'SUCCESS')

    return {
      castHash,
      frameUrl,
      publishedAt: new Date(),
    }
  } catch (err) {
    log(`Broadcast error: ${(err as Error).message}`, 'WARN')
    // Don't throw — broadcast failure should not abort the archive pipeline
    const fallbackHash = `0xerr${Date.now().toString(16)}`
    return {
      castHash: fallbackHash,
      frameUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/frames/${token.address}`,
      publishedAt: new Date(),
    }
  }
}
