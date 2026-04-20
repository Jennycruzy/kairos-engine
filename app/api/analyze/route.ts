import { NextRequest, NextResponse } from 'next/server'
import { getSkillManager } from '@/registry/skill-manager'
import type { PreLaunchTokenInput } from '@/types/kairos.types'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as PreLaunchTokenInput

    if (!body.ticker || typeof body.ticker !== 'string') {
      return NextResponse.json({ ok: false, error: 'ticker is required' }, { status: 400 })
    }
    if (!body.description || typeof body.description !== 'string') {
      return NextResponse.json({ ok: false, error: 'description is required' }, { status: 400 })
    }

    const manager = getSkillManager()
    // Ensure engine is booted
    if (!manager.getEngineStatus().agentId) {
      await manager.boot()
    }

    const report = await manager.runPreLaunchAdvisor(body)
    return NextResponse.json({ ok: true, report })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
