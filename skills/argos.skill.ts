import { createClient } from 'graphql-ws'
import type { GraduationAlert, TokenDNA, BondingCurveSnapshot } from '@/types/kairos.types'
import { GRADUATION_THRESHOLD_BNB, GRADUATION_TARGET_BNB } from '@/config/constants'

// ─── MONOLOGUE CALLBACK ────────────────────────────────────────────────────────
type MonologueCallback = (source: string, text: string, level?: string) => void
let monologueCb: MonologueCallback = () => {}
export function setMonologueCallback(cb: MonologueCallback) { monologueCb = cb }
function log(text: string, level = 'INFO') { monologueCb('ARGOS', text, level) }

// ─── TYPES ────────────────────────────────────────────────────────────────────
type GraduationHandler = (alert: GraduationAlert) => void

// ─── BITQUERY SUBSCRIPTION ────────────────────────────────────────────────────
const GRADUATION_SUBSCRIPTION = `
  subscription WatchFourMemeGraduation {
    EVM(network: bsc) {
      DEXTrades(
        where: {
          Trade: {
            Dex: { ProtocolName: { is: "four.meme" } }
          }
        }
      ) {
        Trade {
          Buy {
            Currency {
              Symbol
              Name
              SmartContract
            }
            Amount
          }
          Sell {
            Amount
            Currency { Symbol }
          }
        }
        Transaction {
          Hash
          From
        }
        Block { Time }
      }
    }
  }
`

interface BitqueryTrade {
  Trade: {
    Buy: { Currency: { Symbol: string; Name: string; SmartContract: string }; Amount: string }
    Sell: { Amount: string; Currency: { Symbol: string } }
  }
  Transaction: { Hash: string; From: string }
  Block: { Time: string }
}

// ─── STATE ────────────────────────────────────────────────────────────────────
const cumulativeBNB = new Map<string, number>()
const graduatedTokens = new Set<string>()
const tradeDeltaHistory = new Map<string, Array<{ bnb: number; time: number }>>()
const MAX_DELTA_HISTORY = 10

let wsClient: ReturnType<typeof createClient> | null = null
let unsubscribe: (() => void) | null = null
let retryCount = 0
const MAX_RETRIES = 5
const BASE_DELAY_MS = 2000
let graduationHandler: GraduationHandler | null = null

// ─── PROJECTION ───────────────────────────────────────────────────────────────
function estimateTimeToGrad(address: string, current: number): number | undefined {
  const history = tradeDeltaHistory.get(address) ?? []
  if (history.length < 2) return undefined

  const recent = history.slice(-MAX_DELTA_HISTORY)
  const totalBNB = recent.reduce((sum, e) => sum + e.bnb, 0)
  const timeSpan = recent[recent.length - 1].time - recent[0].time
  if (timeSpan <= 0) return undefined

  const bnbPerMs = totalBNB / timeSpan
  const remaining = GRADUATION_TARGET_BNB - current
  return remaining > 0 ? Math.round(remaining / bnbPerMs / 1000) : 0
}

// ─── TRADE HANDLER ───────────────────────────────────────────────────────────
function handleTrade(trade: BitqueryTrade) {
  const { Buy, Sell } = trade.Trade
  const tokenAddress = Buy.Currency.SmartContract
  const ticker = Buy.Currency.Symbol
  const name = Buy.Currency.Name

  // We count BNB flowing in (BNB sold = BNB bonded)
  const bnbIn = parseFloat(Sell.Amount) || 0
  if (bnbIn <= 0) return

  if (graduatedTokens.has(tokenAddress)) return

  const prev = cumulativeBNB.get(tokenAddress) ?? 0
  const next = prev + bnbIn
  cumulativeBNB.set(tokenAddress, next)

  // Track delta history for time estimation
  const history = tradeDeltaHistory.get(tokenAddress) ?? []
  history.push({ bnb: bnbIn, time: Date.now() })
  if (history.length > MAX_DELTA_HISTORY) history.shift()
  tradeDeltaHistory.set(tokenAddress, history)

  const percent = Math.min(100, (next / GRADUATION_TARGET_BNB) * 100)
  log(`${ticker} — ${percent.toFixed(1)}% bonded (${next.toFixed(3)} / ${GRADUATION_TARGET_BNB} BNB)`)

  if (next >= GRADUATION_THRESHOLD_BNB && !graduatedTokens.has(tokenAddress)) {
    graduatedTokens.add(tokenAddress)
    cumulativeBNB.delete(tokenAddress)

    const snapshot: BondingCurveSnapshot = {
      currentBNB: next,
      targetBNB: GRADUATION_TARGET_BNB,
      percentComplete: percent,
      estimatedTimeToGrad: estimateTimeToGrad(tokenAddress, next),
    }

    const token: TokenDNA = {
      address: tokenAddress,
      ticker,
      name,
      bondingProgress: next,
      bondingPercent: percent,
      createdAt: trade.Block.Time,
      deployerAddress: trade.Transaction.From,
    }

    const alert: GraduationAlert = {
      token,
      triggeredAt: new Date(),
      bondingSnapshot: snapshot,
    }

    log(`GRADUATION DETECTED: ${ticker} at ${next.toFixed(3)} BNB (${percent.toFixed(1)}%)`, 'SUCCESS')
    graduationHandler?.(alert)
  }
}

