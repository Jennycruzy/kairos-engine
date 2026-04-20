import Anthropic from '@anthropic-ai/sdk'
import type { TokenDNA, PreLaunchTokenInput, MimeticLore } from '@/types/kairos.types'

// ─── MONOLOGUE CALLBACK ────────────────────────────────────────────────────────
type MonologueCallback = (source: string, text: string, level?: string) => void
let monologueCb: MonologueCallback = () => {}
export function setMonologueCallback(cb: MonologueCallback) { monologueCb = cb }
function log(text: string, level = 'INFO') { monologueCb('MNEMON', text, level) }

class MnemonError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MnemonError'
  }
}

// ─── BASE ARCHETYPE CONTEXT ───────────────────────────────────────────────────
const BASE_ARCHETYPE_CONTEXT = `Historical meme archetypes: The Watcher, The Wanderer, The Architect, The Witness, The Threshold, The Meridian. Successful tokens carry mythic singularity — not irony, not derivative reference, but genuine archetypal gravity. Threshold Guardians, Cosmic Wanderers, Silent Titans, Primordial Architects, and Void Witnesses all show strong graduation rates. Patterns that emphasize mythic weight and singular identity outperform derivative or ironic concepts by 3:1.`

// ─── MEMBASE CONTEXT FETCH ────────────────────────────────────────────────────
async function fetchMembaseContext(ticker: string): Promise<string> {
  const account   = process.env.MEMBASE_ACCOUNT
  const convId    = process.env.MEMBASE_CONVERSATION_ID
  const membaseId = process.env.MEMBASE_ID

  if (!account || !convId || !membaseId) {
    return BASE_ARCHETYPE_CONTEXT
  }

  try {
    // TODO: replace with live call — method: membase-mcp get_messages({ conversation_id: convId, n: 10 })
    const res = await fetch(`https://hub.membase.unibase.com/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Membase-Account': account,
        'X-Membase-ID': membaseId,
      },
      body: JSON.stringify({ conversation_id: convId, n: 10, filter: ticker }),
    })
    if (!res.ok) throw new Error(res.statusText)
    const data = await res.json() as { messages: Array<{ content: string }> }
    const liveContext = data.messages.map(m => m.content).join('\n')
    return `${liveContext}\n\n${BASE_ARCHETYPE_CONTEXT}`
  } catch (err) {
    log(`Membase context fetch failed: ${(err as Error).message}. Using base archetype context.`, 'WARN')
    return BASE_ARCHETYPE_CONTEXT
  }
}

// ─── LLM LORE GENERATION ─────────────────────────────────────────────────────
async function callLLM(
  ticker: string,
  description: string,
  membaseContext: string,
  culturalScore?: number
): Promise<MimeticLore> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new MnemonError('ANTHROPIC_API_KEY is not set')

  const client = new Anthropic({ apiKey })

  const prompt = `You are a sovereign lore engine for chain-aware meme tokens. Generate mythic identity for this token.

Token Ticker: ${ticker}
Description: ${description || 'No description provided.'}
${culturalScore !== undefined ? `Provided Cultural Score: ${culturalScore}` : ''}

Historical Archetype Context from Membase:
${membaseContext}

Rules:
- sovereignName: mythic, ancient-sounding, no pop culture, no irony, no lightness. Max 7 words.
- archetype: the timeless role this entity plays (e.g. "The Threshold Guardian", "The Silent Titan")
- loreParagraph: 3–5 sentences in the register of ancient chronicles or classical tragedy. Dense. Earned. No clichés.
- historicalQuote: sounds as if written by a long-dead philosopher, general, or oracle. Heavy. Earned. Not decorative. 1–3 sentences.
- quoteAttribution: fictional but plausible ancient source. Format: "From the [Title], [context], [era/epoch]"
- culturalScore: integer 0–100 measuring mythic resonance and archetypal depth${culturalScore !== undefined ? ` (calibrate near ${culturalScore})` : ''}

Return ONLY valid JSON matching this exact shape. No preamble. No markdown. No backticks. Pure JSON:
{
  "sovereignName": string,
  "archetype": string,
  "loreParagraph": string,
  "historicalQuote": string,
  "quoteAttribution": string,
  "culturalScore": number
}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  return parseLore(raw)
}

function parseLore(raw: string): MimeticLore {
  // Strip any accidental markdown fencing
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  const parsed = JSON.parse(cleaned) as MimeticLore

  // Validate required fields
  const required: (keyof MimeticLore)[] = [
    'sovereignName', 'archetype', 'loreParagraph',
    'historicalQuote', 'quoteAttribution', 'culturalScore'
  ]
  for (const field of required) {
    if (parsed[field] === undefined) throw new Error(`Missing field: ${field}`)
  }

  return parsed
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────
export async function generateLore(
  input: TokenDNA | PreLaunchTokenInput,
  auditScore?: number
): Promise<MimeticLore> {
  const ticker = input.ticker.toUpperCase()
  const description = input.description || ''

  log(`Accessing the Membase annals for ${ticker}...`)
  const membaseContext = await fetchMembaseContext(ticker)

  log(`Generating sovereign archetype for ${ticker}...`)

  try {
    const lore = await callLLM(ticker, description, membaseContext, auditScore)
    log(`Sovereign identity forged: "${lore.sovereignName}" (${lore.archetype})`, 'SUCCESS')
    return lore
  } catch (firstErr) {
    log(`First lore generation attempt failed: ${(firstErr as Error).message}. Retrying...`, 'WARN')
    try {
      const lore = await callLLM(ticker, description, membaseContext, auditScore)
      log(`Sovereign identity forged on retry: "${lore.sovereignName}"`, 'SUCCESS')
      return lore
    } catch (secondErr) {
      throw new MnemonError(`Lore generation failed after two attempts: ${(secondErr as Error).message}`)
    }
  }
}
