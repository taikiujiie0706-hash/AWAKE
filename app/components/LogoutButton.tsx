'use client'

import { createClient } from '@/lib/supabase'

export default function LogoutButton() {
  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <button
      onClick={handleLogout}
      className="px-4 py-2 rounded-lg text-sm"
      style={{ background: '#2a2a2a', border: '1px solid #444', color: '#888' }}
    >
      ログアウト
    </button>
  )
}