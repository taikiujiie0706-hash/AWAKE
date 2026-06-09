'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

type Mode = 'login' | 'signup' | 'reset'

const errorToJa: Record<string, string> = {
  'Invalid login credentials': 'メールアドレスまたはパスワードが正しくありません',
  'Email not confirmed': 'メールアドレスの確認が完了していません',
  'User already registered': 'このメールアドレスは既に登録されています',
  'Password should be at least 6 characters': 'パスワードは6文字以上で入力してください',
  'Signup requires a valid password': 'パスワードを入力してください',
  'Unable to validate email address: invalid format': 'メールアドレスの形式が正しくありません',
  'Email rate limit exceeded': 'しばらく時間をおいてから再試行してください',
  'For security purposes, you can only request this after': 'セキュリティのため、しばらくお待ちください',
  'over_email_send_rate_limit': 'しばらく時間をおいてから再試行してください',
}

function toJa(msg: string): string {
  for (const [key, ja] of Object.entries(errorToJa)) {
    if (msg.includes(key)) return ja
  }
  return msg
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const supabase = createClient()

  async function handleSubmit() {
    if (!email || (mode !== 'reset' && !password)) {
      setMessage('すべての項目を入力してください')
      return
    }
    setLoading(true)
    setMessage('')

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
          setMessage(toJa(error.message))
        } else {
          window.location.replace('/')
        }

      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) {
          setMessage(toJa(error.message))
        } else {
          window.location.replace('/')
        }

      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/update-password`
        })
        if (error) {
          setMessage(toJa(error.message))
        } else {
          setIsSuccess(true)
          setMessage(`${email} にパスワードリセットメールを送信しました`)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    })
    if (error) {
      setMessage(toJa(error.message))
      setLoading(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSubmit()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 16px', borderRadius: 8,
    background: '#2a2a2a', border: '1px solid #444',
    color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
  }

  return (
    <main className="min-h-screen flex items-center justify-center" style={{ background: '#0f0f0f' }}>
      <div style={{ width: '100%', maxWidth: 360, padding: '36px 28px', borderRadius: 16, background: '#1a1a1a', border: '1px solid #2a2a2a' }}>

        <h1 style={{ color: '#e8c876', fontFamily: 'Georgia, serif', letterSpacing: '0.3em', fontSize: 32, textAlign: 'center', marginBottom: 6 }}>
          AWAKE
        </h1>
        <p style={{ color: '#555', fontSize: 11, textAlign: 'center', letterSpacing: '0.15em', marginBottom: 28 }}>
          {mode === 'login' ? 'ログイン' : mode === 'signup' ? '新規登録' : 'パスワードリセット'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={loading}
            style={inputStyle}
          />

          {mode !== 'reset' && (
            <input
              type="password"
              placeholder="パスワード（6文字以上）"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={loading}
              style={inputStyle}
            />
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: '100%', padding: '13px', border: 'none', borderRadius: 8,
              background: loading ? '#a89050' : '#e8c876', color: '#0f0f0f',
              fontWeight: 'bold', fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {loading ? '処理中...' : mode === 'login' ? 'ログイン' : mode === 'signup' ? '新規登録' : 'リセットメールを送る'}
          </button>

          {/* Message */}
          {message && (
            <p style={{ fontSize: 12, textAlign: 'center', color: isSuccess ? '#90e090' : '#ff7070', lineHeight: 1.6 }}>
              {message}
            </p>
          )}

          {/* Google login (only for login/signup) */}
          {mode !== 'reset' && (
            <>
              <div style={{ color: '#444', fontSize: 12, textAlign: 'center' }}>または</div>
              <button
                onClick={handleGoogle}
                disabled={loading}
                style={{
                  width: '100%', padding: '12px', border: '1px solid #444', borderRadius: 8,
                  background: '#2a2a2a', color: '#ccc', fontWeight: 'bold', fontSize: 14,
                  cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.4 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.6-8 19.6-20 0-1.3-.1-2.7-.4-4z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3 0 5.7 1.1 7.8 2.9l5.7-5.7C34.1 6.5 29.3 4 24 4c-7.7 0-14.3 4.3-17.7 10.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.8 13.6-4.7l-6.3-5.2C29.3 35.6 26.8 36 24 36c-5.2 0-9.6-2.6-11.3-6.4l-6.6 5C9.7 39.6 16.4 44 24 44z"/><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.4-2.5 4.4-4.6 5.8l6.3 5.2C40.8 35.7 44 30.3 44 24c0-1.3-.1-2.7-.4-4z"/></svg>
                Googleでログイン
              </button>
            </>
          )}

          {/* Mode switchers */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {mode === 'login' && (
              <>
                <button onClick={() => { setMode('signup'); setMessage(''); setIsSuccess(false) }} style={{ background: 'none', border: 'none', color: '#888', fontSize: 12, cursor: 'pointer' }}>
                  アカウントをお持ちでない方はこちら
                </button>
                <button onClick={() => { setMode('reset'); setMessage(''); setIsSuccess(false) }} style={{ background: 'none', border: 'none', color: '#666', fontSize: 11, cursor: 'pointer' }}>
                  パスワードを忘れた方はこちら
                </button>
              </>
            )}
            {mode === 'signup' && (
              <button onClick={() => { setMode('login'); setMessage(''); setIsSuccess(false) }} style={{ background: 'none', border: 'none', color: '#888', fontSize: 12, cursor: 'pointer' }}>
                ログインはこちら
              </button>
            )}
            {mode === 'reset' && (
              <button onClick={() => { setMode('login'); setMessage(''); setIsSuccess(false) }} style={{ background: 'none', border: 'none', color: '#888', fontSize: 12, cursor: 'pointer' }}>
                ← ログインに戻る
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
