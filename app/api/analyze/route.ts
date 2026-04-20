import { NextRequest, NextResponse } from 'next/server'
import { getSkillManager } from '@/registry/skill-manager'
import { verifyX402 } from '@/lib/x402'
import type { PreLaunchTokenInput } from '@/types/kairos.types'

export async function POST(req: NextRequest) {
  // ── x402 Payment Gate ────────────────────────────────────────────────────
  // Other AI agents and developers pay ~$0.10 BNB per advisory report.
  // Send BNB to AGENT_OWNER_ADDRESS on BSC, include tx hash as:
  // Header: X-Payment-Transaction: 0x<txHash>
  // Set X402_DISABLED=true in .env to bypass for local/UI use.
  const payment = await verifyX402(req)
  if (!payment.ok) {
    return NextResponse.json(
      { error: 'Payment required', x402: payment.details },
      {
        status: 402,
        headers: {
          'X-Payment-Required': 'true',
          'X-Payment-Token': 'BNB',
          'X-Payment-Amount': payment.details.amount,
          'X-Payment-Recipient': payment.details.recipient,
          'X-Payment-Chain': '56',
          'X-Payment-Instructions': payment.details.instructions,
        },
      }
    )
  }

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
