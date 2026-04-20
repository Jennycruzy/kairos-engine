import OpenAI from 'openai'
import type {
  TokenDNA,
  PreLaunchTokenInput,
  AuditReport,
} from '@/types/kairos.types'
import {
  AUDIT_CORPUS_SIZE,
  SIMILARITY_ABORT_THRESHOLD,
  SIMILARITY_CAUTION_THRESHOLD,
} from '@/config/constants'

// ─── MONOLOGUE CALLBACK ────────────────────────────────────────────────────────
type MonologueCallback = (source: string, text: string, level?: string) => void
let monologueCb: MonologueCallback = () => {}
export function setMonologueCallback(cb: MonologueCallback) { monologueCb = cb }
function log(text: string, level = 'INFO') { monologueCb('THEMIS', text, level) }

// ─── KNOWN CLONE PATTERNS ─────────────────────────────────────────────────────
const CLONE_PATTERNS = [
  /^(SHIB|PEPE|DOGE|FLOKI)\d+$/i,
  /(X|2|INU|MOON)$/i,
]

const FAMOUS_RUG_TICKERS = new Set([
  'SQUID', 'SAFEMOON', 'TITANO', 'LUNA', 'UST', 'IRON', 'TITAN',
  'RUGGED', 'HONEYPOT', 'MOONSHOT', 'MOONROCKET',
])

// ─── RUG CORPUS ───────────────────────────────────────────────────────────────
// Base corpus always loaded. Extended with Membase messages when credentials set.
const BASE_RUG_CORPUS: Array<{
  ticker: string
  address: string
  description: string
  deployerAddress: string
  embedding?: number[]
}> = [
  { ticker: 'DOGE2',    address: '0xaaa1', description: 'second doge token moon pump',           deployerAddress: '0xdeadbeef01' },
  { ticker: 'SHIB2',    address: '0xaaa2', description: 'shiba inu killer 2x',                   deployerAddress: '0xdeadbeef02' },
  { ticker: 'PEPE2',    address: '0xaaa3', description: 'pepe the frog meme coin 2',              deployerAddress: '0xdeadbeef03' },
  { ticker: 'FLOKI2',   address: '0xaaa4', description: 'floki viking dog coin',                  deployerAddress: '0xdeadbeef04' },
  { ticker: 'MOONCAT',  address: '0xaaa5', description: 'moon cat to the moon',                   deployerAddress: '0xdeadbeef05' },
  { ticker: 'DOGEINU',  address: '0xaaa6', description: 'doge inu hybrid moon token',             deployerAddress: '0xdeadbeef06' },
  { ticker: 'SAFEDOGE', address: '0xaaa7', description: 'safe doge no rug 100x',                  deployerAddress: '0xdeadbeef07' },
  { ticker: 'ELONDOG',  address: '0xaaa8', description: 'elon musk dog token to mars',            deployerAddress: '0xdeadbeef08' },
  { ticker: 'SQUID',    address: '0xaaa9', description: 'squid game token play to earn',          deployerAddress: '0xdeadbeef09' },
  { ticker: 'SAFEMOON', address: '0xaaaa', description: 'safe moon deflationary tokenomics',      deployerAddress: '0xdeadbeef0a' },
  { ticker: 'TITANO',   address: '0xaaab', description: 'titano auto staking protocol',           deployerAddress: '0xdeadbeef0b' },
  { ticker: 'HONEYPOT', address: '0xaaac', description: 'honey pot yield farm guaranteed returns',deployerAddress: '0xdeadbeef0c' },
  { ticker: 'MOONSHOT', address: '0xaaad', description: 'moonshot guaranteed 100x gem',           deployerAddress: '0xdeadbeef0d' },
  { ticker: 'BABYDOGE', address: '0xaaae', description: 'baby doge son of doge',                  deployerAddress: '0xdeadbeef0e' },
  { ticker: 'MINIFLOKI',address: '0xaaaf', description: 'mini floki elon favourite',              deployerAddress: '0xdeadbeef0f' },
]

