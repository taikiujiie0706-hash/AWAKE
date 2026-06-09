'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

type Phase = 'waiting' | 'ready' | 'done' | 'error'

export default function UpdatePasswordPage() {
  const [phase, setPhase] = useState<Phase>('waiting')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const supabase = createClient()

  useEffect(() => {
    // PASSWORD_RECOVERY イベントが来たらフォームを表示
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPhase('ready')
      }
    })

    // タイムアウト：5秒経ってもイベントが来なければエラー表示
    const timer = setTimeout(() => {
      setPhase(p => p === 'waiting' ? 'error' : p)
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  async function handleUpdate() {
    if (!password || !confirm) {
      setMessage('すべての項目を入力してください')
      return
    }
    if (password.length < 6) {
      setMessage('パスワードは6文字以上で入力してください')
      return
    }
    if (password !== confirm) {
      setMessage('パスワードが一致しません')
      return
    }

    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setMessage('エラー: ' + error.message)
    } else {
      setPhase('done')
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 16px', borderRadius: 8,
    background: '#2a2a2a', border: '1px solid #444',
    color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
  }

  if (phase === 'waiting') {
    return (
      <main style={{ background: '#0f0f0f', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#e8c876', fontFamily: 'Georgia, serif', letterSpacing: '0.2em' }}>認証中...</div>
      </main>
    )
  }

  if (phase === 'error') {
    return (
      <main style={{ background: '#0f0f0f', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <div style={{ color: '#f08080', fontSize: 15, marginBottom: 8 }}>リンクが無効か期限切れです</div>
          <div style={{ color: '#666', fontSize: 13, marginBottom: 28 }}>パスワードリセットをもう一度お試しください</div>
          <a href="/login" style={{ display: 'inline-block', background: '#e8c876', color: '#0f0f0f', padding: '11px 28px', borderRadius: 8, fontWeight: 'bold', fontSize: 14, textDecoration: 'none' }}>
            ログインページへ
          </a>
        </div>
      </main>
    )
  }

  if (phase === 'done') {
    return (
      <main style={{ background: '#0f0f0f', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <div style={{ color: '#e8c876', fontFamily: 'Georgia, serif', fontSize: 20, marginBottom: 8 }}>パスワードを更新しました</div>
          <div style={{ color: '#888', fontSize: 13, marginBottom: 28 }}>新しいパスワードでログインできます</div>
          <a href="/" style={{ display: 'inline-block', background: '#e8c876', color: '#0f0f0f', padding: '12px 32px', borderRadius: 8, fontWeight: 'bold', fontSize: 14, textDecoration: 'none' }}>
            ホームへ
          </a>
        </div>
      </main>
    )
  }

  return (
    <main style={{ background: '#0f0f0f', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 360, padding: '36px 28px', borderRadius: 16, background: '#1a1a1a', border: '1px solid #2a2a2a' }}>
        <h1 style={{ color: '#e8c876', fontFamily: 'Georgia, serif', letterSpacing: '0.3em', fontSize: 28, textAlign: 'center', marginBottom: 6 }}>
          AWAKE
        </h1>
        <p style={{ color: '#555', fontSize: 11, textAlign: 'center', letterSpacing: '0.15em', marginBottom: 28 }}>
          新しいパスワードを設定
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            placeholder="新しいパスワード（6文字以上）"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={loading}
            style={inputStyle}
          />
          <input
            type="password"
            placeholder="パスワード（確認）"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleUpdate()}
            disabled={loading}
            style={inputStyle}
          />

          {message && (
            <p style={{ fontSize: 12, color: '#ff7070', textAlign: 'center' }}>{message}</p>
          )}

          <button
            onClick={handleUpdate}
            disabled={loading}
            style={{
              padding: '13px', border: 'none', borderRadius: 8,
              background: loading ? '#a89050' : '#e8c876', color: '#0f0f0f',
              fontWeight: 'bold', fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '更新中...' : 'パスワードを更新する'}
          </button>
        </div>
      </div>
    </main>
  )
}
