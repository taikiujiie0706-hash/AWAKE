import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabaseAdmin'

export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req.headers.get('authorization')))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('packs')
    .select('id,name,description,price_coins,cards_per_pack')
    .order('price_coins')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ packs: data })
}

export async function PATCH(req: NextRequest) {
  if (!(await verifyAdmin(req.headers.get('authorization')))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id, name, description, price_coins, cards_per_pack } = await req.json()
  if (!id) return NextResponse.json({ error: 'invalid params' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (name !== undefined) update.name = name
  if (description !== undefined) update.description = description
  if (price_coins !== undefined) update.price_coins = price_coins
  if (cards_per_pack !== undefined) update.cards_per_pack = cards_per_pack
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('packs').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
