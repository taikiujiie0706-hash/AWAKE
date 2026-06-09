'use client'

import { useState, useEffect, useRef } from 'react'
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
}

type Pack = {
  id: string
  name: string
  description: string
  price_coins: number
  cards_per_pack: number
}

const attributeColor: Record<string, string> = {
  '火': '#dc3c28', '水': '#2864dc', '風': '#28a050', '地': '#555',
  '闇': '#6428b4', '光': '#c8b428',
}

type Phase = 'idle' | 'video' | 'reveal'

export default function ShopPage() {
  const [coins, setCoins] = useState<number | null>(null)
  const [allCards, setAllCards] = useState<CardData[]>([])
  const [packs, setPacks] = useState<Pack[]>([])
  const [canLoginBonus, setCanLoginBonus] = useState(false)
  const [showBonusModal, setShowBonusModal] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')

  const [lastPackCards, setLastPackCards] = useState<CardData[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [msg, setMsg] = useState('')

  // カード情報と二重発火ガードをrefで管理
  const pendingCards = useRef<CardData[]>([])
  const revealStarted = useRef(false)
  const supabase = createClient()

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) { window.location.href = '/login'; return }

      const [profileRes, cardsRes, packsRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('cards').select('id,name,name_awake,type,img_sealed,img_awake,img,atk_sealed,def_sealed,attribute'),
        supabase.from('packs').select('*'),
      ])

      if (!profileRes.data) {
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles').insert({ id: user.id, coins: 1000 }).select().maybeSingle()
        if (insertError) setErrorMsg(`プロフィール作成失敗: ${insertError.message}`)
        setCoins(newProfile?.coins ?? 1000)
        setCanLoginBonus(true)
        setShowBonusModal(true)
      } else {
        setCoins(profileRes.data.coins)
        const today = new Date().toISOString().split('T')[0]
        const hasBonus = profileRes.data.last_login_bonus !== today
        setCanLoginBonus(hasBonus)
        if (hasBonus) setShowBonusModal(true)
      }

      setAllCards(cardsRes.data ?? [])
      setPacks(packsRes.data ?? [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function claimLoginBonus() {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return
    const today = new Date().toISOString().split('T')[0]
    const newCoins = (coins ?? 0) + 100
    const { error } = await supabase.from('profiles').update({ coins: newCoins, last_login_bonus: today }).eq('id', user.id)
    if (error) { setErrorMsg(`ボーナス付与失敗: ${error.message}`); return }
    setCoins(newCoins)
    setCanLoginBonus(false)
    setShowBonusModal(false)
  }

  async function openPack(pack: Pack) {
    if (coins === null || coins < pack.price_coins || phase !== 'idle') return
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return

    // カードを先に選ぶ
    const shuffled = [...allCards].sort(() => Math.random() - 0.5)
    const selected = shuffled.slice(0, pack.cards_per_pack)

    // ref に格納してstale closureを避ける
    pendingCards.current = selected

    // UI を即座に更新（コイン減算 + ビデオ開始）
    const newCoins = coins - pack.price_coins
    setCoins(newCoins)
    setPhase('video')

    // コイン更新（.then()で実行を確実に発火）
    supabase.from('profiles').update({ coins: newCoins }).eq('id', user.id)
      .then(({ error }) => { if (error) console.error('coins update failed:', error) })
    // カード保存（バックグラウンド並列実行）
    Promise.all(selected.map(async (card) => {
      const { data: existing } = await supabase.from('user_cards')
        .select('count').eq('user_id', user.id).eq('card_id', card.id).maybeSingle()
      if (existing) {
        await supabase.from('user_cards')
          .update({ count: existing.count + 1 }).eq('user_id', user.id).eq('card_id', card.id)
      } else {
        await supabase.from('user_cards')
          .insert({ user_id: user.id, card_id: card.id, count: 1 })
      }
    })).catch(e => console.error('card save error:', e))
  }

  function doReveal() {
    if (revealStarted.current) return
    revealStarted.current = true
    setPhase('reveal')
  }

  function closeReveal() {
    revealStarted.current = false
    setLastPackCards([...pendingCards.current])
    setPhase('idle')
  }

  function showMsg(text: string) {
    setMsg(text)
    setTimeout(() => setMsg(''), 3000)
  }

  function cardImg(card: CardData) {
    return card.type === 'monster' ? (card.img_sealed ?? '') : (card.img ?? '')
  }

  const cards = pendingCards.current
  const firstPack = packs[0]
  const canOpen = firstPack && (coins ?? 0) >= firstPack.price_coins && phase === 'idle'

  if (loading) {
    return (
      <main style={{ background: '#0f0f0f', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#e8c876', fontFamily: 'Georgia, serif', letterSpacing: '0.2em' }}>読み込み中...</div>
      </main>
    )
  }

  return (
    <main style={{ background: '#0f0f0f', minHeight: '100vh' }}>

      {/* ログインボーナスモーダル */}
      {showBonusModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#1a1200', border: '2px solid #e8c876', borderRadius: 20, padding: '40px 48px', textAlign: 'center', maxWidth: 340, width: '90%', boxShadow: '0 0 60px rgba(232,200,118,0.25)' }}>
            <div style={{ fontSize: 52, marginBottom: 8 }}>🎁</div>
            <div style={{ color: '#e8c876', fontFamily: 'Georgia, serif', fontSize: 20, letterSpacing: '0.2em', marginBottom: 4 }}>ログインボーナス</div>
            <div style={{ color: '#a08840', fontSize: 12, marginBottom: 28 }}>毎日ログインするともらえます</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 32 }}>
              <span style={{ fontSize: 36 }}>🪙</span>
              <span style={{ color: '#e8c876', fontFamily: 'Georgia, serif', fontSize: 48, fontWeight: 'bold', lineHeight: 1 }}>+100</span>
            </div>
            <button
              onClick={claimLoginBonus}
              style={{ width: '100%', background: '#e8c876', color: '#0f0f0f', border: 'none', borderRadius: 10, padding: '14px 0', fontSize: 16, fontWeight: 'bold', cursor: 'pointer', letterSpacing: '0.1em' }}
            >
              受け取る
            </button>
          </div>
        </div>
      )}

      {/* Top nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #1e1e1e' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#2a2a2a', border: '1px solid #444', color: '#ccc', textDecoration: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 14, fontWeight: 'bold' }}>
          ← ホーム
        </Link>
        <h1 style={{ color: '#e8c876', fontFamily: 'Georgia, serif', letterSpacing: '0.3em', fontSize: 22, margin: 0 }}>SHOP</h1>
        <div style={{ background: '#1a1500', border: '1px solid #5c4a00', borderRadius: 8, padding: '8px 16px', color: '#e8c876', fontSize: 18, fontFamily: 'Georgia, serif', minWidth: 100, textAlign: 'center' }}>
          🪙 {coins ?? '—'}
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px' }}>

        {errorMsg && (
          <div style={{ background: '#2a1a1a', border: '1px solid #8a4a4a', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#f08080', textAlign: 'center', fontSize: 14 }}>{errorMsg}</div>
        )}
        {msg && (
          <div style={{ background: '#1a2a1a', border: '1px solid #4a8a4a', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#90f090', textAlign: 'center', fontSize: 14 }}>{msg}</div>
        )}

        {/* Login Bonus */}
        {canLoginBonus && (
          <div style={{ background: '#1a1500', border: '1px solid #5c4a00', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ color: '#e8c876', fontWeight: 'bold', fontSize: 14, marginBottom: 4 }}>🎁 ログインボーナス</div>
              <div style={{ color: '#a08840', fontSize: 12 }}>本日分のボーナスを受け取れます</div>
            </div>
            <button onClick={claimLoginBonus} style={{ background: '#e8c876', color: '#0f0f0f', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 'bold', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
              +100コイン
            </button>
          </div>
        )}

        {/* 今回の入手カード（オーバーレイを閉じた後に表示） */}
        {lastPackCards.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ color: '#e8c876', fontSize: 13, fontWeight: 'bold', letterSpacing: '0.1em' }}>✨ 今回の入手カード</div>
              <Link href="/deck" style={{ background: '#2a3a2a', border: '1px solid #4a6a4a', color: '#90c890', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 'bold', textDecoration: 'none' }}>
                📋 デッキ管理で確認 →
              </Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {lastPackCards.map((card, i) => (
                <div key={i} style={{ background: '#1a0a00', border: '1px solid #3a2000', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ aspectRatio: '4/3', overflow: 'hidden' }}>
                    <img src={cardImg(card)} alt={card.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ padding: '5px 7px' }}>
                    {card.attribute && <span style={{ background: attributeColor[card.attribute] ?? '#555', color: '#fff', fontSize: 8, padding: '1px 4px', borderRadius: 3, display: 'inline-block', marginBottom: 2 }}>{card.attribute}</span>}
                    <div style={{ color: '#e8c876', fontSize: 10, fontWeight: 'bold', lineHeight: 1.3 }}>{card.name}</div>
                    <div style={{ color: '#555', fontSize: 9, marginTop: 1 }}>{card.type === 'monster' ? `ATK ${card.atk_sealed}` : card.type === 'spell' ? '魔法' : '罠'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Box hero */}
        <div onClick={() => firstPack && canOpen && openPack(firstPack)} style={{ textAlign: 'center', marginBottom: 24, cursor: canOpen ? 'pointer' : 'default' }}>
          <img src="/box.png" alt="カードボックス" style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain', filter: canOpen ? 'drop-shadow(0 0 32px rgba(232,200,118,0.5))' : 'drop-shadow(0 0 16px rgba(232,200,118,0.1)) brightness(0.5)', transition: 'filter 0.3s' }} />
          <div style={{ marginTop: 8, color: canOpen ? '#a08840' : '#444', fontSize: 12, letterSpacing: '0.1em' }}>
            {canOpen ? 'タップして開封' : coins !== null && coins < (firstPack?.price_coins ?? 0) ? 'コインが足りません' : ''}
          </div>
        </div>

        {/* Pack card */}
        {packs.map(pack => {
          const affordable = (coins ?? 0) >= pack.price_coins && phase === 'idle'
          return (
            <div key={pack.id} style={{ background: '#1a1000', border: '1px solid #5c3a00', borderRadius: 16, overflow: 'hidden', display: 'flex', alignItems: 'stretch' }}>
              <div style={{ width: 120, flexShrink: 0, background: '#0f0800', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
                <img src="/pack.png" alt="パック" style={{ width: '100%', maxHeight: 140, objectFit: 'contain', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.7))' }} />
              </div>
              <div style={{ flex: 1, padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ color: '#e8c876', fontWeight: 'bold', fontSize: 17, marginBottom: 4 }}>{pack.name}</div>
                  <div style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>{pack.cards_per_pack}枚入り</div>
                  <p style={{ color: '#a08840', fontSize: 12, lineHeight: 1.7, margin: 0 }}>{pack.description}</p>
                </div>
                <button onClick={() => openPack(pack)} disabled={!affordable} style={{ marginTop: 14, padding: '11px 0', border: 'none', borderRadius: 8, background: affordable ? '#e8c876' : '#2a2a2a', color: affordable ? '#0f0f0f' : '#555', fontWeight: 'bold', fontSize: 14, cursor: affordable ? 'pointer' : 'not-allowed', transition: 'background 0.2s' }}>
                  🪙 {pack.price_coins} コインで開封
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Video overlay */}
      {phase === 'video' && (
        <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 200 }}>
          <video
            autoPlay
            muted
            playsInline
            onEnded={doReveal}
            onError={doReveal}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          >
            <source src="/pack_open.mp4" type="video/mp4" />
          </video>
          <button
            onClick={doReveal}
            style={{ position: 'absolute', bottom: 28, right: 28, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: 'rgba(255,255,255,0.7)', borderRadius: 6, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}
          >
            スキップ →
          </button>
        </div>
      )}

      {/* Card reveal overlay */}
      {phase === 'reveal' && (
        <div style={{ position: 'fixed', inset: 0, background: '#0a0500', zIndex: 200, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', gap: 24 }}>

            {/* カード一覧 */}
            {cards.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, width: '100%', maxWidth: 680 }}>
                {cards.map((card, i) => (
                  <div
                    key={i}
                    style={{
                      background: '#1a0a00',
                      border: '2px solid #5c3a00',
                      borderRadius: 10,
                      overflow: 'hidden',
                      boxShadow: '0 0 16px rgba(232,200,118,0.3)',
                    }}
                  >
                    <div style={{ aspectRatio: '4/3', overflow: 'hidden' }}>
                      <img src={cardImg(card)} alt={card.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ padding: '7px 9px' }}>
                      {card.attribute && (
                        <span style={{ background: attributeColor[card.attribute] ?? '#555', color: '#fff', fontSize: 9, padding: '2px 5px', borderRadius: 3, marginBottom: 3, display: 'inline-block' }}>
                          {card.attribute}
                        </span>
                      )}
                      <div style={{ color: '#e8c876', fontSize: 11, fontWeight: 'bold', marginTop: 2, lineHeight: 1.3 }}>{card.name}</div>
                      <div style={{ color: '#666', fontSize: 10, marginTop: 2 }}>
                        {card.type === 'monster' ? `ATK ${card.atk_sealed}` : card.type === 'spell' ? '魔法' : '罠'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: '#666', fontSize: 14 }}>カードが取得できませんでした</div>
            )}

            {/* 次への導線（常に表示） */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
              <Link
                href="/deck"
                onClick={closeReveal}
                style={{ background: '#2a4a2a', color: '#90e090', border: '1px solid #4a8a4a', borderRadius: 10, padding: '14px 28px', fontWeight: 'bold', fontSize: 15, textDecoration: 'none' }}
              >
                📋 デッキ管理へ
              </Link>
              <button
                onClick={closeReveal}
                style={{ background: '#e8c876', color: '#0f0f0f', border: 'none', borderRadius: 10, padding: '14px 28px', fontWeight: 'bold', fontSize: 15, cursor: 'pointer' }}
              >
                続けて開封
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
