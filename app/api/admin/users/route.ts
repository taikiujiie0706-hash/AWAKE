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

  const { data: profiles } = await admin.from('profiles').select('id,coins,nickname')
  const profileMap = new Map((profiles ?? []).map((p: { id: string; coins: number; nickname: string | null }) => [p.id, p]))

  const users = usersData.users.map(u => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    coins: profileMap.get(u.id)?.coins ?? 0,
    nickname: profileMap.get(u.id)?.nickname ?? null,
  }))

  return NextResponse.json({ users })
}
