'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function OnlineLobbyPage() {
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [myDeck, setMyDeck] = useState<{ monster_cards: string[]; magic_trap_cards: string[] } | null>(null)
  const [roomCode, setRoomCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [phase, setPhase] = useState<'idle' | 'hosting' | 'joining'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [roomId, setRoomId] = useState('')
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const email = session.user.email ?? ''
      setUserId(session.user.id)
      const name = email.split('@')[0]
      setDisplayName(name)

      const { data: deck } = await supabase.from('decks')
        .select('monster_cards,magic_trap_cards')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false })
        .limit(1).maybeSingle()
      if (deck) setMyDeck(deck)

      setLoading(false)
    }
    init()
    return () => {
      channelRef.current?.unsubscribe()
    }
  }, [router])

  async function createRoom() {
    if (!userId) return
    setErrorMsg('')
    const supabase = createClient()
    const code = Math.random().toString(36).slice(2, 8).toUpperCase()

    const { data, error } = await supabase.from('online_battles').insert({
      room_code: code,
      host_id: userId,
      host_name: displayName,
      host_deck: myDeck ?? { monster_cards: [], magic_trap_cards: [] },
      status: 'waiting',
    }).select().single()

    if (error || !data) {
      setErrorMsg('部屋の作成に失敗しました: ' + (error?.message ?? ''))
      return
    }

    setRoomCode(code)
    setRoomId(data.id)
    setPhase('hosting')

    const channel = supabase.channel(`lobby:${data.id}`)
    channel.on('broadcast', { event: 'guest_joined' }, ({ payload }: { payload: { guestName: string } }) => {
      channel.unsubscribe()
      router.push(`/battle?room=${data.id}&role=host&opponent=${encodeURIComponent(payload.guestName)}`)
    })
    channel.subscribe()
    channelRef.current = channel
  }

  async function joinRoom() {
    if (!userId) return
    if (!joinCode.trim()) { setErrorMsg('ルームコードを入力してください'); return }
    setErrorMsg('')
    const supabase = createClient()

    const { data: room, error } = await supabase
      .from('online_battles')
      .select('id,host_id,host_name,status')
      .eq('room_code', joinCode.trim().toUpperCase())
      .eq('status', 'waiting')
      .maybeSingle()

    if (error || !room) {
      setErrorMsg('部屋が見つかりません。コードを確認してください')
      return
    }
    if (room.host_id === userId) {
      setErrorMsg('自分が作成した部屋には参加できません')
      return
    }

    const { error: updateError } = await supabase.from('online_battles').update({
      guest_id: userId,
      guest_name: displayName,
      guest_deck: myDeck ?? { monster_cards: [], magic_trap_cards: [] },
      status: 'playing',
    }).eq('id', room.id)

    if (updateError) {
      setErrorMsg('参加に失敗しました: ' + updateError.message)
      return
    }

    const hostName = room.host_name ?? '相手'
    setPhase('joining')

    const channel = supabase.channel(`lobby:${room.id}`)
    channel.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        await channel.send({ type: 'broadcast', event: 'guest_joined', payload: { guestName: displayName } })
        channel.unsubscribe()
        router.push(`/battle?room=${room.id}&role=guest&opponent=${encodeURIComponent(hostName)}`)
      }
    })
    channelRef.current = channel
  }

  async function cancelRoom() {
    if (!roomId) return
    channelRef.current?.unsubscribe()
    const supabase = createClient()
    await supabase.from('online_battles').delete().eq('id', roomId)
    setPhase('idle')
    setRoomCode('')
    setRoomId('')
  }

  const bg: React.CSSProperties = { background: '#0f0f0f', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 24, fontFamily: 'monospace', padding: 24 }
  const cardStyle: React.CSSProperties = { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: '24px 32px', width: '100%', maxWidth: 420 }
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: '#111', border: '1px solid #444', borderRadius: 8, color: '#fff', fontSize: 14, boxSizing: 'border-box' }
  const btnPrimary: React.CSSProperties = { background: '#e8c876', color: '#0f0f0f', border: 'none', borderRadius: 8, padding: '11px 0', width: '100%', fontSize: 14, fontWeight: 'bold', cursor: 'pointer', marginTop: 8 }
  const btnSecondary: React.CSSProperties = { background: '#2a2a2a', color: '#aaa', border: '1px solid #444', borderRadius: 8, padding: '10px 0', width: '100%', fontSize: 13, cursor: 'pointer', marginTop: 6 }

  if (loading) return (
    <main style={bg}><div style={{ color: '#e8c876' }}>読み込み中...</div></main>
  )

  return (
    <main style={bg}>
      <a href="/" style={{ position: 'absolute', top: 16, left: 16, color: '#fff', fontSize: 13, textDecoration: 'none', background: '#2a2a2a', border: '1px solid #666', borderRadius: 6, padding: '6px 14px' }}>← ホーム</a>

      <div style={{ textAlign: 'center' }}>
        <h1 style={{ color: '#e8c876', fontFamily: 'Georgia, serif', fontSize: 36, letterSpacing: '0.3em', margin: 0 }}>AWAKE</h1>
        <div style={{ color: '#555', fontSize: 11, marginTop: 4, letterSpacing: '0.2em' }}>ONLINE BATTLE</div>
      </div>

      <div style={{ ...cardStyle, textAlign: 'center', padding: '12px 24px' }}>
        <div style={{ color: '#666', fontSize: 11, marginBottom: 2 }}>プレイヤー名</div>
        <div style={{ color: '#e8c876', fontSize: 16, fontWeight: 'bold' }}>{displayName}</div>
        <div style={{ color: myDeck ? '#4a8' : '#a44', fontSize: 11, marginTop: 4 }}>
          {myDeck
            ? `デッキ: モンスター ${myDeck.monster_cards.length}枚 / 魔法・罠 ${myDeck.magic_trap_cards.length}枚`
            : 'デッキ未作成 — ランダムデッキで対戦'}
        </div>
        {!myDeck && (
          <a href="/deck" style={{ color: '#8af', fontSize: 11, display: 'block', marginTop: 4 }}>デッキを作成する →</a>
        )}
      </div>

      {phase === 'idle' && (
        <>
          {/* 部屋を作る */}
          <div style={cardStyle}>
            <div style={{ color: '#e8c876', fontSize: 13, fontWeight: 'bold', marginBottom: 12 }}>部屋を作る</div>
            <div style={{ color: '#666', fontSize: 11, marginBottom: 12, lineHeight: 1.6 }}>
              ルームコードを友達に共有して対戦できます。
            </div>
            <button style={btnPrimary} onClick={createRoom}>部屋を作成する</button>
          </div>

          {/* 部屋に参加 */}
          <div style={cardStyle}>
            <div style={{ color: '#e8c876', fontSize: 13, fontWeight: 'bold', marginBottom: 12 }}>部屋に参加する</div>
            <input
              style={inputStyle}
              placeholder="ルームコードを入力（例: AB1C2D）"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && joinRoom()}
              maxLength={6}
            />
            <button style={btnPrimary} onClick={joinRoom}>参加する</button>
          </div>

          {errorMsg && (
            <div style={{ color: '#f88', fontSize: 12, textAlign: 'center', maxWidth: 420 }}>{errorMsg}</div>
          )}
        </>
      )}

      {phase === 'hosting' && (
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ color: '#555', fontSize: 11, marginBottom: 8 }}>ルームコード</div>
          <div style={{ color: '#e8c876', fontSize: 40, fontWeight: 'bold', fontFamily: 'Georgia, serif', letterSpacing: '0.4em', marginBottom: 16 }}>
            {roomCode}
          </div>
          <div style={{ color: '#666', fontSize: 12, marginBottom: 20, lineHeight: 1.6 }}>
            このコードを対戦相手に伝えてください。<br />相手が参加すると自動でデュエルが始まります。
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#4a8', animation: 'pulse 1.5s ease-in-out infinite' }} />
            <div style={{ color: '#4a8', fontSize: 12 }}>相手の参加を待っています...</div>
          </div>
          <style>{`@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }`}</style>
          <button style={btnSecondary} onClick={cancelRoom}>キャンセル</button>
        </div>
      )}

      {phase === 'joining' && (
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>🌀</div>
          <div style={{ color: '#e8c876', fontSize: 14 }}>接続中...</div>
          <div style={{ color: '#555', fontSize: 11, marginTop: 8 }}>デュエル画面に移動します</div>
        </div>
      )}
    </main>
  )
}
