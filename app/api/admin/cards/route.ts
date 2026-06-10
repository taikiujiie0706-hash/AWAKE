import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req.headers.get('authorization')))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('cards')
    .select('id,name,type,attribute,rarity,max_in_deck')
    .order('type')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cards: data })
}

export async function PATCH(req: NextRequest) {
  if (!(await verifyAdmin(req.headers.get('authorization')))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id, rarity, max_in_deck } = await req.json()
  if (!id) return NextResponse.json({ error: 'invalid params' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (rarity !== undefined) update.rarity = rarity
  if (max_in_deck !== undefined) update.max_in_deck = max_in_deck
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('cards').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
