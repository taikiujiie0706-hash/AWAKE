import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabaseAdmin'

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req.headers.get('authorization')))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { userId, coins } = await req.json()
  if (!userId || typeof coins !== 'number' || !Number.isFinite(coins)) {
    return NextResponse.json({ error: 'invalid params' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('profiles').upsert({ id: userId, coins })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
