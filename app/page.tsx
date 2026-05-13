import { supabase } from '@/lib/supabase'

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
          <div key={card.id} className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
            <img
              src={card.type === 'monster' ? (card.img_sealed ?? '') : (card.img ?? '')}
              alt={card.name}
              className="w-full aspect-video object-cover"
            />
            <div className="p-2">
              <p className="text-white text-sm font-bold">{card.name}</p>
              {card.type === 'monster' && (
                <p className="text-gray-400 text-xs">ATK {card.atk_sealed} / DEF {card.def_sealed}</p>
              )}
              {card.type !== 'monster' && (
                <p className="text-gray-400 text-xs">{card.effect}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}