'use client'

import { useState } from 'react'

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

export default function CardItem({ card }: { card: Card }) {
  const [isAwake, setIsAwake] = useState(false)

  if (card.type !== 'monster') {
    return (
      <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
        <img
          src={card.img ?? ''}
          alt={card.name}
          className="w-full aspect-[4/3] object-cover"
        />
        <div className="p-2">
          <p className="text-white text-sm font-bold">{card.name}</p>
          <p className="text-gray-400 text-xs">{card.effect}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 cursor-pointer"
      onClick={() => setIsAwake(!isAwake)}
    >
      <img
        src={isAwake ? (card.img_awake ?? '') : (card.img_sealed ?? '')}
        alt={card.name}
        className="w-full aspect-[4/3] object-cover transition-all duration-300"
      />
      <div className="p-2">
        <div className="flex justify-between items-center mb-1">
          <p className="text-white text-sm font-bold">{card.name}</p>
          <span className={`text-xs px-2 py-0.5 rounded-full ${isAwake ? 'bg-purple-600 text-white' : 'bg-blue-900 text-blue-300'}`}>
            {isAwake ? '覚醒' : '封印'}
          </span>
        </div>
        <p className="text-gray-400 text-xs">
          ATK {isAwake ? card.atk_awake : card.atk_sealed} / DEF {isAwake ? card.def_awake : card.def_sealed}
        </p>
        {isAwake && card.effect_awake && (
          <p className="text-purple-300 text-xs mt-1">{card.effect_awake}</p>
        )}
      </div>
    </div>
  )
}