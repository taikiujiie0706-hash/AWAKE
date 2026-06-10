'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { getRank } from '@/lib/rank'

const rankColor: Record<string, string> = {
  S: '#e040fb',
  A: '#d4af37',
  B: '#4a8fdf',
  C: '#4caf50',
  D: '#999',
  E: '#888',
}

export default function RankBadge() {
  const [rank, setRank] = useState<string | null>(null)
  const [wins, setWins] = useState<number | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('wins').eq('id', user.id).maybeSingle()
      const w = profile?.wins ?? 0
      setWins(w)
      setRank(getRank(w))
    })
  }, [])

  if (wins === null) return null

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '6px 16px', borderRadius: 8,
      background: '#1a1a1a', border: '1px solid #2a2a2a',
    }}>
      <span style={{ color: '#666', fontSize: 10, letterSpacing: '0.1em' }}>RANK</span>
      <span style={{ color: rank ? rankColor[rank] : '#555', fontWeight: 'bold', fontSize: 18, fontFamily: 'Georgia, serif' }}>
        {rank ?? '-'}
      </span>
      <span style={{ color: '#555', fontSize: 10 }}>{wins}勝</span>
    </div>
  )
}
