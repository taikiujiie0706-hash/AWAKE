import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req.headers.get('authorization')))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: usersData, error } = await admin.auth.admin.listUsers()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: profiles } = await admin.from('profiles').select('id,coins')
  const coinsMap = new Map((profiles ?? []).map((p: { id: string; coins: number }) => [p.id, p.coins]))

  const users = usersData.users.map(u => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    coins: coinsMap.get(u.id) ?? 0,
  }))

  return NextResponse.json({ users })
}
