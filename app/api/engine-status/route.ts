import { NextResponse } from 'next/server'
import { getSkillManager } from '@/registry/skill-manager'

export async function GET() {
  const manager = getSkillManager()
  const status = manager.getEngineStatus()
  const skills = manager.getInjectedSkills()
  return NextResponse.json({ ...status, skills })
}
