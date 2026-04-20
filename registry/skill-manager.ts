import { EventEmitter } from 'events'
import type {
  KairosEvent,
  KairosEventType,
  MonologueLine,
  TokenDNA,
  PreLaunchTokenInput,
  LaunchAdvisorReport,
  GraduationAlert,
  AgentIdentityRecord,
  KairosRecord,
  EngineStatus,
} from '@/types/kairos.types'
import { ENGINE_VERSION, SKILL_INJECT_LINE_DELAY_MS } from '@/config/constants'
import * as agentIdentityModule from '@/identity/agent-identity'
import { MnemosyneSkill, setMonologueCallback as mnemosyneLog } from '@/skills/mnemosyne.skill'
import { audit, setMonologueCallback as themisLog } from '@/skills/themis.skill'
import { generateLore, setMonologueCallback as mnemonLog } from '@/skills/mnemon.skill'
import * as argos from '@/skills/argos.skill'
import { broadcast, setMonologueCallback as hermesLog } from '@/skills/hermes.skill'
import { analyze, setMonologueCallback as advisorLog, setEventEmitter as advisorEvents } from '@/skills/launch-advisor.skill'
import { setMonologueCallback as identityLog } from '@/identity/agent-identity'

// ─── SKILL MANAGER ────────────────────────────────────────────────────────────
export class SkillManager extends EventEmitter {
  private agentIdentity: AgentIdentityRecord | null = null
  private injectedSkills: string[] = []
  private monologueLines: MonologueLine[] = []
  private startedAt: Date = new Date()
  private activeTokens = new Set<string>()
  private advisorSessionActive = false
  private isBooted = false

  constructor() {
    super()
    this.wireMonologueCallbacks()
  }

  // ─── MONOLOGUE WIRING ──────────────────────────────────────────────────
  private wireMonologueCallbacks() {
    const cb = (source: string, text: string, level = 'INFO') => {
      this.pushMonologue(
        source as MonologueLine['source'],
        text,
        level as MonologueLine['level']
      )
    }
    identityLog(cb)
    mnemosyneLog(cb)
    themisLog(cb)
    mnemonLog(cb)
    argos.setMonologueCallback(cb)
    hermesLog(cb)
    advisorLog(cb)
  }

  private pushMonologue(
    source: MonologueLine['source'],
    text: string,
    level: MonologueLine['level'] = 'INFO'
  ) {
    const line: MonologueLine = { source, text, level, timestamp: new Date() }
    this.monologueLines.push(line)
    this.emit('monologue', line)
    this.emitEvent({ type: 'MONOLOGUE', payload: line, mode: 'SYSTEM', skillSource: source })
  }

  private emitEvent(event: Omit<KairosEvent, 'timestamp' | 'agentId'> & { agentId?: string }) {
    const full: KairosEvent = {
      ...event,
      timestamp: new Date(),
      agentId: event.agentId ?? this.agentIdentity?.agentId,
    }
    this.emit('event', full)
    this.emit(event.type, full)
  }

  private delay(ms: number) {
    return new Promise(r => setTimeout(r, ms))
  }

  // ─── BOOT SEQUENCE ─────────────────────────────────────────────────────
  async boot(): Promise<void> {
    if (this.isBooted) return
    this.startedAt = new Date()

    this.pushMonologue('SYSTEM', 'KAIRÓS ENGINE v2 — initializing...', 'INFO')

    // Step 1: ERC-8004 identity
    this.agentIdentity = await agentIdentityModule.getOrRegisterAgent()
    this.emitEvent({
      type: 'AGENT_REGISTERED',
      payload: this.agentIdentity,
      mode: 'SYSTEM',
      skillSource: 'IDENTITY',
      agentId: this.agentIdentity.agentId,
    })

    // Step 2: inject skills
    await this.injectAll(this.agentIdentity.agentId)

    // Step 3: start Argos
    argos.start((alert: GraduationAlert) => {
      this.emitEvent({
        type: 'GRADUATION_ALERT',
        payload: alert,
        mode: 'POST_LAUNCH',
        skillSource: 'ARGOS',
        agentId: this.agentIdentity?.agentId,
      })
      this.runPipeline(alert.token).catch(err => {
        this.pushMonologue('SYSTEM', `Pipeline error: ${(err as Error).message}`, 'ABORT')
      })
    })

    this.isBooted = true
    this.emitEvent({
      type: 'ENGINE_READY',
      payload: null,
      mode: 'SYSTEM',
      skillSource: 'KAIROS',
      agentId: this.agentIdentity.agentId,
    })
    this.pushMonologue('KAIROS', `All systems sovereign. Agent ${this.agentIdentity.agentId.slice(0, 6)}...${this.agentIdentity.agentId.slice(-4)} is active.`, 'SUCCESS')
  }

