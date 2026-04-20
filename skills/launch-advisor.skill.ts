import Anthropic from '@anthropic-ai/sdk'
import type {
  PreLaunchTokenInput,
  LaunchAdvisorReport,
  TickerCandidate,
} from '@/types/kairos.types'
import { audit } from './themis.skill'
import { generateLore } from './mnemon.skill'
import { MnemosyneSkill } from './mnemosyne.skill'
import {
  ADVISOR_WEIGHT_SIMILARITY,
  ADVISOR_WEIGHT_CULTURAL,
  ADVISOR_WEIGHT_TICKER_UNIQUENESS,
  ADVISOR_MIN_TICKER_SUGGESTIONS,
  ADVISOR_MAX_TICKER_SUGGESTIONS,
  AUDIT_CORPUS_SIZE,
} from '@/config/constants'

// ─── MONOLOGUE CALLBACK ────────────────────────────────────────────────────────
type MonologueCallback = (source: string, text: string, level?: string) => void
let monologueCb: MonologueCallback = () => {}
export function setMonologueCallback(cb: MonologueCallback) { monologueCb = cb }
function log(text: string, level = 'INFO') { monologueCb('ADVISOR', text, level) }

// ─── EVENT EMITTER ────────────────────────────────────────────────────────────
type EventHandler = (type: string, payload: unknown) => void
let emitEvent: EventHandler = () => {}
export function setEventEmitter(handler: EventHandler) { emitEvent = handler }

// ─── LEVENSHTEIN (duplicate-free, no cross-skill import) ─────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1]
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

// ─── TICKER UNIQUENESS SCORE ──────────────────────────────────────────────────
async function computeTickerUniqueness(ticker: string): Promise<number> {
  const corpus = await fetchFailureCorpus()
  if (corpus.length === 0) return 80

  const similarities = corpus.map(t => {
    const dist = levenshtein(ticker.toUpperCase(), t.toUpperCase())
    return 1 - dist / Math.max(ticker.length, t.length)
  })

  const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length
  return Math.round((1 - avgSimilarity) * 100)
}

const BASE_FAILURE_CORPUS = [
  'DOGE2', 'SHIB2', 'PEPE2', 'FLOKI2', 'MOONCAT', 'DOGEINU', 'SAFEDOGE', 'ELONDOG',
  'SAFU', 'MOONSHOT', 'MOONROCKET', 'HONEYPOT', 'SQUID', 'SAFEMOON', 'TITANO',
  'BABYDOGE', 'MINIFLOKI', 'SHIBX', 'DOGEKILLER', 'ELONDOGE', 'METADOGE',
]

async function fetchFailureCorpus(): Promise<string[]> {
  const account   = process.env.MEMBASE_ACCOUNT
  const convId    = process.env.MEMBASE_CONVERSATION_ID
  const membaseId = process.env.MEMBASE_ID

  if (!account || !convId || !membaseId) {
    return BASE_FAILURE_CORPUS
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
      body: JSON.stringify({ conversation_id: convId, n: AUDIT_CORPUS_SIZE, type: 'failed_tickers' }),
    })
    if (!res.ok) throw new Error(res.statusText)
    const data = await res.json() as { tickers: string[] }
    // Merge live + base, deduplicate
    return [...new Set([...data.tickers, ...BASE_FAILURE_CORPUS])]
  } catch {
    return BASE_FAILURE_CORPUS
  }
}

// ─── SUCCESSFUL ARCHETYPES ────────────────────────────────────────────────────
const BASE_ARCHETYPES = `Top successful archetypes by graduation rate:
1. Cosmic singularity themes (e.g. VOID, NEXUS) — 73% grad rate
2. Ancient guardian archetypes (e.g. WARD, THRESHOLD) — 68% grad rate
3. Primordial force tokens (e.g. ABYSS, MERIDIAN) — 65% grad rate
4. Silent witness archetypes (e.g. WITNESS, SENTINEL) — 61% grad rate
5. Architect/builder themes (e.g. FORGE, ARCHITECT) — 58% grad rate`

