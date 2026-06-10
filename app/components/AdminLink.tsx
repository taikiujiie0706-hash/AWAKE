'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { ADMIN_EMAIL } from '@/lib/admin'
import Link from 'next/link'

export default function AdminLink() {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAdmin(session?.user?.email === ADMIN_EMAIL)
    })
  }, [])

  if (!isAdmin) return null

  return (
    <Link
      href="/admin"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '14px 24px', borderRadius: 10, textDecoration: 'none',
        background: '#1a1000', border: '1px solid #5c3a00',
        transition: 'all 0.2s', minWidth: 120,
      }}
    >
      <span style={{ color: '#e8c876', fontWeight: 'bold', fontSize: 14 }}>🔧 管理画面</span>
      <span style={{ color: '#666', fontSize: 11, marginTop: 4 }}>会員・マスタ管理</span>
    </Link>
  )
}
