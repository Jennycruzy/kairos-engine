'use client'

import React, {
  useState, useEffect, useRef, useCallback, useMemo
} from 'react'
import type {
  MonologueLine,
  LaunchAdvisorReport,
  KairosRecord,
  AgentIdentityRecord,
  TickerCandidate,
} from '@/types/kairos.types'

// ─── SOURCE COLOR MAP ─────────────────────────────────────────────────────────
const SOURCE_COLORS: Record<MonologueLine['source'], string> = {
  KAIROS:    '#e8e8e8',
  ARGOS:     '#60a5fa',
  THEMIS:    '#4ade80',
  MNEMON:    '#c084fc',
  HERMES:    '#2dd4bf',
  MNEMOSYNE: '#9ca3af',
  ADVISOR:   '#fb923c',
  IDENTITY:  '#fcd34d',
  SYSTEM:    '#6b7280',
  AGORA:     '#f472b6',
}

function levelColor(level: MonologueLine['level'], source: MonologueLine['source']): string {
  if (level === 'ABORT') return '#f87171'
  if (level === 'WARN' && source === 'THEMIS') return '#fbbf24'
  if (level === 'SUCCESS') return SOURCE_COLORS[source]
  return SOURCE_COLORS[source]
}

function truncateAgentId(id: string): string {
  if (!id || id.length < 10) return id
  return `${id.slice(0, 6)}…${id.slice(-4)}`
}

// ─── SCORE RING ───────────────────────────────────────────────────────────────
function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const r = (size - 16) / 2
  const circ = 2 * Math.PI * r
  const fill = circ * (1 - score / 100)

  const color = score >= 70 ? '#4ade80' : score >= 40 ? '#fbbf24' : '#f87171'
  const glow = score >= 70
    ? '0 0 20px rgba(74,222,128,0.5)'
    : score >= 40
    ? '0 0 20px rgba(251,191,36,0.5)'
    : '0 0 20px rgba(248,113,113,0.5)'

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', filter: `drop-shadow(${glow})` }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1a1a1a" strokeWidth={8} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={circ} strokeDashoffset={fill}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold" style={{ color }}>{score}</span>
        <span className="text-[10px]" style={{ color: '#6b7280' }}>SCORE</span>
      </div>
    </div>
  )
}

