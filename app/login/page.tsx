'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [message, setMessage] = useState('')

  const supabase = createClient()

  const handleEmailAuth = async () => {
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setMessage(error.message)
      } else {
        window.location.replace('/')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setMessage(error.message)
      } else {
        window.location.replace('/')
      }
    }
  }

  const handleGoogleAuth = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    })
    if (error) setMessage(error.message)
  }

  return (
    <main className="min-h-screen flex items-center justify-center" style={{ background: '#0f0f0f' }}>
      <div
        className="w-full max-w-sm p-8 rounded-xl"
        style={{ background: '#1a1a1a', border: '1px solid #333' }}
      >
        <h1
          className="text-3xl font-bold text-center mb-8"
          style={{ color: '#e8c876', fontFamily: 'Georgia, serif', letterSpacing: '0.3em' }}
        >
          AWAKE
        </h1>

        <div className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-3 rounded-lg text-white text-sm outline-none"
            style={{ background: '#2a2a2a', border: '1px solid #444' }}
          />
          <input
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 rounded-lg text-white text-sm outline-none"
            style={{ background: '#2a2a2a', border: '1px solid #444' }}
          />

          <button
            onClick={handleEmailAuth}
            className="w-full py-3 rounded-lg font-bold text-sm"
            style={{ background: '#e8c876', color: '#0f0f0f' }}
          >
            {isSignUp ? '新規登録' : 'ログイン'}
          </button>

          <div className="text-center" style={{ color: '#555', fontSize: '0.75rem' }}>
            または
          </div>

          <button
            onClick={handleGoogleAuth}
            className="w-full py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2"
            style={{ background: '#2a2a2a', border: '1px solid #444', color: '#fff' }}
          >
            Googleでログイン
          </button>

          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-center text-xs"
            style={{ color: '#888' }}
          >
            {isSignUp ? 'ログインはこちら' : 'アカウントをお持ちでない方はこちら'}
          </button>

          {message && (
            <p className="text-center text-xs" style={{ color: '#ff6060' }}>
              {message}
            </p>
          )}
        </div>
      </div>
    </main>
  )
}