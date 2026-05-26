import { createClient } from '@/lib/supabase'
import CardItem from './components/CardItem'
import LogoutButton from './components/LogoutButton'

type Card = {
  id: string
  name: string
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
        <div className="flex justify-between items-center mb-10">
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
            <p className="text-xs mt-2" style={{ color: '#666', letterSpacing: '0.2em' }}>
              カード一覧
            </p>
          </div>
          <LogoutButton />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {cards?.map((card: Card) => (
            <CardItem key={card.id} card={card} />
          ))}
        </div>
      </div>
    </main>
  )
}