  // ─── SKILL INJECTION ───────────────────────────────────────────────────
  async injectSkill(agentId: string, skillName: string): Promise<void> {
    if (!this.injectedSkills.includes(skillName)) {
      this.injectedSkills.push(skillName)
    }
    this.emitEvent({
      type: 'SKILL_INJECTED',
      payload: { skillName },
      mode: 'SYSTEM',
      skillSource: 'SYSTEM',
      agentId,
    })
  }

  async injectAll(agentId: string): Promise<void> {
    this.pushMonologue('IDENTITY', `ERC-8004 agent identity confirmed. ID: ${agentId.slice(0, 6)}...${agentId.slice(-4)}`, 'SUCCESS')
    await this.delay(SKILL_INJECT_LINE_DELAY_MS)

    const skills: Array<[string, string]> = [
      ['argos', 'Loading Argos — Bonding Pulse Watcher...'],
      ['themis', 'Loading Themis — Cultural Auditor...'],
      ['mnemon', 'Loading Mnemon — Lore + Memory Engine...'],
      ['hermes', 'Loading Hermes — Farcaster Broadcaster...'],
      ['mnemosyne', 'Loading Mnemosyne — Greenfield Archivist...'],
      ['launch-advisor', 'Loading Launch Advisor — Pre-launch Oracle...'],
    ]

    for (const [name, label] of skills) {
      this.pushMonologue('SYSTEM', `${label}`, 'INFO')
      await this.delay(SKILL_INJECT_LINE_DELAY_MS)
      await this.injectSkill(agentId, name)
      this.pushMonologue('SYSTEM', `  → ${name.toUpperCase()} injected.`, 'SUCCESS')
      await this.delay(SKILL_INJECT_LINE_DELAY_MS)
    }

    this.pushMonologue('KAIROS', `All skills injected. Agent ${agentId.slice(0, 6)}...${agentId.slice(-4)} is sovereign. Awaiting signal.`, 'SUCCESS')
  }

  // ─── MODE B PIPELINE ───────────────────────────────────────────────────
  async runPipeline(token: TokenDNA): Promise<void> {
    const { address, ticker } = token
    if (this.activeTokens.has(address)) return
    this.activeTokens.add(address)

    const agentId = this.agentIdentity?.agentId ?? ''
    const mnemosyne = MnemosyneSkill.getInstance()

    try {
      this.pushMonologue('KAIROS', `Pipeline initiated for ${ticker} (${address.slice(0, 8)}...)`, 'INFO')

      // Themis audit
      const auditReport = await audit(token)
      this.emitEvent({ type: 'AUDIT_COMPLETE', payload: auditReport, mode: 'POST_LAUNCH', skillSource: 'THEMIS' })

      if (auditReport.verdict === 'ABORT') {
        this.pushMonologue('THEMIS', `ABORT: ${ticker} fails cultural integrity check. Sealing abort record.`, 'ABORT')
        await mnemosyne.archiveAbort(auditReport, token)
        this.emitEvent({ type: 'ABORT', payload: { token, auditReport }, mode: 'POST_LAUNCH', skillSource: 'THEMIS' })
        this.activeTokens.delete(address)
        return
      }

      // Mnemon lore
      const lore = await generateLore(token, auditReport.similarityScore)
      this.emitEvent({ type: 'LORE_READY', payload: lore, mode: 'POST_LAUNCH', skillSource: 'MNEMON' })

      // Hermes broadcast
      const bondingSnapshot = {
        currentBNB: token.bondingProgress,
        targetBNB: 18,
        percentComplete: token.bondingPercent,
      }
      const broadcastResult = await broadcast(lore, bondingSnapshot, token)
      this.emitEvent({ type: 'BROADCAST_SUCCESS', payload: broadcastResult, mode: 'POST_LAUNCH', skillSource: 'HERMES' })

      // Mnemosyne archive
      const record: KairosRecord = {
        tokenAddress: address,
        ticker,
        graduationSnapshot: bondingSnapshot,
        mimeticLore: lore,
        auditReport,
        broadcastResult: { castHash: broadcastResult.castHash, frameUrl: broadcastResult.frameUrl },
        pipelineCompletedAt: new Date(),
        engineVersion: ENGINE_VERSION,
        agentId,
      }

      await mnemosyne.archiveGraduation(record)
      this.emitEvent({ type: 'ARCHIVE_SUCCESS', payload: record, mode: 'POST_LAUNCH', skillSource: 'MNEMOSYNE' })

      this.pushMonologue('KAIROS', `Pipeline complete for ${ticker}. Identity conferred.`, 'SUCCESS')
    } catch (err) {
      this.pushMonologue('SYSTEM', `Pipeline error for ${ticker}: ${(err as Error).message}`, 'ABORT')
      throw err
    } finally {
      this.activeTokens.delete(address)
    }
  }

