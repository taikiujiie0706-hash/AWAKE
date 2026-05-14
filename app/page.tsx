import { supabase } from '@/lib/supabase'
import CardItem from './components/CardItem'

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
}

export default async function Home() {
  const { data: cards } = await supabase.from('cards').select('*')

  return (
    <main className="min-h-screen bg-gray-900 p-8">
      <h1 className="text-3xl font-bold text-yellow-400 mb-8 text-center">AWAKE</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
        {cards?.map((card: Card) => (
          <CardItem key={card.id} card={card} />
        ))}
      </div>
    </main>
  )
}