// ─── LEVENSHTEIN DISTANCE ─────────────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1]
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function tickerSimilarity(a: string, b: string): number {
  const dist = levenshtein(a.toUpperCase(), b.toUpperCase())
  return 1 - dist / Math.max(a.length, b.length)
}

// ─── COSINE SIMILARITY ────────────────────────────────────────────────────────
function cosine(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] ** 2
    magB += b[i] ** 2
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-10)
}

// ─── FETCH CORPUS (Membase MCP + base corpus) ────────────────────────────────
async function fetchCorpus() {
  const account  = process.env.MEMBASE_ACCOUNT
  const convId   = process.env.MEMBASE_CONVERSATION_ID
  const membaseId = process.env.MEMBASE_ID

  if (!account || !convId || !membaseId) {
    log('Membase credentials not set — using base rug corpus.', 'WARN')
    return BASE_RUG_CORPUS
  }

  try {
    // TODO: replace with live call — method: membase-mcp get_messages({ conversation_id: convId, n: AUDIT_CORPUS_SIZE })
    const res = await fetch(`https://hub.membase.unibase.com/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Membase-Account': account,
        'X-Membase-ID': membaseId,
      },
      body: JSON.stringify({ conversation_id: convId, n: AUDIT_CORPUS_SIZE }),
    })
    if (!res.ok) throw new Error(`Membase query failed: ${res.statusText}`)
    const data = await res.json() as { messages: typeof BASE_RUG_CORPUS }
    // Merge live Membase corpus with base corpus (deduplicate by ticker)
    const tickers = new Set(data.messages.map(m => m.ticker))
    const merged = [...data.messages, ...BASE_RUG_CORPUS.filter(m => !tickers.has(m.ticker))]
    log(`Membase corpus loaded: ${data.messages.length} live + ${merged.length - data.messages.length} base entries.`)
    return merged
  } catch (err) {
    log(`Membase fetch error: ${(err as Error).message} — using base corpus.`, 'WARN')
    return BASE_RUG_CORPUS
  }
}

// ─── EMBEDDING ────────────────────────────────────────────────────────────────
async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    // Return a deterministic mock embedding based on text hash
    const hash = Buffer.from(text).reduce((acc, b) => (acc * 31 + b) & 0xffffffff, 0)
    return Array.from({ length: 384 }, (_, i) => Math.sin(hash * (i + 1)) * 0.5)
  }

  // TODO: replace with live call — method: openai.embeddings.create({ model: 'text-embedding-3-small', input: text })
  const openai = new OpenAI({ apiKey })
  const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: text })
  return res.data[0].embedding
}

// ─── MAIN AUDIT FUNCTION ─────────────────────────────────────────────────────
export async function audit(
  input: TokenDNA | PreLaunchTokenInput
): Promise<AuditReport> {
  const ticker = input.ticker.toUpperCase()
  const description = input.description || ''
  const tokenAddress = 'address' in input ? input.address : `pre-launch-${ticker}`
  const deployerAddress = 'deployerAddress' in input ? input.deployerAddress : (input.creatorAddress ?? '')

  log(`Scanning ${ticker} against ${AUDIT_CORPUS_SIZE} fallen tokens...`)

  const corpus = await fetchCorpus()

  // ─── FACTOR A: TICKER SIMILARITY (30%) ─────────────────────────────────
  log(`Computing ticker similarity...`)
  let maxTickerSim = 0
  let closestMatchTicker: string | undefined
  let closestMatchAddress: string | undefined

  for (const entry of corpus) {
    const sim = tickerSimilarity(ticker, entry.ticker)
    if (sim > maxTickerSim) {
      maxTickerSim = sim
      closestMatchTicker = entry.ticker
      closestMatchAddress = entry.address
    }
  }

  // Clone pattern penalty
  let tickerPenalty = 0
  for (const pattern of CLONE_PATTERNS) {
    if (pattern.test(ticker)) { tickerPenalty = 20; break }
  }
  if (FAMOUS_RUG_TICKERS.has(ticker)) tickerPenalty = Math.max(tickerPenalty, 30)

  const factorA = Math.min(100, maxTickerSim * 100 * 0.30 + tickerPenalty)

  // ─── FACTOR B: DESCRIPTION VECTOR SIMILARITY (50%) ─────────────────────
  log(`Embedding description for vector comparison...`)
  let factorB = 0
  if (description) {
    try {
      const inputEmbedding = await embedText(description)
      let maxCosine = 0
      for (const entry of corpus) {
        if (!entry.embedding) {
          // Generate a pseudo-embedding for corpus entry
          entry.embedding = await embedText(entry.description).catch(() =>
            Array.from({ length: inputEmbedding.length }, () => Math.random())
          )
        }
        const sim = cosine(inputEmbedding, entry.embedding)
        if (sim > maxCosine) maxCosine = sim
      }
      factorB = maxCosine * 100 * 0.50
    } catch (err) {
      log(`Vector embedding failed: ${(err as Error).message}. Skipping Factor B.`, 'WARN')
    }
  }

  // ─── FACTOR C: DEPLOYER RECIDIVISM (20%) ────────────────────────────────
  let factorC = 0
  let hasAddress = !!deployerAddress
  if (hasAddress) {
    const knownRug = corpus.some(
      e => e.deployerAddress?.toLowerCase() === deployerAddress.toLowerCase()
    )
    factorC = knownRug ? 20 : 0
    if (knownRug) log(`Known rug deployer detected: ${deployerAddress.slice(0, 8)}...`, 'WARN')
  } else {
    // Redistribute weights: A=0.375, B=0.625
    const rebalancedA = maxTickerSim * 100 * 0.375 + tickerPenalty
    const rebalancedB = factorB / 0.50 * 0.625
    const rebalancedScore = rebalancedA + rebalancedB
    const riskFlags = buildRiskFlags(maxTickerSim, factorB / 0.50, false, ticker, closestMatchTicker)
    return buildReport(tokenAddress, rebalancedScore, closestMatchTicker, closestMatchAddress, riskFlags)
  }

  const similarityScore = Math.min(100, Math.round(factorA + factorB + factorC))

  const riskFlags = buildRiskFlags(maxTickerSim, factorB / 0.50, factorC > 0, ticker, closestMatchTicker)

  return buildReport(tokenAddress, similarityScore, closestMatchTicker, closestMatchAddress, riskFlags)
}

function buildRiskFlags(
  tickerSim: number,
  descSim: number,
  deployerRug: boolean,
  ticker: string,
  closestTicker?: string
): string[] {
  const flags: string[] = []
  if (tickerSim > 0.6) flags.push(`Ticker "${ticker}" is ≥60% similar to known rug token "${closestTicker}".`)
  for (const p of CLONE_PATTERNS) {
    if (p.test(ticker)) flags.push(`Ticker matches known clone suffix pattern.`)
  }
  if (FAMOUS_RUG_TICKERS.has(ticker)) flags.push(`Ticker matches a historically high-rug pattern.`)
  if (descSim > 60) flags.push(`Description is semantically similar to ${Math.round(descSim)}% of rugged tokens.`)
  if (deployerRug) flags.push(`Deployer address has prior rug history in corpus.`)
  return flags
}

function buildReport(
  tokenAddress: string,
  similarityScore: number,
  closestMatchTicker?: string,
  closestMatchAddress?: string,
  riskFlags: string[] = []
): AuditReport {
  const verdict: AuditReport['verdict'] =
    similarityScore >= SIMILARITY_ABORT_THRESHOLD ? 'ABORT'
    : similarityScore >= SIMILARITY_CAUTION_THRESHOLD ? 'CAUTION'
    : 'CLEAR'

  log(
    `Audit complete. Score: ${similarityScore}/100. Verdict: ${verdict}`,
    verdict === 'CLEAR' ? 'SUCCESS' : verdict === 'CAUTION' ? 'WARN' : 'ABORT'
  )

  return {
    tokenAddress,
    similarityScore,
    closestMatchTicker,
    closestMatchAddress,
    verdict,
    riskFlags,
    auditedAt: new Date(),
  }
}
