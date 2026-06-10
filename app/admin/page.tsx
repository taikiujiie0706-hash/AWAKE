'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { ADMIN_EMAIL } from '@/lib/admin'
import Link from 'next/link'

type CardRarity = { id: string; rarity: string | null }
type AdminUser = { id: string; email: string | null; created_at: string; coins: number; nickname: string | null }
type AdminCard = { id: string; name: string; type: string; attribute: string | null; rarity: string | null; max_in_deck: number | null }
type AdminPack = { id: string; name: string; description: string | null; price_coins: number; cards_per_pack: number }

const RARITY_ORDER = ['UR', 'SR', 'R', 'N'] as const
const RARITY_OPTIONS = ['N', 'R', 'SR', 'UR'] as const

const rarityStyle: Record<string, { color: string; border: string; label: string }> = {
  UR: { color: '#e040fb', border: '#9020c0', label: 'UR' },
  SR: { color: '#d4af37', border: '#a08020', label: 'SR' },
  R:  { color: '#4a8fdf', border: '#2a5faf', label: 'R'  },
  N:  { color: '#999',    border: '#444',    label: 'N'  },
}

const cardStyle: React.CSSProperties = { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: '20px 24px' }
const labelStyle: React.CSSProperties = { color: '#e8c876', fontSize: 13, fontWeight: 'bold', letterSpacing: '0.1em', marginBottom: 16 }
const inputStyle: React.CSSProperties = { background: '#0f0f0f', border: '1px solid #333', borderRadius: 6, color: '#ccc', fontSize: 13, padding: '6px 8px' }
const buttonStyle: React.CSSProperties = { background: '#3a2a00', border: '1px solid #5c3a00', color: '#e8c876', borderRadius: 6, fontSize: 12, fontWeight: 'bold', padding: '6px 14px', cursor: 'pointer' }

type Tab = 'profile' | 'users' | 'cards' | 'packs'

