import { NextRequest, NextResponse } from 'next/server'
import { submitWork } from '@/skills/agora.skill'

export async function POST(req: NextRequest) {
  try {
    const { bountyId, wallet, postUrl } = await req.json() as {
      bountyId: string
      wallet: string
      postUrl: string
    }

    if (!bountyId || !wallet || !postUrl) {
      return NextResponse.json(
        { ok: false, error: 'bountyId, wallet, and postUrl are required' },
        { status: 400 }
      )
    }

    const result = submitWork(bountyId, wallet, postUrl)

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      submission: result.submission,
      message: 'Submission received. BNB payout will be sent once all slots are filled or immediately if slots are full.',
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
