import { NextResponse } from 'next/server'
import { getSkillManager } from '@/registry/skill-manager'

export async function POST() {
  try {
    const manager = getSkillManager()
    // Fire and forget — boot runs in background while monologue polling shows progress
    manager.boot().catch(console.error)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