export default function AdminPage() {
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [token, setToken] = useState('')
  const [tab, setTab] = useState<Tab>('profile')

  // 自分の会員情報
  const [email, setEmail] = useState('')
  const [coins, setCoins] = useState<number | null>(null)
  const [rarityStats, setRarityStats] = useState<Record<string, { owned: number; total: number }>>({})

  // ユーザー一覧
  const [users, setUsers] = useState<AdminUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [coinDrafts, setCoinDrafts] = useState<Record<string, string>>({})
  const [savingUser, setSavingUser] = useState<string | null>(null)

  // カードマスタ
  const [cards, setCards] = useState<AdminCard[]>([])
  const [cardsLoading, setCardsLoading] = useState(false)
  const [savingCard, setSavingCard] = useState<string | null>(null)

  // パックマスタ
  const [packs, setPacks] = useState<AdminPack[]>([])
  const [packsLoading, setPacksLoading] = useState(false)
  const [packDrafts, setPackDrafts] = useState<Record<string, Partial<AdminPack>>>({})
  const [savingPack, setSavingPack] = useState<string | null>(null)

  useEffect(() => { init() }, [])

  async function init() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) { window.location.href = '/login'; return }
    if (user.email !== ADMIN_EMAIL) { setLoading(false); setAuthorized(false); return }

    setAuthorized(true)
    setToken(session.access_token)
    setEmail(user.email ?? '')

    const [profileRes, cardsRes, userCardsRes] = await Promise.all([
      supabase.from('profiles').select('coins').eq('id', user.id).maybeSingle(),
      supabase.from('cards').select('id,rarity'),
      supabase.from('user_cards').select('card_id').eq('user_id', user.id),
    ])

    setCoins(profileRes.data?.coins ?? 0)

    const ownedIds = new Set((userCardsRes.data ?? []).map((uc: { card_id: string }) => uc.card_id))
    const stats: Record<string, { owned: number; total: number }> = {}
    for (const r of RARITY_ORDER) stats[r] = { owned: 0, total: 0 }
    for (const c of (cardsRes.data ?? []) as CardRarity[]) {
      const r = c.rarity ?? 'N'
      if (!stats[r]) stats[r] = { owned: 0, total: 0 }
      stats[r].total += 1
      if (ownedIds.has(c.id)) stats[r].owned += 1
    }
    setRarityStats(stats)
    setLoading(false)
  }

  const authHeaders = useCallback((): HeadersInit => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }), [token])

  async function loadUsers() {
    setUsersLoading(true)
    const res = await fetch('/api/admin/users', { headers: authHeaders() })
    const data = await res.json()
    setUsers(data.users ?? [])
    setUsersLoading(false)
  }

  async function saveCoins(userId: string) {
    const draft = coinDrafts[userId]
    const value = Number(draft)
    if (!Number.isFinite(value)) return
    setSavingUser(userId)
    await fetch('/api/admin/users/coins', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ userId, coins: value }),
    })
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, coins: value } : u))
    setSavingUser(null)
  }

  async function loadCards() {
    setCardsLoading(true)
    const res = await fetch('/api/admin/cards', { headers: authHeaders() })
    const data = await res.json()
    setCards(data.cards ?? [])
    setCardsLoading(false)
  }

  async function saveCard(card: AdminCard) {
    setSavingCard(card.id)
    await fetch('/api/admin/cards', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ id: card.id, rarity: card.rarity, max_in_deck: card.max_in_deck }),
    })
    setSavingCard(null)
  }

  async function loadPacks() {
    setPacksLoading(true)
    const res = await fetch('/api/admin/packs', { headers: authHeaders() })
    const data = await res.json()
    setPacks(data.packs ?? [])
    setPacksLoading(false)
  }

  async function savePack(packId: string) {
    const draft = packDrafts[packId]
    if (!draft) return
    setSavingPack(packId)
    await fetch('/api/admin/packs', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ id: packId, ...draft }),
    })
    setPacks(prev => prev.map(p => p.id === packId ? { ...p, ...draft } : p))
    setPackDrafts(prev => { const next = { ...prev }; delete next[packId]; return next })
    setSavingPack(null)
  }

  function selectTab(next: Tab) {
    setTab(next)
    if (next === 'users' && users.length === 0 && !usersLoading) loadUsers()
    if (next === 'cards' && cards.length === 0 && !cardsLoading) loadCards()
    if (next === 'packs' && packs.length === 0 && !packsLoading) loadPacks()
  }

  if (loading) {
    return (
      <main style={{ background: '#0f0f0f', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#e8c876', fontFamily: 'Georgia, serif', letterSpacing: '0.2em' }}>読み込み中...</div>
      </main>
    )
  }

  if (!authorized) {
    return (
      <main style={{ background: '#0f0f0f', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ color: '#e8c876', fontFamily: 'Georgia, serif', letterSpacing: '0.2em' }}>アクセス権がありません</div>
        <Link href="/" style={{ background: '#2a2a2a', border: '1px solid #444', color: '#ccc', textDecoration: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 14, fontWeight: 'bold' }}>
          ← ホームへ戻る
        </Link>
      </main>
    )
  }

  const totalOwned = Object.values(rarityStats).reduce((s, v) => s + v.owned, 0)
  const totalAll = Object.values(rarityStats).reduce((s, v) => s + v.total, 0)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'profile', label: '会員情報' },
    { id: 'users', label: 'ユーザー管理' },
    { id: 'cards', label: 'カード管理' },
    { id: 'packs', label: 'パック管理' },
  ]

  return (
    <main style={{ background: '#0f0f0f', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #1e1e1e' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#2a2a2a', border: '1px solid #444', color: '#ccc', textDecoration: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 14, fontWeight: 'bold' }}>
          ← ホーム
        </Link>
        <h1 style={{ color: '#e8c876', fontFamily: 'Georgia, serif', letterSpacing: '0.3em', fontSize: 22, margin: 0 }}>管理画面</h1>
        <div style={{ width: 90 }} />
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => selectTab(t.id)}
              style={{
                background: tab === t.id ? '#3a2a00' : '#1a1a1a',
                border: tab === t.id ? '1px solid #5c3a00' : '1px solid #2a2a2a',
                color: tab === t.id ? '#e8c876' : '#888',
                borderRadius: 8, fontSize: 13, fontWeight: 'bold', padding: '8px 18px', cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'profile' && (
          <>
            <div style={cardStyle}>
              <div style={labelStyle}>アカウント情報</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ color: '#888', fontSize: 12 }}>メールアドレス</span>
                <span style={{ color: '#ccc', fontSize: 13 }}>{email}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#888', fontSize: 12 }}>所持コイン</span>
                <span style={{ color: '#e8c876', fontSize: 18, fontFamily: 'Georgia, serif', fontWeight: 'bold' }}>🪙 {coins ?? 0}</span>
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={labelStyle as React.CSSProperties}>カードコレクション</div>
                <div style={{ color: '#888', fontSize: 12 }}>
                  {totalOwned} / {totalAll} 枚 ({totalAll > 0 ? Math.round((totalOwned / totalAll) * 100) : 0}%)
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {RARITY_ORDER.map(rarity => {
                  const stat = rarityStats[rarity] ?? { owned: 0, total: 0 }
                  const rs = rarityStyle[rarity]
                  const pct = stat.total > 0 ? Math.round((stat.owned / stat.total) * 100) : 0
                  return (
                    <div key={rarity}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ background: rs.color, color: '#000', fontSize: 10, fontWeight: 'bold', padding: '2px 8px', borderRadius: 4 }}>{rs.label}</span>
                        <span style={{ color: '#888', fontSize: 12 }}>{stat.owned} / {stat.total} 枚 ({pct}%)</span>
                      </div>
                      <div style={{ height: 6, background: '#0f0f0f', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: rs.color, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={labelStyle as React.CSSProperties}>アカウント操作</div>
              <Link
                href="/login"
                onClick={async (e) => {
                  e.preventDefault()
                  const supabase = createClient()
                  await supabase.auth.signOut()
                  window.location.href = '/login'
                }}
                style={{ background: '#2a2a2a', border: '1px solid #444', color: '#ccc', textDecoration: 'none', borderRadius: 8, padding: '11px 0', fontSize: 13, fontWeight: 'bold', textAlign: 'center' }}
              >
                ログアウト
              </Link>
            </div>
          </>
        )}

        {tab === 'users' && (
          <div style={cardStyle}>
            <div style={labelStyle}>ユーザー一覧（{users.length}人）</div>
            {usersLoading && <div style={{ color: '#888', fontSize: 13 }}>読み込み中...</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {users.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #2a2a2a' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#ccc', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.nickname ?? '(未設定)'}
                    </div>
                    <div style={{ color: '#888', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                    <div style={{ color: '#555', fontSize: 11 }}>{new Date(u.created_at).toLocaleDateString('ja-JP')}</div>
                  </div>
                  <span style={{ color: '#666', fontSize: 12 }}>🪙</span>
                  <input
                    type="number"
                    style={{ ...inputStyle, width: 90 }}
                    value={coinDrafts[u.id] ?? String(u.coins)}
                    onChange={e => setCoinDrafts(prev => ({ ...prev, [u.id]: e.target.value }))}
                  />
                  <button style={buttonStyle} disabled={savingUser === u.id} onClick={() => saveCoins(u.id)}>
                    {savingUser === u.id ? '保存中' : '保存'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'cards' && (
          <div style={cardStyle}>
            <div style={labelStyle}>カードマスタ（{cards.length}枚）</div>
            {cardsLoading && <div style={{ color: '#888', fontSize: 13 }}>読み込み中...</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cards.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #2a2a2a' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#ccc', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                    <div style={{ color: '#555', fontSize: 11 }}>{c.type}{c.attribute ? ` / ${c.attribute}` : ''}</div>
                  </div>
                  <select
                    style={{ ...inputStyle, width: 70 }}
                    value={c.rarity ?? 'N'}
                    onChange={e => setCards(prev => prev.map(x => x.id === c.id ? { ...x, rarity: e.target.value } : x))}
                  >
                    {RARITY_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <input
                    type="number"
                    min={0}
                    style={{ ...inputStyle, width: 60 }}
                    value={c.max_in_deck ?? 0}
                    onChange={e => setCards(prev => prev.map(x => x.id === c.id ? { ...x, max_in_deck: Number(e.target.value) } : x))}
                  />
                  <button style={buttonStyle} disabled={savingCard === c.id} onClick={() => saveCard(c)}>
                    {savingCard === c.id ? '保存中' : '保存'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'packs' && (
          <div style={cardStyle}>
            <div style={labelStyle}>パックマスタ（{packs.length}種）</div>
            {packsLoading && <div style={{ color: '#888', fontSize: 13 }}>読み込み中...</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {packs.map(p => {
                const draft = packDrafts[p.id] ?? {}
                return (
                  <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0', borderBottom: '1px solid #2a2a2a' }}>
                    <input
                      style={{ ...inputStyle }}
                      value={draft.name ?? p.name}
                      onChange={e => setPackDrafts(prev => ({ ...prev, [p.id]: { ...prev[p.id], name: e.target.value } }))}
                    />
                    <textarea
                      style={{ ...inputStyle, resize: 'vertical', minHeight: 50 }}
                      value={draft.description ?? p.description ?? ''}
                      onChange={e => setPackDrafts(prev => ({ ...prev, [p.id]: { ...prev[p.id], description: e.target.value } }))}
                    />
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <label style={{ color: '#888', fontSize: 12 }}>価格🪙</label>
                      <input
                        type="number"
                        style={{ ...inputStyle, width: 90 }}
                        value={draft.price_coins ?? p.price_coins}
                        onChange={e => setPackDrafts(prev => ({ ...prev, [p.id]: { ...prev[p.id], price_coins: Number(e.target.value) } }))}
                      />
                      <label style={{ color: '#888', fontSize: 12 }}>枚数</label>
                      <input
                        type="number"
                        min={1}
                        style={{ ...inputStyle, width: 70 }}
                        value={draft.cards_per_pack ?? p.cards_per_pack}
                        onChange={e => setPackDrafts(prev => ({ ...prev, [p.id]: { ...prev[p.id], cards_per_pack: Number(e.target.value) } }))}
                      />
                      <button style={buttonStyle} disabled={savingPack === p.id} onClick={() => savePack(p.id)}>
                        {savingPack === p.id ? '保存中' : '保存'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
