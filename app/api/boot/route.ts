import { NextResponse } from 'next/server'
import { getSkillManager } from '@/registry/skill-manager'

export async function POST() {
  try {
    const manager = getSkillManager()
    await manager.boot()
    return NextResponse.json({ ok: true, status: manager.getEngineStatus() })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
