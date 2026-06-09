'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

type CardData = {
  id: string
  name: string
  name_awake: string | null
  type: string
  img_sealed: string | null
  img_awake: string | null
  img: string | null
  atk_sealed: number | null
  def_sealed: number | null
  attribute: string | null
  max_in_deck: number | null
  rarity: string | null
}

const rarityStyle: Record<string, { color: string; border: string; label: string }> = {
  N:  { color: '#999',    border: '#444',    label: 'N'  },
  R:  { color: '#4a8fdf', border: '#2a5faf', label: 'R'  },
  SR: { color: '#d4af37', border: '#a08020', label: 'SR' },
  UR: { color: '#e040fb', border: '#9020c0', label: 'UR' },
}

type OwnedCard = CardData & { owned: number }

type Deck = {
  id: string
  name: string
  monster_cards: string[]
  magic_trap_cards: string[]
}

const attributeColor: Record<string, string> = {
  '火': '#dc3c28', '水': '#2864dc', '風': '#28a050', '地': '#555',
  '闇': '#6428b4', '光': '#c8b428',
}

export default function DeckPage() {
  const [ownedCards, setOwnedCards] = useState<OwnedCard[]>([])
  const [allCards, setAllCards] = useState<CardData[]>([])
  const [deck, setDeck] = useState<Deck>({ id: '', name: 'マイデッキ', monster_cards: [], magic_trap_cards: [] })
  const [activeTab, setActiveTab] = useState<'monster' | 'magic_trap'>('monster')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [deckName, setDeckName] = useState('マイデッキ')

  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) { window.location.href = '/login'; return }

      const [{ data: cards }, { data: userCards }, { data: decks }] = await Promise.all([
        supabase.from('cards').select('*'),
        supabase.from('user_cards').select('card_id,count').eq('user_id', user.id),
        supabase.from('decks').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1),
      ])

      const cardMap = new Map((cards ?? []).map((c: CardData) => [c.id, c]))
      setAllCards(cards ?? [])

      const owned: OwnedCard[] = (userCards ?? [])
        .map((uc: { card_id: string; count: number }) => {
          const card = cardMap.get(uc.card_id)
          if (!card) return null
          return { ...card, owned: uc.count }
        })
        .filter(Boolean) as OwnedCard[]

      owned.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
      setOwnedCards(owned)

      if (decks && decks.length > 0) {
        const d = decks[0]
        setDeck(d)
        setDeckName(d.name)
      }
    } catch (e) {
      console.error('loadData error:', e)
    } finally {
      setLoading(false)
    }
  }

  function deckListFor(type: 'monster' | 'magic_trap'): string[] {
    return type === 'monster' ? deck.monster_cards : deck.magic_trap_cards
  }

  function countInDeck(cardId: string): number {
    return [...deck.monster_cards, ...deck.magic_trap_cards].filter(id => id === cardId).length
  }

  function addCard(card: OwnedCard) {
    const inDeck = countInDeck(card.id)
    const max = card.max_in_deck ?? 3
    if (inDeck >= max) {
      showMsg(`「${card.name}」はデッキに${max}枚まで`)
      return
    }
    if (inDeck >= card.owned) {
      showMsg(`所持枚数を超えて追加できません`)
      return
    }

    if (card.type === 'monster') {
      setDeck(d => ({ ...d, monster_cards: [...d.monster_cards, card.id] }))
    } else {
      setDeck(d => ({ ...d, magic_trap_cards: [...d.magic_trap_cards, card.id] }))
    }
  }

  function removeCard(cardId: string, type: 'monster' | 'magic_trap') {
    if (type === 'monster') {
      setDeck(d => {
        const idx = d.monster_cards.lastIndexOf(cardId)
        if (idx === -1) return d
        const arr = [...d.monster_cards]
        arr.splice(idx, 1)
        return { ...d, monster_cards: arr }
      })
    } else {
      setDeck(d => {
        const idx = d.magic_trap_cards.lastIndexOf(cardId)
        if (idx === -1) return d
        const arr = [...d.magic_trap_cards]
        arr.splice(idx, 1)
        return { ...d, magic_trap_cards: arr }
      })
    }
  }

  async function saveDeck() {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return
    setSaving(true)

    const payload = {
      user_id: user.id,
      name: deckName,
      monster_cards: deck.monster_cards,
      magic_trap_cards: deck.magic_trap_cards,
      updated_at: new Date().toISOString(),
    }

    let error
    if (deck.id) {
      const res = await supabase.from('decks').update(payload).eq('id', deck.id)
      error = res.error
    } else {
      const res = await supabase.from('decks').insert(payload).select().single()
      error = res.error
      if (!error && res.data) setDeck(d => ({ ...d, id: res.data.id }))
    }

    setSaving(false)
    showMsg(error ? 'エラー: ' + error.message : 'デッキを保存しました')
  }

  function showMsg(text: string) {
    setMsg(text)
    setTimeout(() => setMsg(''), 3000)
  }

  function cardImg(card: CardData) {
    if (card.type === 'monster') return card.img_sealed ?? ''
    return card.img ?? ''
  }

  // Build grouped deck display
  function deckGroups(type: 'monster' | 'magic_trap') {
    const ids = deckListFor(type)
    const counts = new Map<string, number>()
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
    return Array.from(counts.entries()).map(([id, cnt]) => {
      const card = allCards.find(c => c.id === id)
      return { id, cnt, card }
    })
  }

  const ownedByTab = ownedCards.filter(c => activeTab === 'monster' ? c.type === 'monster' : c.type !== 'monster')
  const monsterCount = deck.monster_cards.length
  const magicTrapCount = deck.magic_trap_cards.length
  const totalCount = monsterCount + magicTrapCount

  if (loading) {
    return (
      <main style={{ background: '#0f0f0f', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#e8c876', fontFamily: 'Georgia, serif', letterSpacing: '0.2em' }}>読み込み中...</div>
      </main>
    )
  }

  return (
    <main style={{ background: '#0f0f0f', minHeight: '100vh', padding: '24px 16px', position: 'relative' }}>
      <Link href="/" style={{ position: 'absolute', top: 16, left: 16, color: '#fff', fontSize: 13, textDecoration: 'none', background: '#2a2a2a', border: '1px solid #666', borderRadius: 6, padding: '6px 14px' }}>← ホーム</Link>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ color: '#e8c876', fontFamily: 'Georgia, serif', letterSpacing: '0.3em', fontSize: 26, margin: 0 }}>DECK</h1>
          <p style={{ color: '#666', fontSize: 11, letterSpacing: '0.15em', marginTop: 4 }}>デッキ管理</p>
        </div>

        {/* Msg */}
        {msg && (
          <div style={{ background: '#1a2a1a', border: '1px solid #4a8a4a', borderRadius: 8, padding: '10px 16px', marginBottom: 16, color: '#90f090', textAlign: 'center', fontSize: 13 }}>
            {msg}
          </div>
        )}

        {ownedCards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#666' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
            <p style={{ fontSize: 15, marginBottom: 8 }}>まだカードを持っていません</p>
            <p style={{ fontSize: 13 }}>パック開封でカードを集めよう</p>
            <Link href="/shop" style={{ display: 'inline-block', marginTop: 20, background: '#e8c876', color: '#0f0f0f', padding: '12px 24px', borderRadius: 8, fontWeight: 'bold', fontSize: 13, textDecoration: 'none' }}>
              パック開封へ
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>

            {/* Left: Owned Cards */}
            <div>
              {/* Tabs */}
              <div style={{ display: 'flex', gap: 2, marginBottom: 16 }}>
                {(['monster', 'magic_trap'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: '8px 20px', border: 'none', borderRadius: '6px 6px 0 0', cursor: 'pointer', fontSize: 13,
                      background: activeTab === tab ? '#1a1000' : '#111',
                      color: activeTab === tab ? '#e8c876' : '#666',
                      borderBottom: activeTab === tab ? '2px solid #e8c876' : '2px solid transparent',
                      fontWeight: activeTab === tab ? 'bold' : 'normal',
                    }}
                  >
                    {tab === 'monster' ? `モンスター (${ownedCards.filter(c => c.type === 'monster').length})` : `魔法・罠 (${ownedCards.filter(c => c.type !== 'monster').length})`}
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10, background: '#111', borderRadius: '0 8px 8px 8px', padding: 16, maxHeight: '70vh', overflowY: 'auto' }}>
                {ownedByTab.map(card => {
                  const inDeck = countInDeck(card.id)
                  const max = card.max_in_deck ?? 3
                  const canAdd = inDeck < max && inDeck < card.owned
                  return (
                    <div
                      key={card.id}
                      onClick={() => canAdd && addCard(card)}
                      style={{
                        background: '#1a0a00', border: `2px solid ${canAdd ? '#5c3a00' : '#2a1a00'}`,
                        borderRadius: 8, overflow: 'hidden', cursor: canAdd ? 'pointer' : 'default',
                        opacity: canAdd ? 1 : 0.5, transition: 'all 0.15s',
                        position: 'relative',
                      }}
                      title={canAdd ? `${card.name}をデッキに追加` : `上限達成 (${inDeck}/${max})`}
                    >
                      <div style={{ aspectRatio: '4/3', overflow: 'hidden' }}>
                        <img src={cardImg(card)} alt={card.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div style={{ padding: '6px 8px' }}>
                        {(() => { const rs = rarityStyle[card.rarity ?? 'N'] ?? rarityStyle['N']; return <span style={{ background: rs.color, color: '#000', fontSize: 8, padding: '1px 4px', borderRadius: 3, fontWeight: 'bold', marginBottom: 3, display: 'inline-block' }}>{rs.label}</span> })()}
                        <div style={{ color: '#e8c876', fontSize: 10, fontWeight: 'bold', lineHeight: 1.3, marginBottom: 3 }}>{card.name}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#888' }}>
                          <span>所持 {card.owned}</span>
                          <span style={{ color: inDeck > 0 ? '#90c890' : '#555' }}>IN {inDeck}/{max}</span>
                        </div>
                      </div>
                      {canAdd && (
                        <div style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(232,200,118,0.9)', color: '#0f0f0f', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 'bold' }}>
                          +
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Right: Deck */}
            <div>
              <div style={{ background: '#111', borderRadius: 10, padding: 16, position: 'sticky', top: 20 }}>
                {/* Deck name */}
                <input
                  value={deckName}
                  onChange={e => setDeckName(e.target.value)}
                  style={{ width: '100%', background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, padding: '8px 10px', color: '#e8c876', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}
                />

                {/* Deck count */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#888', marginBottom: 12 }}>
                  <span>合計 <strong style={{ color: '#e8c876' }}>{totalCount}</strong> 枚</span>
                  <span>モンスター {monsterCount} / 魔法罠 {magicTrapCount}</span>
                </div>

                {/* Monster section */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ color: '#6090ff', fontSize: 11, fontWeight: 'bold', letterSpacing: '0.1em', marginBottom: 6, padding: '4px 0', borderBottom: '1px solid #2a2a3a' }}>
                    ■ モンスター ({monsterCount})
                  </div>
                  {deckGroups('monster').length === 0 ? (
                    <div style={{ color: '#444', fontSize: 11, textAlign: 'center', padding: '8px 0' }}>なし</div>
                  ) : deckGroups('monster').map(({ id, cnt, card }) => (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid #1a1a1a' }}>
                      <div style={{ width: 36, height: 27, borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                        <img src={card ? cardImg(card) : ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#e8c876', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card?.name ?? id}</div>
                        <div style={{ color: '#888', fontSize: 10 }}>×{cnt}</div>
                      </div>
                      <button
                        onClick={() => removeCard(id, 'monster')}
                        style={{ background: 'none', border: 'none', color: '#c06060', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
                        title="1枚取り除く"
                      >
                        −
                      </button>
                    </div>
                  ))}
                </div>

                {/* Magic/Trap section */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ color: '#60c060', fontSize: 11, fontWeight: 'bold', letterSpacing: '0.1em', marginBottom: 6, padding: '4px 0', borderBottom: '1px solid #1a2a1a' }}>
                    ■ 魔法・罠 ({magicTrapCount})
                  </div>
                  {deckGroups('magic_trap').length === 0 ? (
                    <div style={{ color: '#444', fontSize: 11, textAlign: 'center', padding: '8px 0' }}>なし</div>
                  ) : deckGroups('magic_trap').map(({ id, cnt, card }) => (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid #1a1a1a' }}>
                      <div style={{ width: 36, height: 27, borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                        <img src={card ? cardImg(card) : ''} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#e8c876', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card?.name ?? id}</div>
                        <div style={{ color: '#888', fontSize: 10 }}>×{cnt}</div>
                      </div>
                      <button
                        onClick={() => removeCard(id, 'magic_trap')}
                        style={{ background: 'none', border: 'none', color: '#c06060', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
                        title="1枚取り除く"
                      >
                        −
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={saveDeck}
                  disabled={saving}
                  style={{ width: '100%', padding: '12px', border: 'none', borderRadius: 8, background: saving ? '#444' : '#e8c876', color: saving ? '#888' : '#0f0f0f', fontWeight: 'bold', fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer' }}
                >
                  {saving ? '保存中...' : '💾 デッキを保存'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
