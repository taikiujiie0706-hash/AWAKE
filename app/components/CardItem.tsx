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
  max_in_deck: number | null
}

export default function CardItem({ card }: { card: Card }) {
  const [isAwake, setIsAwake] = useState(false)

  const isMonster = card.type === 'monster'

  return (
    <div
      className="relative rounded-lg overflow-hidden cursor-pointer group"
      onClick={() => isMonster && setIsAwake(!isAwake)}
      style={{
        border: isAwake
          ? '2px solid rgba(180,100,255,0.8)'
          : '2px solid rgba(100,60,0,0.6)',
        boxShadow: isAwake
          ? '0 0 20px rgba(150,50,255,0.4), inset 0 0 20px rgba(0,0,0,0.3)'
          : '0 4px 15px rgba(0,0,0,0.5), inset 0 0 10px rgba(0,0,0,0.2)',
        background: '#1a0a00',
        transition: 'all 0.3s ease'
      }}
    >
      {/* カード画像 */}
      <div className="relative overflow-hidden aspect-[4/3]">
        <img
          src={isMonster
            ? (isAwake ? (card.img_awake ?? '') : (card.img_sealed ?? ''))
            : (card.img ?? '')}
          alt={card.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {/* 画像オーバーレイ */}
        <div
          className="absolute inset-0"
          style={{
            background: isAwake
              ? 'linear-gradient(to top, rgba(80,0,120,0.7) 0%, transparent 50%)'
              : 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 50%)'
          }}
        />

        {/* タイプバッジ */}
        <div
          className="absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full font-bold"
          style={{
            background: isMonster
              ? isAwake ? 'rgba(120,40,200,0.9)' : 'rgba(40,60,120,0.9)'
              : card.type === 'spell' ? 'rgba(20,100,60,0.9)' : 'rgba(120,40,40,0.9)',
            color: '#fff',
            letterSpacing: '0.05em',
            fontSize: '0.55rem'
          }}
        >
          {isMonster ? (isAwake ? '覚醒' : '封印') : card.type === 'spell' ? '魔法' : '罠'}
        </div>
      </div>

      {/* カード情報 */}
      <div className="p-2" style={{ background: 'rgba(10,5,0,0.9)' }}>
        <p
          className="font-bold text-sm truncate"
          style={{
            color: isAwake ? '#d4a0ff' : '#e8c876',
            fontFamily: 'Georgia, serif',
            letterSpacing: '0.03em'
          }}
        >
          {card.name}
        </p>

        {isMonster && (
          <div className="flex gap-2 mt-1">
            <span className="text-xs" style={{ color: '#ff6060' }}>
              ATK {isAwake ? card.atk_awake : card.atk_sealed}
            </span>
            <span className="text-xs" style={{ color: '#6090ff' }}>
              DEF {isAwake ? card.def_awake : card.def_sealed}
            </span>
          </div>
        )}

        {isMonster && isAwake && card.effect_awake && (
          <p className="text-xs mt-1 leading-relaxed" style={{ color: '#c090ff' }}>
            {card.effect_awake}
          </p>
        )}

        {!isMonster && (
          <p className="text-xs mt-1 leading-relaxed" style={{ color: '#90c890' }}>
            {card.effect}
          </p>
        )}

        {isMonster && (
          <p className="text-xs mt-1 text-right" style={{ color: '#5c3a00' }}>
            {isAwake ? '' : 'タップで覚醒'}
          </p>
        )}
      </div>
    </div>
  )
}