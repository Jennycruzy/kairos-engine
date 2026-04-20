// ─── MODE B — GRADUATION DETECTION ───────────────────────────────────────────
export const GRADUATION_THRESHOLD_BNB = 17.5
export const GRADUATION_TARGET_BNB = 18

// ─── SHARED — SIMILARITY SCORING ─────────────────────────────────────────────
export const SIMILARITY_ABORT_THRESHOLD = 90
export const SIMILARITY_CAUTION_THRESHOLD = 50
export const AUDIT_CORPUS_SIZE = 500

// ─── MODE A — LAUNCH ADVISOR SCORING WEIGHTS ─────────────────────────────────
export const ADVISOR_WEIGHT_SIMILARITY = 0.4
export const ADVISOR_WEIGHT_CULTURAL = 0.4
export const ADVISOR_WEIGHT_TICKER_UNIQUENESS = 0.2
export const ADVISOR_MIN_TICKER_SUGGESTIONS = 3
export const ADVISOR_MAX_TICKER_SUGGESTIONS = 5

// ─── UI ───────────────────────────────────────────────────────────────────────
export const MONOLOGUE_CHAR_DELAY_MS = 15
export const SKILL_INJECT_LINE_DELAY_MS = 400

// ─── HERMES — RATE LIMITING ───────────────────────────────────────────────────
export const CAST_RATE_LIMIT_PER_MINUTE = 3

// ─── GREENFIELD ───────────────────────────────────────────────────────────────
export const GREENFIELD_BUCKET = 'kairos-protocol'
export const GREENFIELD_RECORDS_PREFIX = 'kairos-records'
export const GREENFIELD_ABORTS_PREFIX = 'kairos-aborts'
export const GREENFIELD_ADVISOR_PREFIX = 'kairos-advisor-reports'
export const GREENFIELD_IDENTITY_PREFIX = 'kairos-agent-identity'

// ─── CHAIN ────────────────────────────────────────────────────────────────────
export const BNB_CHAIN_ID = 56
export const BNB_RPC_URL = 'https://bsc-dataseed.binance.org/'
export const ENGINE_VERSION = '2.0.0'
export const ENGINE_MODE_A = 'PRE_LAUNCH'
export const ENGINE_MODE_B = 'POST_LAUNCH'

// ─── ERC-8004 AGENT IDENTITY ──────────────────────────────────────────────────
export const ERC8004_REGISTRY_ADDRESS_BNB = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const
export const ERC8004_REGISTRY_ADDRESS_BASE = '0x' as const  // TODO: replace with deployed registry on Base
export const AGENT_METADATA_VERSION = '2.0.0'
export const AGENT_NAME = 'KAIRÓS Engine'

// ─── BNB CHAIN EXPLORER ───────────────────────────────────────────────────────
export const BNB_EXPLORER_URL = 'https://bscscan.com'