// ─── METRIC BAR ───────────────────────────────────────────────────────────────
function MetricBar({
  label, value, color, max = 100
}: { label: string; value: number; color: string; max?: number }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span style={{ color: '#9ca3af' }}>{label}</span>
        <span style={{ color }}>{value}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#1a1a1a' }}>
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}88, ${color})`,
            boxShadow: `0 0 8px ${color}66`,
          }}
        />
      </div>
    </div>
  )
}

// ─── VERDICT BADGE ────────────────────────────────────────────────────────────
function VerdictBadge({ verdict }: { verdict: 'CLEAR' | 'CAUTION' | 'ABORT' }) {
  const config = {
    CLEAR:   { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.3)'  },
    CAUTION: { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.3)'  },
    ABORT:   { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)' },
  }[verdict]
  return (
    <span
      className="text-xs px-2 py-0.5 rounded font-semibold tracking-wider"
      style={{ color: config.color, background: config.bg, border: `1px solid ${config.border}` }}
    >
      {verdict}
    </span>
  )
}

// ─── RISK BADGE ───────────────────────────────────────────────────────────────
function RiskBadge({ level }: { level: 'LOW' | 'MEDIUM' | 'HIGH' }) {
  const config = {
    LOW:    { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.3)'  },
    MEDIUM: { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.3)'  },
    HIGH:   { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)' },
  }[level]
  return (
    <span
      className="text-xs px-2 py-0.5 rounded font-semibold tracking-wider"
      style={{ color: config.color, background: config.bg, border: `1px solid ${config.border}` }}
    >
      {level} RISK
    </span>
  )
}

// ─── ENGINE STATUS PILL ───────────────────────────────────────────────────────
type EngineState = 'BOOTING' | 'INJECTING' | 'SCANNING' | 'PROCESSING' | 'IDLE'
function StatusPill({ state }: { state: EngineState }) {
  const config: Record<EngineState, { color: string; bg: string; pulse: boolean }> = {
    BOOTING:    { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)',  pulse: true },
    INJECTING:  { color: '#c084fc', bg: 'rgba(192,132,252,0.15)', pulse: true },
    SCANNING:   { color: '#60a5fa', bg: 'rgba(96,165,250,0.15)',  pulse: true },
    PROCESSING: { color: '#fb923c', bg: 'rgba(251,146,60,0.15)',  pulse: true },
    IDLE:       { color: '#6b7280', bg: 'rgba(107,114,128,0.1)',  pulse: false },
  }
  const { color, bg, pulse } = config[state]
  return (
    <div className="flex items-center gap-2 px-3 py-1 rounded text-xs font-semibold" style={{ background: bg, border: `1px solid ${color}33` }}>
      <span
        className={`w-1.5 h-1.5 rounded-full ${pulse ? 'animate-pulse' : ''}`}
        style={{ background: color, boxShadow: `0 0 6px ${color}` }}
      />
      <span style={{ color }}>{state}</span>
    </div>
  )
}

// ─── IDENTITY CHIP ────────────────────────────────────────────────────────────
function IdentityChip({
  record,
  status,
}: {
  record?: AgentIdentityRecord
  status: 'active' | 'resolving' | 'unregistered'
}) {
  const [copied, setCopied] = useState(false)
  const color = status === 'active' ? '#4ade80' : status === 'resolving' ? '#fbbf24' : '#f87171'
  const bg = status === 'active' ? 'rgba(74,222,128,0.08)' : status === 'resolving' ? 'rgba(251,191,36,0.08)' : 'rgba(248,113,113,0.08)'

  const copy = async () => {
    if (record?.agentId) {
      await navigator.clipboard.writeText(record.agentId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const explorerUrl = record?.txHash && record.txHash !== '0x' + '0'.repeat(64)
    ? `https://bscscan.com/tx/${record.txHash}`
    : null

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded text-xs"
      style={{ background: bg, border: `1px solid ${color}33` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 5px ${color}` }} />
      <span style={{ color: '#6b7280' }}>ERC-8004</span>
      <span style={{ color }} className="font-semibold">
        {record?.agentId ? truncateAgentId(record.agentId) : status.toUpperCase()}
      </span>
      {record?.agentId && (
        <button
          onClick={copy}
          className="text-xs transition-opacity hover:opacity-100 opacity-50"
          style={{ color: '#9ca3af' }}
          title="Copy agent ID"
        >
          {copied ? '✓' : '⎘'}
        </button>
      )}
      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="opacity-50 hover:opacity-100 transition-opacity"
          style={{ color: '#9ca3af' }}
          title="View on BscScan"
        >
          ↗
        </a>
      )}
    </div>
  )
}

// ─── MONOLOGUE PANEL ─────────────────────────────────────────────────────────
function MonologuePanel({
  lines, onClear,
}: {
  lines: MonologueLine[]
  onClear: () => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines.length])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: '#1a1a1a' }}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" style={{ boxShadow: '0 0 6px #4ade80' }} />
          <span className="text-xs font-semibold tracking-widest" style={{ color: '#4ade80' }}>MONOLOGUE STREAM</span>
        </div>
        <button
          onClick={onClear}
          className="text-xs px-2 py-0.5 rounded transition-all hover:bg-white/5"
          style={{ color: '#6b7280', border: '1px solid #222' }}
        >
          CLEAR LOG
        </button>
      </div>

      <div
        className="flex-1 overflow-y-auto p-4 space-y-0.5 crt-grid"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', lineHeight: '1.7' }}
      >
        {lines.length === 0 && (
          <div className="text-center py-12" style={{ color: '#333' }}>
            <div className="text-2xl mb-2">◈</div>
            <div>Awaiting engine boot sequence...</div>
          </div>
        )}

        {lines.map((line, i) => (
          <div
            key={i}
            className="flex gap-2 type-in"
            style={{ opacity: 0, animationDelay: `${Math.min(i * 10, 200)}ms`, animationFillMode: 'forwards' }}
          >
            <span className="shrink-0" style={{ color: '#333' }}>
              {new Date(line.timestamp).toISOString().slice(11, 23)}
            </span>
            <span
              className="shrink-0 font-semibold w-11"
              style={{ color: levelColor(line.level, line.source) }}
            >
              [{line.source.slice(0, 7).padEnd(7)}]
            </span>
            <span style={{ color: levelColor(line.level, line.source) }}>
              {line.text}
            </span>
          </div>
        ))}

        <div className="cursor-blink text-xs" style={{ color: '#4ade80' }} />
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ─── ADVISOR REPORT PANEL ─────────────────────────────────────────────────────
function AdvisorReportPanel({ report }: { report: LaunchAdvisorReport }) {
  return (
    <div className="h-full overflow-y-auto space-y-4 p-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-wide" style={{ color: '#fb923c' }}>
            {report.originalTicker}
          </span>
          <RiskBadge level={report.riskLevel} />
        </div>
        <p className="text-xs" style={{ color: '#6b7280' }}>Launch Intelligence Report</p>
      </div>

      {/* Score Ring + Key Metrics */}
      <div className="flex items-center gap-4">
        <ScoreRing score={report.successProbability} size={100} />
        <div className="flex-1 space-y-3">
          <MetricBar label="Cultural Strength" value={report.culturalStrength} color="#c084fc" />
          <MetricBar label="Originality Score" value={report.originalityScore} color="#2dd4bf" />
          <MetricBar label="Ticker Uniqueness" value={report.tickerUniqueness} color="#60a5fa" />
          <MetricBar label="Similarity Risk" value={report.similarityScore} color="#f87171" />
        </div>
      </div>

      <div className="h-px" style={{ background: '#1a1a1a' }} />

      {/* Lore */}
      <div
        className="p-3 rounded space-y-2"
        style={{ background: 'rgba(192,132,252,0.05)', border: '1px solid rgba(192,132,252,0.15)' }}
      >
        <div className="text-xs font-semibold tracking-widest" style={{ color: '#c084fc' }}>
          SOVEREIGN IDENTITY — {report.generatedLore.archetype.toUpperCase()}
        </div>
        <div className="text-sm font-semibold" style={{ color: '#e8e8e8' }}>
          {report.generatedLore.sovereignName}
        </div>
        <p className="text-xs leading-relaxed" style={{ color: '#9ca3af' }}>
          {report.generatedLore.loreParagraph}
        </p>
        <blockquote
          className="text-xs italic border-l-2 pl-3 mt-2"
          style={{ color: '#c084fc', borderColor: '#c084fc44' }}
        >
          &ldquo;{report.generatedLore.historicalQuote}&rdquo;
          <footer className="text-xs not-italic mt-1" style={{ color: '#6b7280' }}>
            — {report.generatedLore.quoteAttribution}
          </footer>
        </blockquote>
      </div>

      <div className="h-px" style={{ background: '#1a1a1a' }} />

      {/* Ticker Suggestions */}
      <div className="space-y-2">
        <div className="text-xs font-semibold tracking-widest" style={{ color: '#fb923c' }}>
          SOVEREIGN ALTERNATIVES
        </div>
        <div className="space-y-2">
          {report.suggestedTickers.map((candidate, i) => (
            <TickerCard key={i} candidate={candidate} rank={i + 1} />
          ))}
        </div>
      </div>
    </div>
  )
}

function TickerCard({ candidate, rank }: { candidate: TickerCandidate; rank: number }) {
  return (
    <div
      className="p-3 rounded space-y-1 fade-in-up"
      style={{
        background: '#0d0d0d',
        border: '1px solid #1a1a1a',
        animationDelay: `${rank * 100}ms`,
        opacity: 0,
        animationFillMode: 'forwards',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: '#333' }}>#{rank}</span>
          <span className="font-bold text-sm" style={{ color: '#fb923c' }}>{candidate.ticker}</span>
          <span className="text-xs" style={{ color: '#9ca3af' }}>— {candidate.sovereignName}</span>
        </div>
        <span className="text-xs" style={{ color: '#4ade80' }}>{candidate.uniquenessScore}%</span>
      </div>
      <p className="text-xs" style={{ color: '#6b7280' }}>{candidate.reasoning}</p>
    </div>
  )
}

// ─── GRADUATION RECORD PANEL ─────────────────────────────────────────────────
function GraduationPanel({ record }: { record: KairosRecord }) {
  return (
    <div className="h-full overflow-y-auto space-y-4 p-4">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-wide" style={{ color: '#4ade80' }}>
            {record.ticker}
          </span>
          <VerdictBadge verdict={record.auditReport.verdict} />
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{ color: '#4ade80', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)' }}
          >
            GRADUATED
          </span>
        </div>
        <p className="text-xs truncate" style={{ color: '#333' }}>{record.tokenAddress}</p>
      </div>

      {/* Bonding curve */}
      <div
        className="p-3 rounded space-y-2"
        style={{ background: 'rgba(96,165,250,0.05)', border: '1px solid rgba(96,165,250,0.15)' }}
      >
        <div className="flex justify-between text-xs">
          <span style={{ color: '#60a5fa' }}>BONDING CURVE</span>
          <span style={{ color: '#4ade80' }}>{record.graduationSnapshot.percentComplete.toFixed(1)}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: '#111' }}>
          <div
            className="h-full rounded-full shimmer"
            style={{
              width: `${record.graduationSnapshot.percentComplete}%`,
              background: 'linear-gradient(90deg, #1d4ed8, #60a5fa)',
              boxShadow: '0 0 8px rgba(96,165,250,0.5)',
              transition: 'width 1.5s ease-out',
            }}
          />
        </div>
        <div className="flex justify-between text-xs" style={{ color: '#6b7280' }}>
          <span>{record.graduationSnapshot.currentBNB.toFixed(3)} BNB</span>
          <span>{record.graduationSnapshot.targetBNB} BNB target</span>
        </div>
      </div>

      {/* Lore */}
      <div
        className="p-3 rounded space-y-2"
        style={{ background: 'rgba(192,132,252,0.05)', border: '1px solid rgba(192,132,252,0.15)' }}
      >
        <div className="text-xs font-semibold tracking-widest" style={{ color: '#c084fc' }}>
          {record.mimeticLore.archetype.toUpperCase()}
        </div>
        <div className="text-sm font-semibold" style={{ color: '#e8e8e8' }}>
          {record.mimeticLore.sovereignName}
        </div>
        <p className="text-xs leading-relaxed" style={{ color: '#9ca3af' }}>
          {record.mimeticLore.loreParagraph}
        </p>
        <blockquote
          className="text-xs italic border-l-2 pl-3"
          style={{ color: '#c084fc', borderColor: '#c084fc44' }}
        >
          &ldquo;{record.mimeticLore.historicalQuote}&rdquo;
          <footer className="text-xs not-italic mt-1" style={{ color: '#6b7280' }}>
            — {record.mimeticLore.quoteAttribution}
          </footer>
        </blockquote>
      </div>

      {/* Links */}
      <div className="flex gap-2">
        {record.broadcastResult.castHash && record.broadcastResult.castHash !== '0x' && (
          <a
            href={`https://warpcast.com/~/cast/${record.broadcastResult.castHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 rounded transition-all hover:opacity-80"
            style={{ color: '#2dd4bf', background: 'rgba(45,212,191,0.1)', border: '1px solid rgba(45,212,191,0.2)' }}
          >
            ↗ Farcaster Cast
          </a>
        )}
        <a
          href={`https://four.meme/token/${record.tokenAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs px-3 py-1.5 rounded transition-all hover:opacity-80"
          style={{ color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}
        >
          ↗ Four.Meme
        </a>
      </div>

      {/* Agent ID footer */}
      <div className="pt-2 text-xs" style={{ color: '#333', borderTop: '1px solid #111' }}>
        Processed by agent {truncateAgentId(record.agentId)} · v{record.engineVersion}
      </div>
    </div>
  )
}

// ─── INPUT PANEL ─────────────────────────────────────────────────────────────
function InputPanel({
  onAnalyze,
  loading,
}: {
  onAnalyze: (input: { ticker: string; name: string; description: string }) => void
  loading: boolean
}) {
  const [ticker, setTicker] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!ticker.trim() || !description.trim()) return
    onAnalyze({ ticker: ticker.trim(), name: name.trim(), description: description.trim() })
  }

  const inputClass = "w-full bg-transparent text-sm px-3 py-2 rounded outline-none transition-all focus:ring-1"
  const inputStyle = {
    color: '#e8e8e8',
    background: '#0d0d0d',
    border: '1px solid #1f1f1f',
    fontFamily: 'var(--font-mono)',
  }
  const focusStyle = { '--ring-color': '#fb923c' }

  return (
    <div
      className="p-4 rounded space-y-3"
      style={{ background: '#0a0a0a', border: '1px solid #1a1a1a' }}
    >
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#fb923c', boxShadow: '0 0 5px #fb923c' }} />
        <span className="text-xs font-semibold tracking-widest" style={{ color: '#fb923c' }}>LAUNCH ADVISOR</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>TICKER *</label>
            <input
              type="text"
              value={ticker}
              onChange={e => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g. KRNOS"
              maxLength={6}
              required
              className={inputClass}
              style={inputStyle}
              disabled={loading}
            />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>NAME</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Token name"
              className={inputClass}
              style={inputStyle}
              disabled={loading}
            />
          </div>
        </div>

        <div>
          <label className="text-xs mb-1 block" style={{ color: '#6b7280' }}>DESCRIPTION *</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Describe the concept, theme, and archetypal vision..."
            rows={3}
            required
            className={`${inputClass} resize-none`}
            style={inputStyle}
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          disabled={loading || !ticker.trim() || !description.trim()}
          className="w-full py-2.5 rounded text-xs font-bold tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: loading ? 'rgba(251,146,60,0.1)' : 'rgba(251,146,60,0.15)',
            color: '#fb923c',
            border: '1px solid rgba(251,146,60,0.3)',
            boxShadow: loading ? 'none' : '0 0 12px rgba(251,146,60,0.15)',
          }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">◎</span>
              ANALYZING...
            </span>
          ) : (
            'ANALYZE BEFORE LAUNCH ↗'
          )}
        </button>
      </form>
    </div>
  )
}

// ─── MAIN DASHBOARD ───────────────────────────────────────────────────────────
export default function TerminalDashboard() {
  const [engineState, setEngineState] = useState<EngineState>('IDLE')
  const [agentRecord, setAgentRecord] = useState<AgentIdentityRecord | undefined>()
  const [agentStatus, setAgentStatus] = useState<'active' | 'resolving' | 'unregistered'>('unregistered')
  const [mode, setMode] = useState<'ADVISOR' | 'DETECTOR'>('ADVISOR')
  const [panelView, setPanelView] = useState<'advisor' | 'graduation'>('advisor')
  const [lines, setLines] = useState<MonologueLine[]>([])
  const [advisorReport, setAdvisorReport] = useState<LaunchAdvisorReport | null>(null)
  const [graduationRecord, setGraduationRecord] = useState<KairosRecord | null>(null)
  const [advisorLoading, setAdvisorLoading] = useState(false)
  const [isBooted, setIsBooted] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll monologue + engine status
  const pollEngine = useCallback(async () => {
    try {
      const [mRes, sRes] = await Promise.all([
        fetch('/api/monologue'),
        fetch('/api/engine-status'),
      ])
      if (mRes.ok) {
        const { lines: newLines } = await mRes.json() as { lines: MonologueLine[] }
        setLines(newLines)
      }
      if (sRes.ok) {
        const status = await sRes.json() as {
          agentId: string
          agentIdentityRecord?: AgentIdentityRecord
          activeTokens: number
          advisorSessionActive: boolean
        }
        if (status.agentId) {
          setAgentRecord(status.agentIdentityRecord)
          setAgentStatus('active')
          setIsBooted(true)
        }
        if (status.activeTokens > 0) setEngineState('PROCESSING')
        else if (status.advisorSessionActive) setEngineState('PROCESSING')
        else if (isBooted) setEngineState('SCANNING')
      }
    } catch { /* network errors during boot */ }
  }, [isBooted])

  useEffect(() => {
    pollRef.current = setInterval(pollEngine, 1500)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [pollEngine])

  // Boot the engine
  const handleBoot = async () => {
    setEngineState('BOOTING')
    setAgentStatus('resolving')
    try {
      const res = await fetch('/api/boot', { method: 'POST' })
      if (res.ok) {
        setEngineState('INJECTING')
        // Polling will pick up SCANNING state after boot completes
      }
    } catch (err) {
      console.error('Boot error:', err)
      setEngineState('IDLE')
    }
  }

  // Run advisor
  const handleAnalyze = async (input: { ticker: string; name: string; description: string }) => {
    setAdvisorLoading(true)
    setMode('ADVISOR')
    setEngineState('PROCESSING')
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const data = await res.json() as { ok: boolean; report?: LaunchAdvisorReport; error?: string }
      if (data.ok && data.report) {
        setAdvisorReport(data.report)
        setPanelView('advisor')
      }
    } catch (err) {
      console.error('Analyze error:', err)
    } finally {
      setAdvisorLoading(false)
      setEngineState(isBooted ? 'SCANNING' : 'IDLE')
    }
  }

  // Simulate graduation (dev only)
  const handleSimulate = async () => {
    setMode('DETECTOR')
    setEngineState('PROCESSING')
    try {
      const res = await fetch('/api/simulate-graduation', { method: 'POST' })
      const data = await res.json() as { ok: boolean }
      if (data.ok) {
        // Record will appear via monologue events; for demo we'll create a mock
        setTimeout(() => {
          setEngineState(isBooted ? 'SCANNING' : 'IDLE')
        }, 5000)
      }
    } catch { /* dev only */ }
  }

  const handleClearLog = async () => {
    await fetch('/api/monologue', { method: 'DELETE' })
    setLines([])
  }

  const isDev = process.env.NODE_ENV === 'development'

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#080808' }}>
      <div className="scanline" />

      {/* ─── TOP BAR ─────────────────────────────────────────────────── */}
      <header
        className="shrink-0 flex items-center justify-between px-6 py-3 border-b"
        style={{ borderColor: '#111', background: '#060606' }}
      >
        {/* Left: Wordmark + Identity */}
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-baseline gap-2">
              <span
                className="text-base font-bold tracking-[0.2em] glow-green"
                style={{ color: '#4ade80' }}
              >
                KAIRÓS
              </span>
              <span className="text-xs font-light tracking-widest" style={{ color: '#6b7280' }}>
                ENGINE v2
              </span>
            </div>
            <div className="text-[10px] tracking-wider" style={{ color: '#333' }}>
              CHAIN-AWARE MEME AGENT
            </div>
          </div>

          <div className="w-px h-8" style={{ background: '#1a1a1a' }} />

          <IdentityChip record={agentRecord} status={agentStatus} />
        </div>

        {/* Center: Mode + Status */}
        <div className="flex items-center gap-3">
          <div
            className="text-xs px-3 py-1 rounded font-semibold tracking-wider"
            style={{
              color: mode === 'ADVISOR' ? '#fb923c' : '#60a5fa',
              background: mode === 'ADVISOR' ? 'rgba(251,146,60,0.1)' : 'rgba(96,165,250,0.1)',
              border: `1px solid ${mode === 'ADVISOR' ? 'rgba(251,146,60,0.2)' : 'rgba(96,165,250,0.2)'}`,
            }}
          >
            MODE {mode === 'ADVISOR' ? 'A — ADVISOR' : 'B — DETECTOR'}
          </div>
          <StatusPill state={engineState} />
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {isDev && isBooted && (
            <button
              onClick={handleSimulate}
              className="text-xs px-3 py-1.5 rounded transition-all hover:opacity-80"
              style={{
                color: '#60a5fa',
                background: 'rgba(96,165,250,0.08)',
                border: '1px solid rgba(96,165,250,0.2)',
              }}
            >
              ⚡ SIMULATE GRAD
            </button>
          )}
          <button
            onClick={handleBoot}
            disabled={isBooted || engineState === 'BOOTING' || engineState === 'INJECTING'}
            className="text-xs px-4 py-1.5 rounded font-bold tracking-wider transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
            style={{
              color: '#080808',
              background: isBooted ? '#4ade80' : '#4ade80',
              boxShadow: isBooted ? '0 0 16px rgba(74,222,128,0.4)' : '0 0 8px rgba(74,222,128,0.2)',
            }}
          >
            {isBooted ? '✓ ACTIVE' : 'INJECT KAIRÓS'}
          </button>
        </div>
      </header>

      {/* ─── MAIN BODY ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* ─── LEFT: MONOLOGUE (60%) ────────────────────────────────── */}
        <div
          className="flex flex-col border-r"
          style={{ width: '60%', borderColor: '#111', background: '#0a0a0a' }}
        >
          <MonologuePanel lines={lines} onClear={handleClearLog} />
        </div>

        {/* ─── RIGHT: OUTPUT (40%) ─────────────────────────────────── */}
        <div className="flex flex-col" style={{ width: '40%', background: '#080808' }}>

          {/* Panel Tab Toggle (only when both data types exist) */}
          {advisorReport && graduationRecord && (
            <div className="flex border-b shrink-0" style={{ borderColor: '#111' }}>
              {(['advisor', 'graduation'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setPanelView(v)}
                  className="flex-1 py-2 text-xs font-semibold tracking-wider transition-all"
                  style={{
                    color: panelView === v ? '#e8e8e8' : '#333',
                    background: panelView === v ? '#0f0f0f' : 'transparent',
                    borderBottom: panelView === v ? '2px solid #4ade80' : '2px solid transparent',
                  }}
                >
                  {v === 'advisor' ? 'ADVISOR REPORT' : 'GRADUATION RECORD'}
                </button>
              ))}
            </div>
          )}

          {/* Panel Content */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* Input always visible at top of right panel when not loading */}
            {!advisorLoading && (panelView === 'advisor' || !graduationRecord) && (
              <div className="p-4">
                <InputPanel onAnalyze={handleAnalyze} loading={advisorLoading} />
              </div>
            )}

            {/* Advisor loading state */}
            {advisorLoading && (
              <div className="flex flex-col items-center justify-center h-48 space-y-4 p-8">
                <div
                  className="w-12 h-12 rounded-full border-2 animate-spin"
                  style={{ borderColor: '#fb923c33', borderTopColor: '#fb923c' }}
                />
                <div className="text-xs text-center space-y-1">
                  <div style={{ color: '#fb923c' }}>ORACLE COMPUTING</div>
                  <div style={{ color: '#333' }}>The engine deliberates...</div>
                </div>
              </div>
            )}

            {/* Advisor report */}
            {advisorReport && panelView === 'advisor' && !advisorLoading && (
              <div className="px-4 pb-4">
                <AdvisorReportPanel report={advisorReport} />
              </div>
            )}

            {/* Graduation record */}
            {graduationRecord && panelView === 'graduation' && (
              <GraduationPanel record={graduationRecord} />
            )}

            {/* Empty state — not booted */}
            {!isBooted && !advisorLoading && !advisorReport && (
              <div className="flex flex-col items-center justify-center h-64 space-y-4 px-8 text-center">
                <div className="text-3xl" style={{ color: '#1a1a1a' }}>◈</div>
                <div className="text-xs space-y-2">
                  <div style={{ color: '#4ade80' }}>KAIRÓS ENGINE DORMANT</div>
                  <div style={{ color: '#333' }}>
                    Click INJECT KAIRÓS to register the agent identity and activate the skill registry.
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Skill manifest footer */}
          {isBooted && (
            <div
              className="shrink-0 px-4 py-2 border-t text-[10px] flex gap-3 flex-wrap"
              style={{ borderColor: '#111', background: '#060606' }}
            >
              {['ARGOS', 'THEMIS', 'MNEMON', 'HERMES', 'MNEMOSYNE', 'ADVISOR'].map(skill => (
                <span
                  key={skill}
                  className="flex items-center gap-1"
                  style={{ color: '#333' }}
                >
                  <span
                    className="w-1 h-1 rounded-full"
                    style={{ background: '#4ade80', boxShadow: '0 0 4px #4ade80' }}
                  />
                  {skill}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
