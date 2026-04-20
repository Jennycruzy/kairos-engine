import { NextResponse } from 'next/server'
import { getSkillManager } from '@/registry/skill-manager'
import type { TokenDNA } from '@/types/kairos.types'

const MOCK_TOKENS: TokenDNA[] = [
  {
    address: '0xsim' + Math.random().toString(16).slice(2, 10),
    ticker: 'VXID',
    name: 'Vexid Primordial',
    bondingProgress: 17.6,
    bondingPercent: 97.8,
    createdAt: new Date().toISOString(),
    deployerAddress: '0xdev01',
    description: 'A primordial force that shaped the first chains',
  },
  {
    address: '0xsim' + Math.random().toString(16).slice(2, 10),
    ticker: 'KRNOS',
    name: 'Karnos the Unmoved',
    bondingProgress: 17.8,
    bondingPercent: 98.9,
    createdAt: new Date().toISOString(),
    deployerAddress: '0xdev02',
    description: 'The eternal witness of all token births and deaths',
  },
]

export async function POST() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ ok: false, error: 'Simulation only available in development mode' }, { status: 403 })
  }

  try {
    const manager = getSkillManager()
    if (!manager.getEngineStatus().agentId) {
      await manager.boot()
    }

    const token = MOCK_TOKENS[Math.floor(Math.random() * MOCK_TOKENS.length)]

    // Fire in background
    manager.runPipeline(token).catch(console.error)

    return NextResponse.json({ ok: true, token })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
