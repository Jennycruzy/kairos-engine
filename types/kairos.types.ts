// ─── CORE TOKEN TYPES ─────────────────────────────────────────────────────────

export interface TokenDNA {
  address: string
  ticker: string
  name: string
  bondingProgress: number         // 0–18 BNB; graduation threshold at 17.5
  bondingPercent: number          // 0–100
  createdAt: string
  deployerAddress: string
  description?: string
  imageUrl?: string
}

export interface BondingCurveSnapshot {
  currentBNB: number
  targetBNB: number
  percentComplete: number
  estimatedTimeToGrad?: number    // seconds, linear projection
  priceUSD?: number
}

export interface GraduationAlert {
  token: TokenDNA
  triggeredAt: Date
  bondingSnapshot: BondingCurveSnapshot
}

// ─── ERC-8004 AGENT IDENTITY TYPES ───────────────────────────────────────────

export interface AgentIdentityRecord {
  agentId: string                 // ERC-8004 on-chain agent ID (bytes32 hex)
  ownerAddress: string            // EOA that registered this agent
  metadataURI: string             // IPFS or Greenfield URI pointing to AgentMetadata
  registeredAt: Date
  chainId: number                 // 56 for BNB Chain
  txHash: string                  // Registration transaction hash
}

export interface AgentMetadata {
  name: string                    // e.g. "KAIRÓS Engine v2"
  version: string                 // e.g. "2.0.0"
  description: string
  skills: string[]                // List of injected skill names
  operatorAddress: string
  engineMode: 'PRE_LAUNCH' | 'POST_LAUNCH' | 'DUAL'
  createdAt: string               // ISO timestamp
  greenfieldArchiveBucket: string
  farcasterSignerUuid: string
}

export interface AgentRegistrationRequest {
  metadata: AgentMetadata
  ownerAddress: string
  privateKey: string              // Signs the registration tx — from env only, never logged
}

export interface AgentResolutionResult {
  agentId: string
  metadata: AgentMetadata
  isActive: boolean
  registeredAt: Date
  skillManifest: AgentSkillManifest
}

// ─── LORE & CULTURE TYPES ─────────────────────────────────────────────────────

export interface MimeticLore {
  sovereignName: string
  archetype: string
  loreParagraph: string
  historicalQuote: string
  quoteAttribution: string
  culturalScore: number
}

export interface AuditReport {
  tokenAddress: string
  similarityScore: number
  closestMatchTicker?: string
  closestMatchAddress?: string
  verdict: 'CLEAR' | 'CAUTION' | 'ABORT'
  riskFlags: string[]
  auditedAt: Date
}

export interface ArchiveReceipt {
  objectId: string
  contentHash: string
  objectKey: string
  archivedAt: Date
}

// ─── PRE-LAUNCH ADVISORY TYPES ────────────────────────────────────────────────

export interface PreLaunchTokenInput {
  ticker: string
  name?: string
  description: string
  proposedImageUrl?: string
  creatorAddress?: string
}

export interface TickerCandidate {
  ticker: string
  sovereignName: string
  reasoning: string
  uniquenessScore: number
}

export interface LaunchAdvisorReport {
  originalTicker: string
  originalityScore: number
  similarityScore: number
  culturalStrength: number
  tickerUniqueness: number
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  successProbability: number
  suggestedTickers: TickerCandidate[]
  suggestedName?: string
  generatedLore: MimeticLore
  advisorGeneratedAt: Date
}

// ─── EVENT SYSTEM TYPES ───────────────────────────────────────────────────────

export type KairosEventType =
  | 'GRADUATION_ALERT'
  | 'LORE_READY'
  | 'AUDIT_COMPLETE'
  | 'BROADCAST_SUCCESS'
  | 'ARCHIVE_SUCCESS'
  | 'ABORT'
  | 'PRELAUNCH_ANALYSIS_STARTED'
  | 'PRELAUNCH_AUDIT_COMPLETE'
  | 'PRELAUNCH_LORE_READY'
  | 'PRELAUNCH_REPORT_READY'
  | 'AGENT_REGISTERED'
  | 'AGENT_RESOLVED'
  | 'SKILL_INJECTED'
  | 'ENGINE_READY'
  | 'MONOLOGUE'

export interface KairosEvent {
  type: KairosEventType
  payload: unknown
  timestamp: Date
  skillSource: string
  mode: 'PRE_LAUNCH' | 'POST_LAUNCH' | 'SYSTEM'
  agentId?: string                // ERC-8004 agent ID that emitted this event
}

export interface MonologueLine {
  source: 'KAIROS' | 'ARGOS' | 'THEMIS' | 'MNEMON' | 'HERMES' | 'MNEMOSYNE' | 'ADVISOR' | 'IDENTITY' | 'SYSTEM'
  text: string
  level: 'INFO' | 'SUCCESS' | 'WARN' | 'ABORT'
  timestamp: Date
}

// ─── SKILL & AGENT TYPES ──────────────────────────────────────────────────────

export interface SkillConfig {
  enabled: boolean
  priority: number
  timeout: number
}

export interface AgentSkillManifest {
  agentId: string                 // ERC-8004 on-chain agent ID
  agentIdentityRecord?: AgentIdentityRecord
  injectedSkills: string[]
  activeAt: Date
  status: 'LOADING' | 'ACTIVE' | 'PAUSED' | 'ERROR'
}

export interface KairosRecord {
  tokenAddress: string
  ticker: string
  graduationSnapshot: BondingCurveSnapshot
  mimeticLore: MimeticLore
  auditReport: AuditReport
  broadcastResult: { castHash: string; frameUrl: string }
  pipelineCompletedAt: Date
  engineVersion: string
  agentId: string                 // ERC-8004 agent ID that processed this record
}

export interface BroadcastResult {
  castHash: string
  frameUrl: string
  publishedAt: Date
}

export interface EngineStatus {
  agentId: string
  agentIdentityRecord?: AgentIdentityRecord
  mode: string
  activeTokens: number
  advisorSessionActive: boolean
  uptime: number
}