// ─── CONNECT ─────────────────────────────────────────────────────────────────
function connect() {
  const wsEndpoint = process.env.BITQUERY_WS_ENDPOINT || 'wss://streaming.bitquery.io/eap'
  const apiKey = process.env.BITQUERY_API_KEY

  if (!apiKey) {
    log('BITQUERY_API_KEY not set — running in simulation mode.', 'WARN')
    simulationMode()
    return
  }

  log(`Connecting to Bitquery stream... (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`)

  // Bitquery EAP streaming requires token as a function returning connectionParams
  // and uses 'Authorization' at top-level (not nested under 'headers')
  wsClient = createClient({
    url: wsEndpoint,
    connectionParams: () => ({
      Authorization: `Bearer ${apiKey}`,
    }),
  })

  const observable = wsClient.iterate({ query: GRADUATION_SUBSCRIPTION })

  let active = true
  unsubscribe = () => { active = false }

  ;(async () => {
    try {
      for await (const result of observable) {
        if (!active) break
        const trades = (result.data as { EVM?: { DEXTrades?: BitqueryTrade[] } })?.EVM?.DEXTrades ?? []
        for (const trade of trades) handleTrade(trade)
        retryCount = 0 // reset on successful message
      }
    } catch (err) {
      if (!active) return
      log(`Stream error: ${(err as Error).message}`, 'WARN')
      if (retryCount < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, retryCount)
        retryCount++
        log(`Reconnecting in ${delay}ms... (retry ${retryCount}/${MAX_RETRIES})`, 'WARN')
        setTimeout(connect, delay)
      } else {
        log('Max retries reached. Argos going dark.', 'ABORT')
      }
    }
  })()
}

// ─── SIMULATION MODE (dev without API key) ────────────────────────────────────
let simInterval: ReturnType<typeof setInterval> | null = null

function simulationMode() {
  log('Simulation mode active — emitting synthetic bonding events.', 'WARN')
  const mockTokens = [
    { address: '0xsim1', ticker: 'KRNOS', name: 'Karnos the Ancient', deployer: '0xdev01' },
    { address: '0xsim2', ticker: 'VXID', name: 'Vexid Primordial', deployer: '0xdev02' },
  ]
  const progress = new Map(mockTokens.map(t => [t.address, 0]))

  simInterval = setInterval(() => {
    for (const token of mockTokens) {
      const cur = progress.get(token.address) ?? 0
      if (cur >= GRADUATION_TARGET_BNB) continue
      const delta = Math.random() * 0.8 + 0.1
      const next = Math.min(cur + delta, GRADUATION_TARGET_BNB)
      progress.set(token.address, next)

      handleTrade({
        Trade: {
          Buy: { Currency: { Symbol: token.ticker, Name: token.name, SmartContract: token.address }, Amount: String(delta * 1000) },
          Sell: { Amount: String(delta), Currency: { Symbol: 'BNB' } },
        },
        Transaction: { Hash: `0xfake${Date.now()}`, From: token.deployer },
        Block: { Time: new Date().toISOString() },
      })
    }
  }, 3000)
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────
export function start(handler: GraduationHandler): void {
  graduationHandler = handler
  log('Argos awakens. Scanning the Four.Meme bonding curves...')
  connect()
}

export function stop(): void {
  log('Argos closing watch.')
  unsubscribe?.()
  wsClient?.dispose()
  if (simInterval) clearInterval(simInterval)
  unsubscribe = null
  wsClient = null
  simInterval = null
}

export function getTrackedTokenCount(): number {
  return cumulativeBNB.size
}
