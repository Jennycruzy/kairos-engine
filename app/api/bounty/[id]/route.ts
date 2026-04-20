import { NextRequest, NextResponse } from 'next/server'
import { getBounty, paySubmission } from '@/skills/agora.skill'

// GET /api/bounty/:id — returns bounty status (used by the Frame page)
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const bounty = getBounty(params.id)
  if (!bounty) {
    return NextResponse.json({ ok: false, error: 'Bounty not found' }, { status: 404 })
  }

  // Return public-safe view (omit wallet addresses from other submissions)
  return NextResponse.json({
    ok: true,
    bounty: {
      id: bounty.id,
      tokenTicker: bounty.tokenTicker,
      sovereignName: bounty.sovereignName,
      loreParagraph: bounty.loreParagraph,
      rewardBNB: bounty.rewardBNB,
      maxSlots: bounty.maxSlots,
      slotsRemaining: Math.max(0, bounty.maxSlots - bounty.submissions.length),
      submissionCount: bounty.submissions.length,
      status: bounty.status,
      createdAt: bounty.createdAt,
      closedAt: bounty.closedAt,
    },
  })
}

// POST /api/bounty/:id/pay — trigger individual payout (admin use)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { submissionId } = await req.json() as { submissionId: string }
    if (!submissionId) {
      return NextResponse.json({ ok: false, error: 'submissionId required' }, { status: 400 })
    }

    const txHash = await paySubmission(params.id, submissionId)
    return NextResponse.json({ ok: true, txHash })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