  // ─── MODE A PIPELINE ───────────────────────────────────────────────────
  async runPreLaunchAdvisor(input: PreLaunchTokenInput): Promise<LaunchAdvisorReport> {
    if (this.advisorSessionActive) {
      throw new Error('Advisor session already active. Wait for current analysis to complete.')
    }

    this.advisorSessionActive = true

    // Wire advisor event emitter to the main EventBus
    advisorEvents((type: string, payload: unknown) => {
      this.emitEvent({
        type: type as KairosEventType,
        payload,
        mode: 'PRE_LAUNCH',
        skillSource: 'ADVISOR',
      })
    })

    try {
      this.pushMonologue('IDENTITY', `Verifying agent authority... ID: ${this.agentIdentity?.agentId?.slice(0, 6) ?? 'PENDING'}...`, 'INFO')
      this.pushMonologue('KAIROS', 'Pre-launch advisory mode engaged.', 'INFO')

      const report = await analyze(input)
      return report
    } finally {
      this.advisorSessionActive = false
    }
  }

  // ─── ABORT ─────────────────────────────────────────────────────────────
  abort(tokenAddress: string, reason: string): void {
    this.activeTokens.delete(tokenAddress)
    this.pushMonologue('KAIROS', `Abort issued for ${tokenAddress.slice(0, 8)}...: ${reason}`, 'ABORT')
    this.emitEvent({
      type: 'ABORT',
      payload: { tokenAddress, reason },
      mode: 'SYSTEM',
      skillSource: 'KAIROS',
    })
  }

  // ─── MONOLOGUE GENERATOR ───────────────────────────────────────────────
  async *monologue(): AsyncGenerator<MonologueLine> {
    let index = 0
    // Yield buffered lines
    while (index < this.monologueLines.length) {
      yield this.monologueLines[index++]
    }
    // Then stream new ones
    while (true) {
      if (index < this.monologueLines.length) {
        yield this.monologueLines[index++]
      } else {
        await new Promise(r => setTimeout(r, 50))
      }
    }
  }

  // ─── STATUS ────────────────────────────────────────────────────────────
  getEngineStatus(): EngineStatus {
    return {
      agentId: this.agentIdentity?.agentId ?? '',
      agentIdentityRecord: this.agentIdentity ?? undefined,
      mode: 'DUAL',
      activeTokens: this.activeTokens.size,
      advisorSessionActive: this.advisorSessionActive,
      uptime: Date.now() - this.startedAt.getTime(),
    }
  }

  getMonologueLines(): MonologueLine[] {
    return [...this.monologueLines]
  }

  clearMonologue(): void {
    this.monologueLines = []
    this.emit('monologue-cleared')
  }

  getTrackedTokenCount(): number {
    return argos.getTrackedTokenCount()
  }

  getInjectedSkills(): string[] {
    return [...this.injectedSkills]
  }
}

// Singleton
let managerInstance: SkillManager | null = null
export function getSkillManager(): SkillManager {
  if (!managerInstance) managerInstance = new SkillManager()
  return managerInstance
}