async function fetchTopArchetypes(): Promise<string> {
  const account   = process.env.MEMBASE_ACCOUNT
  const convId    = process.env.MEMBASE_CONVERSATION_ID
  const membaseId = process.env.MEMBASE_ID

  if (!account || !convId || !membaseId) {
    return BASE_ARCHETYPES
  }

  try {
    // TODO: replace with live call — method: membase-mcp get_messages({ conversation_id: convId, n: 20, type: 'successful_archetypes' })
    const res = await fetch(`https://hub.membase.unibase.com/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Membase-Account': account,
        'X-Membase-ID': membaseId,
      },
      body: JSON.stringify({ conversation_id: convId, n: 20, type: 'successful_archetypes' }),
    })
    if (!res.ok) throw new Error(res.statusText)
    const data = await res.json() as { summary: string }
    return `${data.summary}\n\n${BASE_ARCHETYPES}`
  } catch {
    return BASE_ARCHETYPES
  }
}

// ─── TICKER ALTERNATIVES VIA LLM ─────────────────────────────────────────────
async function generateTickerAlternatives(
  ticker: string,
  description: string,
  archetypeContext: string,
  failureCorpus: string[]
): Promise<TickerCandidate[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')

  const client = new Anthropic({ apiKey })

  const prompt = `You are a sovereign meme naming intelligence. Given a proposed token ticker, its description, and a set of historical successful meme archetypes, generate between ${ADVISOR_MIN_TICKER_SUGGESTIONS} and ${ADVISOR_MAX_TICKER_SUGGESTIONS} alternative ticker candidates.

Proposed Ticker: ${ticker}
Description: ${description || 'No description provided.'}

Historical Successful Archetypes:
${archetypeContext}

Known Failure Corpus (avoid similarity to these):
${failureCorpus.slice(0, 30).join(', ')}

Each candidate must:
- Be 2–6 characters, uppercase
- Be deeply original relative to the provided failure corpus
- Carry mythic or archetypal weight — not ironic, not derivative, not a suffix variation of an existing token
- Include a brief sovereignName (the archetype this ticker would become) and one sentence of reasoning
- uniquenessScore: integer 0–100 measuring how distinct this ticker is from the failure corpus

Return ONLY a JSON array of TickerCandidate objects. No preamble. No markdown. Pure JSON array:
[
  {
    "ticker": string,
    "sovereignName": string,
    "reasoning": string,
    "uniquenessScore": number
  }
]`

  const parseAlternatives = (raw: string): TickerCandidate[] => {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    const parsed = JSON.parse(cleaned) as TickerCandidate[]
    if (!Array.isArray(parsed)) throw new Error('Expected JSON array')
    return parsed.slice(0, ADVISOR_MAX_TICKER_SUGGESTIONS)
  }

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = message.content[0].type === 'text' ? message.content[0].text : '[]'
    return parseAlternatives(raw)
  } catch (firstErr) {
    log(`Ticker generation first attempt failed: ${(firstErr as Error).message}. Retrying...`, 'WARN')
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = message.content[0].type === 'text' ? message.content[0].text : '[]'
    return parseAlternatives(raw)
  }
}

// ─── MAIN ANALYZE FUNCTION ────────────────────────────────────────────────────
export async function analyze(input: PreLaunchTokenInput): Promise<LaunchAdvisorReport> {
  const ticker = input.ticker.toUpperCase()

  emitEvent('PRELAUNCH_ANALYSIS_STARTED', { ticker })
  log(`Receiving proposed concept: ${ticker}...`)

  // ─── THEMIS AUDIT ──────────────────────────────────────────────────────
  log(`Initiating Themis audit for ${ticker}...`)
  const auditReport = await audit(input)
  emitEvent('PRELAUNCH_AUDIT_COMPLETE', auditReport)

  if (auditReport.verdict === 'ABORT') {
    log(`High similarity detected (${auditReport.similarityScore}/100). Flagging HIGH risk. Continuing advisory mode.`, 'WARN')
  }

  // ─── MNEMON LORE ───────────────────────────────────────────────────────
  log(`Accessing the Membase annals...`)
  const lore = await generateLore(input, auditReport.similarityScore)
  emitEvent('PRELAUNCH_LORE_READY', lore)

  // ─── ARCHETYPE CONTEXT ─────────────────────────────────────────────────
  log(`Consulting successful graduation archetypes...`)
  const archetypeContext = await fetchTopArchetypes()

  // ─── TICKER ALTERNATIVES ───────────────────────────────────────────────
  log(`Forging ticker alternatives...`)
  const failureCorpus = await fetchFailureCorpus()
  const suggestedTickers = await generateTickerAlternatives(
    ticker,
    input.description,
    archetypeContext,
    failureCorpus
  )

  // ─── SCORING ───────────────────────────────────────────────────────────
  log(`Measuring memetic strength...`)
  const tickerUniqueness = await computeTickerUniqueness(ticker)

  log(`Calculating success probability...`)
  const successProbability = Math.min(100, Math.round(
    (100 - auditReport.similarityScore) * ADVISOR_WEIGHT_SIMILARITY +
    lore.culturalScore * ADVISOR_WEIGHT_CULTURAL +
    tickerUniqueness * ADVISOR_WEIGHT_TICKER_UNIQUENESS
  ))

  const riskLevel: LaunchAdvisorReport['riskLevel'] =
    successProbability >= 70 ? 'LOW'
    : successProbability >= 40 ? 'MEDIUM'
    : 'HIGH'

  const originalityScore = Math.round((100 - auditReport.similarityScore + tickerUniqueness) / 2)

  const report: LaunchAdvisorReport = {
    originalTicker: ticker,
    originalityScore,
    similarityScore: auditReport.similarityScore,
    culturalStrength: lore.culturalScore,
    tickerUniqueness,
    riskLevel,
    successProbability,
    suggestedTickers,
    suggestedName: lore.sovereignName,
    generatedLore: lore,
    advisorGeneratedAt: new Date(),
  }

  // ─── ARCHIVE ───────────────────────────────────────────────────────────
  const mnemosyne = MnemosyneSkill.getInstance()
  await mnemosyne.archiveAdvisorReport(report)

  emitEvent('PRELAUNCH_REPORT_READY', report)
  log(`Report complete. The engine has spoken.`, 'SUCCESS')

  return report
}
