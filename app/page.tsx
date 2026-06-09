import { createClient } from '@/lib/supabase'
import CardItem from './components/CardItem'
import LogoutButton from './components/LogoutButton'
import Link from 'next/link'

type Card = {
  id: string
  name: string
  name_awake: string | null
  type: string
  atk_sealed: number | null
  def_sealed: number | null
  atk_awake: number | null
  def_awake: number | null
  effect_awake: string | null
  effect: string | null
  img_sealed: string | null
  img_awake: string | null
  img: string | null
  max_in_deck: number | null
  attribute: string | null
}

export default async function Home() {
  const supabase = createClient()
  const { data: cards } = await supabase.from('cards').select('*')

  return (
    <main className="min-h-screen p-8" style={{ background: '#0f0f0f' }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="text-center flex-1">
            <h1
              className="text-5xl font-bold mb-2"
              style={{
                color: '#e8c876',
                fontFamily: 'Georgia, serif',
                letterSpacing: '0.3em'
              }}
            >
              AWAKE
            </h1>
            <div
              className="h-0.5 w-48 mx-auto"
              style={{ background: 'linear-gradient(90deg, transparent, #5c3a00, transparent)' }}
            />
          </div>
          <LogoutButton />
        </div>

        {/* Navigation */}
        <div className="flex gap-3 mb-8 justify-center">
          {[
            { href: '/shop', label: '📦 パック開封', desc: 'カードを入手' },
            { href: '/deck', label: '📋 デッキ管理', desc: 'デッキを編集' },
            { href: '/battle', label: '⚔️ バトル', desc: 'CPU対戦' },
            { href: '/online', label: '🌐 オンライン', desc: '対人戦' },
          ].map(item => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '14px 24px', borderRadius: 10, textDecoration: 'none',
                background: '#1a1000', border: '1px solid #5c3a00',
                transition: 'all 0.2s', minWidth: 120,
              }}
            >
              <span style={{ color: '#e8c876', fontWeight: 'bold', fontSize: 14 }}>{item.label}</span>
              <span style={{ color: '#666', fontSize: 11, marginTop: 4 }}>{item.desc}</span>
            </Link>
          ))}
        </div>

        <p className="text-xs mb-6 text-center" style={{ color: '#444', letterSpacing: '0.15em' }}>
          ─── カード一覧 ───
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {cards?.map((card: Card) => (
            <CardItem key={card.id} card={card} />
          ))}
        </div>
      </div>
    </main>
  )
}