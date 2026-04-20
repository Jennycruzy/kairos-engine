import { NextResponse } from 'next/server'
import { getSkillManager } from '@/registry/skill-manager'

export async function GET() {
  const manager = getSkillManager()
  const lines = manager.getMonologueLines()
  return NextResponse.json({ lines })
}

export async function DELETE() {
  const manager = getSkillManager()
  manager.clearMonologue()
  return NextResponse.json({ ok: true })
}
