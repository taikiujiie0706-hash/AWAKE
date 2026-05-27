'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

type CardData = {
  id: string
  name: string
  name_awake: string | null
  type: string
  atk_sealed: number | null
  def_sealed: number | null
  atk_awake: number | null
  def_awake: number | null
  effect: string | null
  effect_awake: string | null
  img_sealed: string | null
  img_awake: string | null
  img: string | null
  attribute: string | null
  max_in_deck: number | null
}

type FieldCard = {
  uid: string
  data: CardData
  isAwake: boolean
  stance: 'attack' | 'defense'
  hasAttacked: boolean
  atkMod: number
  defMod: number
  cantAttack: boolean
  lockedByUid: string | null
}

type GraveCard = { data: CardData; isAwake: boolean }

type GameState = {
  myLP: number
  oppLP: number
  myHand: CardData[]
  oppHand: CardData[]
  myMonsterDeck: CardData[]
  oppMonsterDeck: CardData[]
  mySpellDeck: CardData[]
  oppSpellDeck: CardData[]
  myFront: (FieldCard | null)[]
  myBack: (FieldCard | null)[]
  oppFront: (FieldCard | null)[]
  oppBack: (FieldCard | null)[]
  mySpellZone: (FieldCard | null)[]
  oppSpellZone: (FieldCard | null)[]
  myGrave: GraveCard[]
  oppGrave: GraveCard[]
  turn: 'my' | 'opp'
  phase: 'draw' | 'main' | 'battle' | 'end'
  normalSummonDone: boolean
  awakeDone: boolean
  log: string[]
  selectedCard: { zone: string; index: number } | null
  pendingEffect: PendingEffect | null
  bannedCards: string[]
  endPhaseDestroyUids: { uid: string; owner: 'my' | 'opp' }[]
  kumomaru_atkDown: { uid: string; owner: 'my' | 'opp' }[]
  isFirstTurn: boolean
}

type PendingEffect =
  | { type: 'select_target'; action: string; sourceZone: string; sourceIndex: number; message: string }
  | { type: 'coin_toss'; graveIndex: number; owner: 'my' | 'opp' }
  | { type: 'confirm'; message: string; onConfirm: string }

function buildDecks(cards: CardData[]) {
  const monsters = cards.filter(c => c.type === 'monster')
  const spells = cards.filter(c => c.type === 'spell' || c.type === 'trap')
  const fillDeck = (pool: CardData[], target: number): CardData[] => {
    const deck: CardData[] = []
    let i = 0
    while (deck.length < target) {
      deck.push({ ...pool[i % pool.length] })
      i++
    }
    return deck.sort(() => Math.random() - 0.5)
  }
  return { monsterDeck: fillDeck(monsters, 15), spellDeck: fillDeck(spells, 15) }
}

function uid() { return Math.random().toString(36).slice(2) }

function toField(card: CardData, isAwake = false): FieldCard {
  return { uid: uid(), data: { ...card }, isAwake, stance: 'attack', hasAttacked: false, atkMod: 0, defMod: 0, cantAttack: false, lockedByUid: null }
}

function placeInitial(deck: CardData[]): { back: (FieldCard | null)[]; remaining: CardData[] } {
  const remaining = [...deck]
  const back: (FieldCard | null)[] = [null, null, null, null, null]
  for (let i = 1; i <= 3; i++) {
    const card = remaining.shift()!
    back[i] = toField(card)
  }
  return { back, remaining }
}

const ATTR_COLOR: Record<string, string> = {
  火: '#c44', 水: '#48c', 風: '#4a8', 地: '#a84', 闇: '#84c', 光: '#cc8',
}

function getAllFieldCards(g: GameState, owner: 'my' | 'opp'): { fc: FieldCard; zone: string; index: number }[] {
  const result: { fc: FieldCard; zone: string; index: number }[] = []
  const zones = owner === 'my'
    ? [{ arr: g.myFront, zone: 'myFront' }, { arr: g.myBack, zone: 'myBack' }]
    : [{ arr: g.oppFront, zone: 'oppFront' }, { arr: g.oppBack, zone: 'oppBack' }]
  for (const { arr, zone } of zones) {
    arr.forEach((fc, i) => { if (fc) result.push({ fc, zone, index: i }) })
  }
  return result
}

function setZoneArr(g: GameState, zone: string, arr: (FieldCard | null)[]) {
  if (zone === 'myFront') g.myFront = arr
  else if (zone === 'myBack') g.myBack = arr
  else if (zone === 'oppFront') g.oppFront = arr
  else if (zone === 'oppBack') g.oppBack = arr
  else if (zone === 'mySpellZone') g.mySpellZone = arr
  else if (zone === 'oppSpellZone') g.oppSpellZone = arr
}

function getZoneArr(g: GameState, zone: string): (FieldCard | null)[] {
  if (zone === 'myFront') return g.myFront
  if (zone === 'myBack') return g.myBack
  if (zone === 'oppFront') return g.oppFront
  if (zone === 'oppBack') return g.oppBack
  if (zone === 'mySpellZone') return g.mySpellZone
  if (zone === 'oppSpellZone') return g.oppSpellZone
  return []
}

function removeFromField(g: GameState, zone: string, index: number, sendToGrave = true) {
  const arr = [...getZoneArr(g, zone)]
  const fc = arr[index]
  if (!fc) return
  if (sendToGrave) {
    const grave = zone.startsWith('my') ? g.myGrave : g.oppGrave
    grave.push({ data: fc.data, isAwake: fc.isAwake })
  }
  arr[index] = null
  setZoneArr(g, zone, arr)
}

export default function BattlePage() {
  const [allCards, setAllCards] = useState<CardData[]>([])
  const [game, setGame] = useState<GameState | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [showGrave, setShowGrave] = useState<'my' | 'opp' | null>(null)
  const [graveSelectMode, setGraveSelectMode] = useState<{ owner: 'my' | 'opp'; action: string } | null>(null)
  const [aiRunning, setAiRunning] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('cards').select('*').then(({ data }) => {
      if (data) { setAllCards(data); setLoading(false) }
    })
  }, [])
  function startGame() {
    const myDecks = buildDecks(allCards)
    const oppDecks = buildDecks(allCards)
    const myInitial = placeInitial(myDecks.monsterDeck)
    const oppInitial = placeInitial(oppDecks.monsterDeck)
    const myHand: CardData[] = []
    const oppHand: CardData[] = []
    const myMon = myInitial.remaining
    const oppMon = oppInitial.remaining
    for (let i = 0; i < 4; i++) {
      if (myMon.length) myHand.push(myMon.shift()!)
      else if (myDecks.spellDeck.length) myHand.push(myDecks.spellDeck.shift()!)
    }
    for (let i = 0; i < 4; i++) {
      if (oppMon.length) oppHand.push(oppMon.shift()!)
      else if (oppDecks.spellDeck.length) oppHand.push(oppDecks.spellDeck.shift()!)
    }
    setGame({
      myLP: 5000, oppLP: 5000,
      myHand, oppHand,
      myMonsterDeck: myMon, oppMonsterDeck: oppMon,
      mySpellDeck: myDecks.spellDeck, oppSpellDeck: oppDecks.spellDeck,
      myFront: [null,null,null,null,null], myBack: myInitial.back,
      oppFront: [null,null,null,null,null], oppBack: oppInitial.back,
      mySpellZone: [null,null,null,null,null], oppSpellZone: [null,null,null,null,null],
      myGrave: [], oppGrave: [],
      turn: 'my', phase: 'draw',
      normalSummonDone: false, awakeDone: false,
      log: ['ゲーム開始！自分のターン - ドローフェイズ'],
      selectedCard: null, pendingEffect: null,
      bannedCards: [], endPhaseDestroyUids: [], kumomaru_atkDown: [],
      isFirstTurn: true,
    })
    setMessage('')
  }

  function addLog(g: GameState, text: string) {
    g.log = [text, ...g.log].slice(0, 30)
  }

  function drawCard(from: 'monster' | 'spell') {
    if (!game) return
    if (game.phase !== 'draw') { setMessage('ドローフェイズのみドローできます'); return }
    const g = { ...game }
    const isMyTurn = g.turn === 'my'
    const deck = isMyTurn
      ? (from === 'monster' ? g.myMonsterDeck : g.mySpellDeck)
      : (from === 'monster' ? g.oppMonsterDeck : g.oppSpellDeck)
    const hand = isMyTurn ? g.myHand : g.oppHand
    if (deck.length === 0) { setMessage('デッキが空です'); return }
    if (false) { setMessage('手札が上限（5枚）です'); return }
    const card = deck.shift()!
    hand.push(card)
    addLog(g, `${isMyTurn ? '自分' : '相手'}が${from === 'monster' ? 'モンスター' : '魔法・トラップ'}デッキからドロー`)
    g.phase = 'main'
    setGame({ ...g })
    setMessage('')
  }

  function selectCard(zone: string, index: number) {
    if (!game) return
    setGame({ ...game, selectedCard: { zone, index } })
    setMessage('')
  }

  function getZoneCard(g: GameState, zone: string, index: number): FieldCard | CardData | null {
    switch (zone) {
      case 'myHand': return g.myHand[index] ?? null
      case 'oppHand': return g.oppHand[index] ?? null
      case 'myFront': return g.myFront[index]
      case 'myBack': return g.myBack[index]
      case 'oppFront': return g.oppFront[index]
      case 'oppBack': return g.oppBack[index]
      case 'mySpellZone': return g.mySpellZone[index]
      case 'oppSpellZone': return g.oppSpellZone[index]
      default: return null
    }
  }

  function summonMonster(toZone: 'myFront' | 'myBack' | 'oppFront' | 'oppBack', toIndex: number) {
    if (!game) return
    if (game.phase !== 'main') { setMessage('メインフェイズのみ召喚できます'); return }
    if (!game.selectedCard) { setMessage('手札のカードを先に選んでください'); return }
    const g = { ...game }
    const isMyTurn = g.turn === 'my'
    const sel = g.selectedCard!
    const hand = isMyTurn ? g.myHand : g.oppHand
    if (sel.zone !== (isMyTurn ? 'myHand' : 'oppHand')) { setMessage('手札から召喚してください'); return }
    const card = hand[sel.index]
    if (!card || card.type !== 'monster') { setMessage('モンスターカードのみ召喚できます'); return }
    if (card.id === 'monster_lightning_whale_01') { setMessage('このカードは通常召喚できません'); return }
    const isMyZone = toZone.startsWith('my')
    if (isMyZone !== isMyTurn) { setMessage('自分のゾーンにのみ召喚できます'); return }
    const zoneArr = [...getZoneArr(g, toZone)]
    if (zoneArr[toIndex] !== null) { setMessage('そのマスは埋まっています'); return }
    if (g.normalSummonDone) { setMessage('通常召喚は1ターン1回までです'); return }
    const fc = toField(card)
    zoneArr[toIndex] = fc
    setZoneArr(g, toZone, zoneArr)
    hand.splice(sel.index, 1)
    g.normalSummonDone = true
    g.selectedCard = null
    addLog(g, `${isMyTurn ? '自分' : '相手'}が「${card.name}」を召喚`)
    // 召喚時効果
    if (card.id === 'monster_witch_01') {
      const spellDeck = isMyTurn ? g.mySpellDeck : g.oppSpellDeck
      const h = isMyTurn ? g.myHand : g.oppHand
      if (spellDeck.length > 0 && h.length < 5) {
        h.push(spellDeck.shift()!)
        addLog(g, `「ナイトメア・ウィッチ」の効果：魔法・トラップデッキから1枚ドロー`)
      }
    }
    setGame({ ...g })
    setMessage('')
  }

  function setSpellCard(toZone: 'mySpellZone' | 'oppSpellZone', toIndex: number) {
    if (!game) return
    if (game.phase !== 'main') { setMessage('メインフェイズのみセットできます'); return }
    if (!game.selectedCard) { setMessage('手札のカードを先に選んでください'); return }
    const g = { ...game }
    const isMyTurn = g.turn === 'my'
    const sel = g.selectedCard!
    const hand = isMyTurn ? g.myHand : g.oppHand
    if (sel.zone !== (isMyTurn ? 'myHand' : 'oppHand')) { setMessage('手札から発動してください'); return }
    const card = hand[sel.index]
    if (!card || card.type === 'monster') { setMessage('魔法・トラップカードのみセットできます'); return }
    const zoneArr = [...getZoneArr(g, toZone)]
    if (zoneArr[toIndex] !== null) { setMessage('そのマスは埋まっています'); return }
    zoneArr[toIndex] = toField(card)
    setZoneArr(g, toZone, zoneArr)
    hand.splice(sel.index, 1)
    g.selectedCard = null
    addLog(g, `${isMyTurn ? '自分' : '相手'}が「${card.name}」をセット`)
    setGame({ ...g })
    setMessage('')
  }

  function activateSpell(zone: 'mySpellZone' | 'oppSpellZone', index: number) {
    if (!game) return
    if (game.phase !== 'main' && game.phase !== 'battle') { setMessage('メインまたはバトルフェイズのみ発動できます'); return }
    const g = { ...game }
    const isMyTurn = g.turn === 'my'
    const zoneArr = [...getZoneArr(g, zone)]
    const fc = zoneArr[index]
    if (!fc) return
    const card = fc.data
    const owner: 'my' | 'opp' = zone.startsWith('my') ? 'my' : 'opp'

    addLog(g, `「${card.name}」を発動！`)

    // 発動後ゾーンから除去→墓地へ
    zoneArr[index] = null
    setZoneArr(g, zone, zoneArr)
    const grave = owner === 'my' ? g.myGrave : g.oppGrave
    grave.push({ data: card, isAwake: false })

    switch (card.id) {
      case 'spell_unicorn_michibiki_01': {
        // 自分のデッキから2枚ドロー
        const mDeck = owner === 'my' ? g.myMonsterDeck : g.oppMonsterDeck
        const sDeck = owner === 'my' ? g.mySpellDeck : g.oppSpellDeck
        const h = owner === 'my' ? g.myHand : g.oppHand
        for (let i = 0; i < 2; i++) {
          if (h.length >= 5) break
          if (mDeck.length) h.push(mDeck.shift()!)
          else if (sDeck.length) h.push(sDeck.shift()!)
        }
        addLog(g, 'デッキから2枚ドロー')
        break
      }
      case 'spell_daitenshi_kago_01': {
        addLog(g, '大天使の加護：このターン受けたダメージ分回復（手動で記録してください）')
        break
      }
      case 'spell_dinosaur_crash_01': {
        // フィールドのカードをランダムに3枚破壊
        const all: { zone: string; index: number }[] = []
        const zones = ['myFront','myBack','oppFront','oppBack']
        for (const z of zones) {
          getZoneArr(g, z).forEach((fc, i) => { if (fc) all.push({ zone: z, index: i }) })
        }
        const targets = all.sort(() => Math.random() - 0.5).slice(0, 3)
        for (const t of targets) {
          const arr = [...getZoneArr(g, t.zone)]
          const destroyed = arr[t.index]
          if (destroyed) {
            const gr = t.zone.startsWith('my') ? g.myGrave : g.oppGrave
            gr.push({ data: destroyed.data, isAwake: destroyed.isAwake })
            arr[t.index] = null
            setZoneArr(g, t.zone, arr)
            addLog(g, `「${destroyed.data.name}」を破壊`)
          }
        }
        break
      }
      case 'spell_mizou_daisaigai_01': {
        // ターゲット選択が必要
        g.pendingEffect = { type: 'select_target', action: 'awake_then_destroy_next', sourceZone: zone, sourceIndex: index, message: '覚醒させるモンスターを選んでください' }
        addLog(g, '未曾有の大災害：対象を選択してください')
        break
      }
      case 'spell_seiryu_manako_01': {
        g.pendingEffect = { type: 'select_target', action: 'return_to_sealed', sourceZone: zone, sourceIndex: index, message: '封印状態に戻すモンスターを選んでください' }
        addLog(g, '青龍の眼：対象を選択してください')
        break
      }
      case 'spell_dragon_01': {
        // 墓地からドラゴンを特殊召喚
        const myGraveMonsters = g.myGrave.filter(gc => gc.data.type === 'monster' && gc.data.name.includes('ドラゴン'))
        if (myGraveMonsters.length === 0) { addLog(g, '墓地にドラゴンがいません'); break }
        const target = myGraveMonsters[myGraveMonsters.length - 1]
        const emptyBack = g.myBack.findIndex(c => c === null)
        const emptyFront = g.myFront.findIndex(c => c === null)
        const emptyZone = emptyBack !== -1 ? 'myBack' : emptyFront !== -1 ? 'myFront' : null
        const emptyIndex = emptyBack !== -1 ? emptyBack : emptyFront !== -1 ? emptyFront : -1
        if (emptyZone && emptyIndex !== -1) {
          const arr = [...getZoneArr(g, emptyZone)]
          arr[emptyIndex] = toField(target.data, target.isAwake)
          setZoneArr(g, emptyZone, arr)
          g.myGrave = g.myGrave.filter(gc => gc !== target)
          addLog(g, `「${target.data.name}」を特殊召喚`)
        }
        break
      }
      case 'spell_electric_shark_01': {
        const whale = allCards.find(c => c.id === 'monster_lightning_whale_01')
        if (whale) {
          const emptyBack = g.myBack.findIndex(c => c === null)
          if (emptyBack !== -1) {
            const arr = [...g.myBack]
            arr[emptyBack] = toField(whale)
            g.myBack = arr
            addLog(g, 'ライトニング・キラーホエールを特殊召喚')
          }
        }
        break
      }
      case 'spell_jigoku_sinpan_01': {
        const graveToUse = owner === 'my' ? g.myGrave : g.oppGrave
        if (graveToUse.length === 0) { addLog(g, '墓地にカードがありません'); break }
        g.pendingEffect = { type: 'coin_toss', graveIndex: -1, owner }
        addLog(g, '地獄の審判：墓地からカードを選んでください')
        setGame({ ...g })
        setGraveSelectMode({ owner, action: 'jigoku_sinpan' })
        setShowGrave(owner)
        setMessage('')
        break
      }
      case 'spell_umi_no_kami_01': {
        const waterMonsters = (owner === 'my' ? g.myMonsterDeck : g.oppMonsterDeck)
          .filter(c => c.attribute === '水' && (c.atk_awake ?? 0) >= 2000)
        if (waterMonsters.length > 0) {
          const picked = waterMonsters[Math.floor(Math.random() * waterMonsters.length)]
          const h = owner === 'my' ? g.myHand : g.oppHand
          if (h.length < 5) {
            h.push(picked)
            const deck = owner === 'my' ? g.myMonsterDeck : g.oppMonsterDeck
            const idx = deck.findIndex(c => c.id === picked.id)
            if (idx !== -1) deck.splice(idx, 1)
            addLog(g, `「${picked.name}」を手札に加えた`)
          }
        } else {
          addLog(g, '条件を満たすモンスターがデッキにいません')
        }
        break
      }
      case 'trap_ootatumaki_01': {
        const all2: { zone: string; index: number; fc: FieldCard }[] = []
        for (const z of ['myFront','myBack','oppFront','oppBack']) {
          getZoneArr(g, z).forEach((fc, i) => { if (fc) all2.push({ zone: z, index: i, fc }) })
        }
        const targets2 = all2.sort(() => Math.random() - 0.5).slice(0, 2)
        for (const t of targets2) {
          const arr = [...getZoneArr(g, t.zone)]
          arr[t.index] = null
          setZoneArr(g, t.zone, arr)
          const h = t.zone.startsWith('my') ? g.myHand : g.oppHand
          if (h.length < 5) h.push(t.fc.data)
          addLog(g, `「${t.fc.data.name}」を手札に戻した`)
        }
        break
      }
      case 'trap_mano_kaiiki_01': {
        for (const z of ['myFront','myBack','oppFront','oppBack']) {
          const arr = [...getZoneArr(g, z)].map(fc => fc ? { ...fc, stance: fc.stance === 'attack' ? 'defense' as const : 'attack' as const } : null)
          setZoneArr(g, z, arr)
        }
        addLog(g, '全モンスターの表示形式を変更')
        break
      }
      case 'trap_tsurara_mahoujin_01': {
        const allAwake = [...getAllFieldCards(g, 'my'), ...getAllFieldCards(g, 'opp')]
          .filter(({ fc }) => fc.isAwake)
        for (const { zone, index } of allAwake) {
          removeFromField(g, zone, index)
          addLog(g, `覚醒中モンスターを破壊`)
        }
        break
      }
      case 'trap_akumu_daihunka_01': {
        for (const z of ['mySpellZone','oppSpellZone']) {
          const arr = getZoneArr(g, z)
          arr.forEach((fc, i) => {
            if (fc) {
              const gr = z.startsWith('my') ? g.myGrave : g.oppGrave
              gr.push({ data: fc.data, isAwake: false })
            }
          })
          setZoneArr(g, z, [null,null,null,null,null])
        }
        addLog(g, '悪夢の大噴火：両プレイヤーの魔法・トラップゾーンを全破壊')
        break
      }
      case 'trap_singari_01': {
        g.pendingEffect = { type: 'select_target', action: 'singari', sourceZone: zone, sourceIndex: index, message: 'しんがりを受けるモンスターを選んでください' }
        break
      }
    }

    setGame({ ...g })
    setMessage('')
  }

  function awakeMonster(fromZone: 'myBack' | 'oppBack', fromIndex: number) {
    if (!game) return
    if (game.phase !== 'main') { setMessage('メインフェイズのみ覚醒できます'); return }
    const g = { ...game }
    const isMyTurn = g.turn === 'my'
    if (g.awakeDone) { setMessage('覚醒は1ターン1回までです'); return }
    const backZone = isMyTurn ? g.myBack : g.oppBack
    const frontZone = isMyTurn ? g.myFront : g.oppFront
    const card = backZone[fromIndex]
    if (!card) { setMessage('カードがありません'); return }
    const emptyFront = frontZone.findIndex(c => c === null)
    if (emptyFront === -1) { setMessage('前列が埋まっています'); return }

    // つらら針チェック
    const tsuraraSets = [...g.mySpellZone, ...g.oppSpellZone].filter(fc => fc && fc.data.id === 'trap_tsurara_mahoujin_01')
    if (!isMyTurn && tsuraraSets.length > 0) {
      // 相手が覚醒 → つらら針が発動可能
      addLog(g, '「つらら針の魔法陣」が発動可能です（手動で選択してください）')
    }

    frontZone[emptyFront] = { ...card, isAwake: true }
    backZone[fromIndex] = null
    g.awakeDone = true
    g.selectedCard = null
    addLog(g, `${isMyTurn ? '自分' : '相手'}の「${card.data.name}」が覚醒！`)

    // 覚醒時効果
    if (card.data.id === 'monster_twin_cats_01') {
      g.pendingEffect = { type: 'select_target', action: 'lock_attack', sourceZone: isMyTurn ? 'myFront' : 'oppFront', sourceIndex: emptyFront, message: '攻撃を封じる相手モンスターを選んでください' }
      addLog(g, '不和の双黒猫：攻撃を封じる対象を選択してください')
    }

    if (card.data.id === 'monster_witch_01') {
      const grave = isMyTurn ? g.myGrave : g.oppGrave
      if (grave.length > 0) {
        g.pendingEffect = { type: 'select_target', action: 'witch_revive', sourceZone: isMyTurn ? 'myFront' : 'oppFront', sourceIndex: emptyFront, message: '墓地から特殊召喚するカードを墓地ビューアで選んでください（自動で後列に出ます）' }
        addLog(g, '「ナイトメア・ウィッチ」覚醒効果：墓地からカードを特殊召喚できます')
      }
    }

    setGame({ ...g })
    setMessage('')
  }

  function toggleStance(zone: 'myFront' | 'myBack' | 'oppFront' | 'oppBack', index: number) {
    if (!game) return
    if (game.phase !== 'main') { setMessage('メインフェイズのみ表示変更できます'); return }
    const g = { ...game }
    const arr = [...getZoneArr(g, zone)]
    const card = arr[index]
    if (!card) return
    arr[index] = { ...card, stance: card.stance === 'attack' ? 'defense' : 'attack' }
    setZoneArr(g, zone, arr)
    addLog(g, `「${card.data.name}」を${card.stance === 'attack' ? '守備' : '攻撃'}表示に変更`)
    setGame({ ...g })
  }

  function attack(atkZone: string, atkIndex: number, defZone: string, defIndex: number) {
    if (!game) return
    if (game.phase !== 'battle') { setMessage('バトルフェイズのみ攻撃できます'); return }
    const g = { ...game }
    const isMyTurn = g.turn === 'my'
    const atkArr = [...getZoneArr(g, atkZone)]
    const defArr = [...getZoneArr(g, defZone)]
    const attacker = atkArr[atkIndex]
    const defender = defArr[defIndex]

    if (!attacker) { setMessage('攻撃するカードがありません'); return }
    if (attacker.stance === 'defense') { setMessage('守備表示のカードは攻撃できません'); return }
    if (attacker.hasAttacked && attacker.data.id !== 'monster_kumomaru_01') { setMessage('このカードは既に攻撃済みです'); return }
    if (attacker.cantAttack) { setMessage('このカードは攻撃できません'); return }
    if (attacker.data.id === 'monster_forest_dragon_01') { setMessage('このカードは攻撃できません'); return }
    const isMyCard = atkZone.startsWith('my')
    if (isMyCard !== isMyTurn) { setMessage('自分のカードのみ攻撃できます'); return }

    const atkVal = (attacker.isAwake ? (attacker.data.atk_awake ?? 0) : (attacker.data.atk_sealed ?? 0)) + attacker.atkMod

    // ダイレクトアタック判定
    const oppMonsters = isMyTurn
      ? [...g.oppFront, ...g.oppBack].filter(Boolean)
      : [...g.myFront, ...g.myBack].filter(Boolean)

    if (!defender && oppMonsters.length > 0) { setMessage('相手のモンスターを先に攻撃してください'); return }

    if (!defender) {
      // ダイレクトアタック
      if (isMyTurn) g.oppLP -= atkVal
      else g.myLP -= atkVal
      addLog(g, `「${attacker.data.name}」がダイレクトアタック！ ${atkVal}ダメージ`)
    } else {
      // 不屈の狂剣士チェック
      if (defender.data.id === 'warrior_01' && defender.isAwake) {
        addLog(g, '「不屈の狂剣士」は効果を受けません（通常攻撃は有効）')
      }
      if (defender.stance === 'attack') {
        const defVal = (defender.isAwake ? (defender.data.atk_awake ?? 0) : (defender.data.atk_sealed ?? 0)) + defender.atkMod
        if (atkVal > defVal) {
          removeFromField(g, defZone, defIndex)
          const diff = atkVal - defVal
          if (isMyTurn) g.oppLP -= diff; else g.myLP -= diff
          addLog(g, `「${attacker.data.name}」が「${defender.data.name}」を破壊！ ${diff}ダメージ`)
          // 砂浜の釣り人 破壊時効果
          if (defender.data.id === 'monster_fisherman_01') {
            addLog(g, '「砂浜の釣り人」効果：相手の伏せカード1枚を確認できます（手動）')
          }
        } else if (atkVal < defVal) {
          removeFromField(g, atkZone, atkIndex)
          const diff = defVal - atkVal
          if (isMyTurn) g.myLP -= diff; else g.oppLP -= diff
          addLog(g, `「${attacker.data.name}」が「${defender.data.name}」に敗北… ${diff}ダメージ`)
          if (attacker.data.id === 'monster_fisherman_01') {
            addLog(g, '「砂浜の釣り人」効果：相手の伏せカード1枚を確認できます（手動）')
          }
        } else {
          removeFromField(g, atkZone, atkIndex)
          removeFromField(g, defZone, defIndex)
          addLog(g, `「${attacker.data.name}」と「${defender.data.name}」が相打ち`)
        }
      } else {
        const defVal = (defender.isAwake ? (defender.data.def_awake ?? 0) : (defender.data.def_sealed ?? 0)) + defender.defMod
        if (atkVal >= defVal) {
          removeFromField(g, defZone, defIndex)
          addLog(g, `守備表示「${defender.data.name}」を破壊`)
        } else {
          const diff = defVal - atkVal
          if (isMyTurn) g.myLP -= diff; else g.oppLP -= diff
          addLog(g, `守備「${defender.data.name}」を破壊できず… ${diff}ダメージ`)
        }
      }
    }

    // 攻撃済みフラグ（雲丸は2回攻撃）
    const atkArrAfter = [...getZoneArr(g, atkZone)]
    if (atkArrAfter[atkIndex]) {
      const cur = atkArrAfter[atkIndex]!
      if (cur.data.id === 'monster_kumomaru_01' && !cur.hasAttacked) {
        atkArrAfter[atkIndex] = { ...cur, hasAttacked: true }
      } else {
        atkArrAfter[atkIndex] = { ...cur, hasAttacked: true }
      }
      setZoneArr(g, atkZone, atkArrAfter)
    }

    // メカドラゴン覚醒攻撃時ATKダウン
    const atkArrFinal = [...getZoneArr(g, atkZone)]
    if (atkArrFinal[atkIndex]?.data.id === 'monster_mechanic_dragon_01' && atkArrFinal[atkIndex]?.isAwake) {
      atkArrFinal[atkIndex] = { ...atkArrFinal[atkIndex]!, atkMod: (atkArrFinal[atkIndex]?.atkMod ?? 0) - 500 }
      setZoneArr(g, atkZone, atkArrFinal)
      addLog(g, 'メカドラゴンの攻撃力が500ダウン')
    }

    g.selectedCard = null
    setGame({ ...g })
    setMessage('')
  }

  async function runOppAI() {
    if (!game) return
    if (game.myLP <= 0 || game.oppLP <= 0) return
    if (aiRunning) return
    setAiRunning(true)
    const g = { ...game }
    const wait = (ms: number) => new Promise(res => setTimeout(res, ms))

    // ドロー
    if (g.oppMonsterDeck.length > 0) {
      g.oppHand.push(g.oppMonsterDeck.shift()!)
      addLog(g, '相手がモンスターデッキからドロー')
    } else if (g.oppSpellDeck.length > 0) {
      g.oppHand.push(g.oppSpellDeck.shift()!)
      addLog(g, '相手が魔法・トラップデッキからドロー')
    }
    setGame({ ...g }); await wait(800)

    // 召喚（手札のモンスターを空きの後列に）
    const monsterInHand = g.oppHand.findIndex(c => c.type === 'monster' && c.id !== 'monster_lightning_whale_01')
    if (monsterInHand !== -1 && !g.normalSummonDone) {
      const emptyBack = g.oppBack.findIndex(c => c === null)
      if (emptyBack !== -1) {
        const card = g.oppHand[monsterInHand]
        const arr = [...g.oppBack]
        arr[emptyBack] = toField(card)
        g.oppBack = arr
        g.oppHand.splice(monsterInHand, 1)
        g.normalSummonDone = true
        addLog(g, `相手が「${card.name}」を召喚`)
        setGame({ ...g }); await wait(800)
      }
    }

    // 覚醒（後列のモンスターを前列へ、1体だけ）
    if (!g.awakeDone) {
      const backIdx = g.oppBack.findIndex(c => c !== null)
      const frontIdx = g.oppFront.findIndex(c => c === null)
      if (backIdx !== -1 && frontIdx !== -1) {
        const card = g.oppBack[backIdx]!
        const newBack = [...g.oppBack]
        const newFront = [...g.oppFront]
        newBack[backIdx] = null
        newFront[frontIdx] = { ...card, isAwake: true }
        g.oppBack = newBack
        g.oppFront = newFront
        g.awakeDone = true
        addLog(g, `相手の「${card.data.name}」が覚醒！`)
        setGame({ ...g }); await wait(800)
      }
    }

    // バトル（先攻スキップ）
    if (!g.isFirstTurn) {
      const attackers = [
        ...g.oppFront.map((fc, i) => fc ? { fc, zone: 'oppFront', index: i } : null),
        ...g.oppBack.map((fc, i) => fc ? { fc, zone: 'oppBack', index: i } : null),
      ].filter(Boolean) as { fc: FieldCard; zone: string; index: number }[]

      for (const { fc, zone, index } of attackers) {
        if (g.myLP <= 0 || g.oppLP <= 0) break
        if (fc.stance !== 'attack' || fc.hasAttacked || fc.cantAttack) continue
        if (fc.data.id === 'monster_forest_dragon_01') continue

        const myMonsters = [
          ...g.myFront.map((c, i) => c ? { zone: 'myFront', index: i } : null),
          ...g.myBack.map((c, i) => c ? { zone: 'myBack', index: i } : null),
        ].filter(Boolean) as { zone: string; index: number }[]

        if (myMonsters.length > 0) {
          const target = myMonsters[Math.floor(Math.random() * myMonsters.length)]
          addLog(g, `相手の「${fc.data.name}」が攻撃！`)
          const atkVal = (fc.isAwake ? (fc.data.atk_awake ?? 0) : (fc.data.atk_sealed ?? 0)) + fc.atkMod
          const defArr = [...getZoneArr(g, target.zone)]
          const defender = defArr[target.index]
          if (defender) {
            if (defender.stance === 'attack') {
              const defVal = (defender.isAwake ? (defender.data.atk_awake ?? 0) : (defender.data.atk_sealed ?? 0)) + defender.atkMod
              if (atkVal > defVal) {
                removeFromField(g, target.zone, target.index)
                g.myLP -= atkVal - defVal
                addLog(g, `「${fc.data.name}」が「${defender.data.name}」を破壊！ ${atkVal - defVal}ダメージ`)
                setGame({ ...g }); await wait(800)
              } else if (atkVal < defVal) {
                removeFromField(g, zone, index)
                g.oppLP -= defVal - atkVal
                addLog(g, `「${fc.data.name}」が「${defender.data.name}」に敗北… ${defVal - atkVal}ダメージ`)
                setGame({ ...g }); await wait(800)
              } else {
                removeFromField(g, target.zone, target.index)
                removeFromField(g, zone, index)
                addLog(g, `「${fc.data.name}」と「${defender.data.name}」が相打ち`)
                setGame({ ...g }); await wait(800)
              }
            } else {
              const defVal = (defender.isAwake ? (defender.data.def_awake ?? 0) : (defender.data.def_sealed ?? 0)) + defender.defMod
              if (atkVal >= defVal) {
                removeFromField(g, target.zone, target.index)
                addLog(g, `守備表示「${defender.data.name}」を破壊`)
                setGame({ ...g }); await wait(800)
              } else {
                g.oppLP -= defVal - atkVal
                addLog(g, `守備「${defender.data.name}」を破壊できず… ${defVal - atkVal}ダメージ`)
                setGame({ ...g }); await wait(800)
              }
            }
          }
          // 攻撃済みフラグ
          const atkArrAfter = [...getZoneArr(g, zone)]
          if (atkArrAfter[index]) atkArrAfter[index] = { ...atkArrAfter[index]!, hasAttacked: true }
          setZoneArr(g, zone, atkArrAfter)
        } else {
          // ダイレクトアタック
          const atkVal = (fc.isAwake ? (fc.data.atk_awake ?? 0) : (fc.data.atk_sealed ?? 0)) + fc.atkMod
          g.myLP -= atkVal
          addLog(g, `「${fc.data.name}」がダイレクトアタック！ ${atkVal}ダメージ`)
          const atkArrAfter = [...getZoneArr(g, zone)]
          if (atkArrAfter[index]) atkArrAfter[index] = { ...atkArrAfter[index]!, hasAttacked: true }
          setZoneArr(g, zone, atkArrAfter)
          setGame({ ...g }); await wait(800)
        }
      }
    }

    // エンドフェイズ処理（癒しの洞窟など）
    for (const { fc } of getAllFieldCards(g, 'opp')) {
      if (fc.data.id === 'monster_healing_cave_01') {
        g.oppLP += 500
        addLog(g, '「癒しの洞窟」効果：相手500LP回復')
      }
    }

    // ターン交代
    const resetAttack = (arr: (FieldCard | null)[]) => arr.map(c => c ? { ...c, hasAttacked: false } : null)
    g.myFront = resetAttack(g.myFront)
    g.myBack = resetAttack(g.myBack)
    g.oppFront = resetAttack(g.oppFront)
    g.oppBack = resetAttack(g.oppBack)
    g.turn = 'my'
    g.phase = 'draw'
    g.normalSummonDone = false
    g.awakeDone = false
    g.selectedCard = null
    g.isFirstTurn = false
    addLog(g, '--- 自分のターン開始 ---')
    setGame({ ...g }); await wait(500)
    setGame({ ...g })
    setMessage('')
    setAiRunning(false)
  }
  function nextPhase() {
    if (!game) return
    const g = { ...game }
    if (g.phase === 'main') {
      if (g.isFirstTurn) {
        g.phase = 'end'
        addLog(g, '先攻のためバトルフェイズをスキップ → エンドフェイズ')
      } else {
        g.phase = 'battle'
        addLog(g, 'バトルフェイズ開始')
      }
    } else if (g.phase === 'battle') {
      g.phase = 'end'
      addLog(g, 'エンドフェイズ')
    } else if (g.phase === 'end') {
      // エンドフェイズ処理
      // 癒しの洞窟LP回復
      for (const owner of ['my', 'opp'] as const) {
        const cards = getAllFieldCards(g, owner)
        for (const { fc } of cards) {
          if (fc.data.id === 'monster_healing_cave_01') {
            if (owner === 'my') g.myLP += 500; else g.oppLP += 500
            addLog(g, '「癒しの洞窟」効果：500LP回復')
          }
        }
      }
      // 雲丸ATKダウン
      for (const owner of ['my', 'opp'] as const) {
        for (const z of ['Front', 'Back']) {
          const zone = `${owner}${z}` as 'myFront' | 'myBack' | 'oppFront' | 'oppBack'
          const arr = [...getZoneArr(g, zone)]
          arr.forEach((fc, i) => {
            if (fc?.data.id === 'monster_kumomaru_01' && fc.isAwake) {
              arr[i] = { ...fc, atkMod: fc.atkMod - 500 }
              addLog(g, '「雲丸」の攻撃力が500ダウン')
            }
          })
          setZoneArr(g, zone, arr)
        }
      }
      // 森を統べる竜ATK計算
      for (const owner of ['my', 'opp'] as const) {
        const forestDragons = getAllFieldCards(g, owner).filter(({ fc }) => fc.data.id === 'monster_forest_dragon_01')
        const allDragons = [...getAllFieldCards(g, owner), ...getAllFieldCards(g, owner === 'my' ? 'opp' : 'my')]
          .filter(({ fc }) => fc.data.id === 'monster_forest_dragon_01')
        const graves = owner === 'my' ? g.myGrave : g.oppGrave
        const graveDragons = graves.filter(gc => gc.data.id === 'monster_forest_dragon_01')
        const totalCount = allDragons.length + graveDragons.length
        for (const { zone, index } of forestDragons) {
          const arr = [...getZoneArr(g, zone)]
          if (arr[index]) arr[index] = { ...arr[index]!, atkMod: totalCount * 200 }
          setZoneArr(g, zone, arr)
        }
      }
      // エンドフェイズ破壊予約
      for (const { uid: targetUid, owner } of g.endPhaseDestroyUids) {
        for (const z of ['Front', 'Back']) {
          const zone = `${owner}${z}`
          const arr = [...getZoneArr(g, zone)]
          const idx = arr.findIndex(fc => fc?.uid === targetUid)
          if (idx !== -1) {
            removeFromField(g, zone, idx)
            addLog(g, '未曾有の大災害：予約破壊発動')
          }
        }
      }
      g.endPhaseDestroyUids = []

      const next = g.turn === 'my' ? 'opp' : 'my'
      const resetAttack = (arr: (FieldCard | null)[]) => arr.map(c => c ? { ...c, hasAttacked: false } : null)
      g.myFront = resetAttack(g.myFront)
      g.myBack = resetAttack(g.myBack)
      g.oppFront = resetAttack(g.oppFront)
      g.oppBack = resetAttack(g.oppBack)
    g.turn = next; g.phase = 'draw'
      g.normalSummonDone = false; g.awakeDone = false; g.selectedCard = null
      g.isFirstTurn = false
      addLog(g, `--- ${next === 'my' ? '自分' : '相手'}のターン開始 ---`)
    }
    setGame({ ...g })
    setMessage('')
  }

  function handlePendingTarget(targetZone: string, targetIndex: number) {
    if (!game?.pendingEffect) return
    if (game.pendingEffect.type !== 'select_target') return
    const g = { ...game }
    const effect = g.pendingEffect!
    if (effect.type !== 'select_target') return
    const targetArr = [...getZoneArr(g, targetZone)]
    const targetFc = targetArr[targetIndex]

    switch (effect.action) {
      case 'return_to_sealed': {
        if (!targetFc || !targetFc.isAwake) { setMessage('覚醒中のモンスターを選んでください'); return }
        const newFc = { ...targetFc, isAwake: false }
        // 前列から後列へ
        if (targetZone.includes('Front')) {
          const backZone = targetZone.replace('Front', 'Back')
          const backArr = [...getZoneArr(g, backZone)]
          const empty = backArr.findIndex(c => c === null)
          if (empty !== -1) {
            backArr[empty] = newFc
            targetArr[targetIndex] = null
            setZoneArr(g, targetZone, targetArr)
            setZoneArr(g, backZone, backArr)
            addLog(g, `「${targetFc.data.name}」を封印状態に戻した`)
          }
        }
        break
      }
      case 'awake_then_destroy_next': {
        if (!targetFc) { setMessage('モンスターを選んでください'); return }
        if (!targetFc.isAwake) {
          // 覚醒させる
          targetArr[targetIndex] = { ...targetFc, isAwake: true }
          setZoneArr(g, targetZone, targetArr)
          addLog(g, `「${targetFc.data.name}」を覚醒させた。次の相手エンドフェイズに破壊予定`)
          const owner: 'my' | 'opp' = targetZone.startsWith('my') ? 'my' : 'opp'
          g.endPhaseDestroyUids.push({ uid: targetFc.uid, owner })
        }
        break
      }
      case 'lock_attack': {
        if (!targetFc) { setMessage('モンスターを選んでください'); return }
        targetArr[targetIndex] = { ...targetFc, cantAttack: true }
        setZoneArr(g, targetZone, targetArr)
        addLog(g, `「${targetFc.data.name}」の攻撃を封じた`)
        break
      }
      case 'singari': {
        if (!targetFc) { setMessage('モンスターを選んでください'); return }
        addLog(g, `「しんがり」：「${targetFc.data.name}」がこのバトルフェイズの攻撃を全て受けます（手動処理）`)
        break
      }
      case 'witch_revive': {
        const owner: 'my' | 'opp' = effect.sourceZone.startsWith('my') ? 'my' : 'opp'
        const grave = owner === 'my' ? g.myGrave : g.oppGrave
        if (grave.length === 0) { setMessage('墓地にカードがありません'); break }
        addLog(g, '「ナイトメア・ウィッチ」効果：墓地から特殊召喚するカードを選んでください')
        g.pendingEffect = null
        setGame({ ...g })
        setGraveSelectMode({ owner, action: 'witch_revive' })
        setShowGrave(owner)
        setMessage('')
        break
      }
    }
    g.pendingEffect = null
    g.selectedCard = null
    setGame({ ...g })
    setMessage('')
  }

  function coinToss() {
    if (!game?.pendingEffect) return
    if (game.pendingEffect.type !== 'coin_toss') return
    const g = { ...game }
    const effect = g.pendingEffect
    if (effect.type !== 'coin_toss') return
    if (effect.graveIndex === -1) { setMessage('カードが選択されていません'); return }
    const result = Math.random() < 0.5
    const grave = effect.owner === 'my' ? g.myGrave : g.oppGrave
    const card = grave[effect.graveIndex]
    if (result) {
      addLog(g, `コイントス：表！「${card.data.name}」を特殊召喚`)
      if (card.data.type === 'monster') {
        const backZone = effect.owner === 'my' ? 'myBack' : 'oppBack'
        const frontZone = effect.owner === 'my' ? 'myFront' : 'oppFront'
        const backArr = [...getZoneArr(g, backZone)]
        const frontArr = [...getZoneArr(g, frontZone)]
        const emptyBack = backArr.findIndex(c => c === null)
        const emptyFront = frontArr.findIndex(c => c === null)
        const targetZone = emptyBack !== -1 ? backZone : emptyFront !== -1 ? frontZone : null
        const targetIdx = emptyBack !== -1 ? emptyBack : emptyFront !== -1 ? emptyFront : -1
        if (targetZone && targetIdx !== -1) {
          const arr = [...getZoneArr(g, targetZone)]
          arr[targetIdx] = toField(card.data, card.isAwake)
          setZoneArr(g, targetZone, arr)
          grave.splice(effect.graveIndex, 1)
        }
      } else {
        const spellZone = effect.owner === 'my' ? 'mySpellZone' : 'oppSpellZone'
        const arr = [...getZoneArr(g, spellZone)]
        const empty = arr.findIndex(c => c === null)
        if (empty !== -1) {
          arr[empty] = toField(card.data, false)
          setZoneArr(g, spellZone, arr)
          grave.splice(effect.graveIndex, 1)
        }
      }
    } else {
      addLog(g, `コイントス：裏…「${card.data.name}」はゲームから除外`)
      g.bannedCards.push(card.data.id)
      grave.splice(effect.graveIndex, 1)
    }
    g.pendingEffect = null
    setGame({ ...g })
  }

  const winner = game
    ? game.myLP <= 0 ? '相手の勝利' : game.oppLP <= 0 ? 'あなたの勝利' : null
    : null

  if (loading) return (
    <main style={{ background: '#0f0f0f', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#e8c876' }}>読み込み中...</p>
    </main>
  )

  if (!game) return (
    <main style={{ background: '#0f0f0f', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 24 }}>
      <h1 style={{ color: '#e8c876', fontFamily: 'Georgia, serif', fontSize: 48, letterSpacing: '0.3em' }}>AWAKE</h1>
      <button onClick={startGame} style={{ background: '#e8c876', color: '#0f0f0f', border: 'none', padding: '12px 40px', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}>
        ソロ対戦開始
      </button>
    </main>
  )

  if (winner) return (
    <main style={{ background: '#0f0f0f', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 24 }}>
      <div style={{ fontSize: 36, color: '#e8c876', fontWeight: 'bold' }}>{winner}</div>
      <button onClick={startGame} style={{ background: '#e8c876', color: '#0f0f0f', border: 'none', padding: '12px 40px', borderRadius: 8, fontSize: 16, fontWeight: 'bold', cursor: 'pointer' }}>もう一度</button>
    </main>
  )

  const isMyTurn = game.turn === 'my'
  const phaseLabel: Record<string, string> = {
    draw: 'ドローフェイズ', main: 'メインフェイズ', battle: 'バトルフェイズ', end: 'エンドフェイズ'
  }

  const Z = {
    wrap: { background: '#0f0f0f', minHeight: '100vh', padding: 12, fontFamily: 'monospace' } as React.CSSProperties,
    row: { display: 'flex', gap: 5, justifyContent: 'center', alignItems: 'center', marginBottom: 4 } as React.CSSProperties,
    label: { fontSize: 9, color: '#555', textAlign: 'center' as const, marginBottom: 2 },
    lp: { background: '#1e1e1e', border: '1px solid #333', borderRadius: 6, padding: '4px 12px', textAlign: 'center' as const, marginBottom: 6 },
    deck: { width: 64, height: 80, borderRadius: 5, border: '1px solid #554', background: '#1e1a0a', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#e8c876', flexShrink: 0, textAlign: 'center' as const, cursor: 'pointer' },
    btn: (bg = '#2a2a2a'): React.CSSProperties => ({ background: bg, color: bg === '#e8c876' ? '#0f0f0f' : '#fff', border: 'none', padding: '6px 14px', borderRadius: 5, fontSize: 11, cursor: 'pointer', fontWeight: 'bold' }),
  }

  const cardBox = (selected: boolean, borderColor: string, dimmed = false): React.CSSProperties => ({
    width: 64, height: 80, borderRadius: 5,
    border: `1px solid ${selected ? '#e8c876' : borderColor}`,
    background: selected ? '#2a2a00' : '#1a1a1a',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    fontSize: 8, flexShrink: 0, cursor: 'pointer', padding: 2,
    boxSizing: 'border-box' as const, gap: 1, opacity: dimmed ? 0.5 : 1,
  })

  const emptyBox = (selected: boolean, borderColor: string): React.CSSProperties => ({
    width: 64, height: 80, borderRadius: 5,
    border: `1px solid ${selected ? '#e8c876' : borderColor}`,
    background: selected ? '#2a2a00' : '#161616',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 9, color: '#2a2a2a', flexShrink: 0, cursor: 'pointer',
  })

  const sel = game.selectedCard
  const selCard = sel ? getZoneCard(game, sel.zone, sel.index) : null
  const selIsMyField = sel && (sel.zone === 'myFront' || sel.zone === 'myBack')
  const selIsHand = sel?.zone === (isMyTurn ? 'myHand' : 'oppHand')
  const selCardData = selCard && !('data' in selCard) ? selCard as CardData : null
  const selCardIsMonster = selCardData?.type === 'monster'
  const selCardIsSpell = selCardData && (selCardData.type === 'spell' || selCardData.type === 'trap')
  const isPendingTarget = game.pendingEffect?.type === 'select_target'

  const renderFieldCard = (fc: FieldCard | null, zone: string, index: number, borderColor: string) => {
    const isSel = sel?.zone === zone && sel?.index === index
    const handleClick = () => {
      if (isPendingTarget) { handlePendingTarget(zone, index); return }
      if (game.phase === 'battle' && selIsMyField && sel && zone.startsWith('opp')) {
        attack(sel.zone, sel.index, zone, index); return
      }
      if (game.phase === 'main' && selIsHand && selCardIsMonster && zone.startsWith('my') && !fc) {
        summonMonster(zone as 'myFront' | 'myBack', index); return
      }
      if (game.phase === 'main' && selIsHand && selCardIsSpell && zone.startsWith(isMyTurn ? 'my' : 'opp') && !fc) {
        setSpellCard(zone.replace('Front','SpellZone').replace('Back','SpellZone') as 'mySpellZone' | 'oppSpellZone', index); return
      }
      selectCard(zone, index)
    }
    if (!fc) return <div key={index} style={emptyBox(isSel, borderColor)} onClick={handleClick}>空</div>
    const name = fc.isAwake && fc.data.name_awake ? fc.data.name_awake : fc.data.name
    const atkVal = ((fc.isAwake ? fc.data.atk_awake : fc.data.atk_sealed) ?? 0) + fc.atkMod
    const defVal = ((fc.isAwake ? fc.data.def_awake : fc.data.def_sealed) ?? 0) + fc.defMod
    const imgUrl = fc.isAwake ? (fc.data.img_awake ?? fc.data.img_sealed) : fc.data.img_sealed
    const attr = fc.data.attribute ?? ''
    return (
      <div key={index} style={cardBox(isSel, borderColor, fc.hasAttacked)} onClick={handleClick}>
        {imgUrl && <img src={imgUrl} style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: 3 }} alt="" />}
        {attr && <div style={{ fontSize: 7, color: ATTR_COLOR[attr] ?? '#888', lineHeight: 1 }}>{attr}</div>}
        <div style={{ fontSize: 7, color: '#ccc', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1 }}>{name}</div>
        <div style={{ fontSize: 7, color: fc.stance === 'attack' ? '#f88' : '#88f', lineHeight: 1 }}>
          {fc.stance === 'attack' ? `ATK ${atkVal}` : `DEF ${defVal}`}
        </div>
        {fc.isAwake && <div style={{ fontSize: 7, color: '#4f4', lineHeight: 1 }}>覚醒</div>}
        {fc.cantAttack && <div style={{ fontSize: 7, color: '#f44', lineHeight: 1 }}>攻撃不可</div>}
      </div>
    )
  }

  const renderSpellZoneCard = (fc: FieldCard | null, zone: string, index: number) => {
    const isSel = sel?.zone === zone && sel?.index === index
    const handleClick = () => {
      if (isPendingTarget) return
      if (fc && (game.phase === 'main' || game.phase === 'battle')) {
        activateSpell(zone as 'mySpellZone' | 'oppSpellZone', index); return
      }
      if (!fc && selIsHand && selCardIsSpell) {
        setSpellCard(zone as 'mySpellZone' | 'oppSpellZone', index); return
      }
      if (fc) selectCard(zone, index)
    }
    if (!fc) return (
      <div key={index} style={emptyBox(isSel, '#446')} onClick={handleClick}>空</div>
    )
    const imgUrl = fc.data.img ?? fc.data.img_sealed
    return (
      <div key={index} style={cardBox(isSel, '#66a')} onClick={handleClick}>
        {imgUrl && <img src={imgUrl} style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: 3 }} alt="" />}
        <div style={{ fontSize: 7, color: '#aaf', lineHeight: 1 }}>{fc.data.type}</div>
        <div style={{ fontSize: 7, color: '#ccc', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1 }}>{fc.data.name}</div>
        <div style={{ fontSize: 7, color: '#88f', lineHeight: 1 }}>タップで発動</div>
      </div>
    )
  }

  const renderHandCard = (card: CardData, zone: string, index: number) => {
    const isSel = sel?.zone === zone && sel?.index === index
    const imgUrl = card.img_sealed ?? card.img
    return (
      <div key={index} style={cardBox(isSel, '#555')} onClick={() => selectCard(zone, index)}>
        {imgUrl && <img src={imgUrl} style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: 3 }} alt="" />}
        <div style={{ fontSize: 7, color: ATTR_COLOR[card.attribute ?? ''] ?? '#888', lineHeight: 1 }}>{card.attribute}</div>
        <div style={{ fontSize: 7, color: '#ccc', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1 }}>{card.name}</div>
        {card.type === 'monster'
          ? <div style={{ fontSize: 7, color: '#f88', lineHeight: 1 }}>{card.atk_sealed ?? 0}/{card.def_sealed ?? 0}</div>
          : <div style={{ fontSize: 7, color: '#aaf', lineHeight: 1 }}>{card.type}</div>
        }
      </div>
    )
  }

  return (
    <main style={Z.wrap}>
      {winner && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ fontSize: 36, color: '#e8c876', fontWeight: 'bold', marginBottom: 24 }}>{winner}</div>
          <button onClick={startGame} style={Z.btn('#e8c876')}>もう一度</button>
        </div>
      )}

      {/* pendingEffect UI */}
      {game.pendingEffect?.type === 'coin_toss' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ color: '#e8c876', fontSize: 20, marginBottom: 20 }}>地獄の審判：コイントス</div>
          <button style={Z.btn('#e8c876')} onClick={coinToss}>コインを投げる</button>
        </div>
      )}

      {isPendingTarget && (
        <div style={{ background: '#2a1a00', border: '1px solid #e8c876', borderRadius: 6, padding: '6px 12px', marginBottom: 6, fontSize: 11, color: '#e8c876', textAlign: 'center' }}>
          {(game.pendingEffect as { message: string }).message}　（対象をクリックしてください）
        </div>
      )}

      {/* ターン・フェイズ */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: isMyTurn ? '#e8c876' : '#888', fontSize: 12, fontWeight: 'bold' }}>
          {isMyTurn ? '自分のターン' : '相手のターン'}
        </span>
        <span style={{ color: '#555', fontSize: 11 }}>|</span>
        <span style={{ color: '#aaa', fontSize: 11 }}>{phaseLabel[game.phase]}</span>
        {!isMyTurn && (
         <button style={Z.btn(aiRunning ? '#555' : '#a84')} onClick={runOppAI} disabled={aiRunning}>
            {aiRunning ? '実行中...' : '相手ターンを実行'}
          </button>
        )}
        {isMyTurn && game.phase === 'draw' && <>
          <button style={Z.btn()} onClick={() => drawCard('monster')}>Mドロー</button>
          <button style={Z.btn()} onClick={() => drawCard('spell')}>S/Tドロー</button>
        </>}
        {game.phase === 'main' && !game.isFirstTurn && (
          <button style={Z.btn()} onClick={() => { const g = { ...game }; g.phase = 'battle'; addLog(g, 'バトルフェイズ開始'); setGame({ ...g }) }}>バトルへ</button>
        )}
        {game.phase === 'main' && game.isFirstTurn && (
          <span style={{ fontSize: 10, color: '#666' }}>先攻のため攻撃不可</span>
        )}
        <button style={Z.btn('#446')} onClick={nextPhase}>
          {game.phase === 'end' ? 'ターン終了' : 'スキップ'}
        </button>
        <button style={Z.btn('#333')} onClick={() => setShowGrave('my')}>自分墓地({game.myGrave.length})</button>
        <button style={Z.btn('#333')} onClick={() => setShowGrave('opp')}>相手墓地({game.oppGrave.length})</button>
      </div>

      {/* 選択中カード情報 */}
      {selCard && (
        <div style={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: 6, padding: '6px 12px', marginBottom: 6, fontSize: 10, color: '#ccc', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {'data' in selCard ? (
            <>
              <span style={{ color: '#e8c876' }}>{selCard.data.name}{selCard.isAwake ? '（覚醒）' : ''}</span>
              <span>ATK {((selCard.isAwake ? selCard.data.atk_awake : selCard.data.atk_sealed) ?? 0) + selCard.atkMod} / DEF {((selCard.isAwake ? selCard.data.def_awake : selCard.data.def_sealed) ?? 0) + selCard.defMod}</span>
              <span style={{ color: '#777', fontSize: 9 }}>{selCard.isAwake ? selCard.data.effect_awake : selCard.data.effect}</span>
              {sel?.zone === (isMyTurn ? 'myBack' : 'oppBack') && (
                <button style={Z.btn('#2a4a2a')} onClick={() => awakeMonster(sel!.zone as 'myBack' | 'oppBack', sel!.index)}>覚醒</button>
              )}
              {selIsMyField && (
                <button style={Z.btn('#2a2a4a')} onClick={() => toggleStance(sel!.zone as 'myFront' | 'myBack', sel!.index)}>表示変更</button>
              )}
              {game.phase === 'battle' && selIsMyField && (
                <span style={{ color: '#f88', fontSize: 9 }}>→ 攻撃先を選択</span>
              )}
            </>
          ) : (
            <>
              <span style={{ color: '#e8c876' }}>{(selCard as CardData).name}</span>
              <span style={{ color: '#aaf', fontSize: 9 }}>{(selCard as CardData).type}</span>
              <span style={{ color: '#777', fontSize: 9 }}>{(selCard as CardData).effect}</span>
              {selCardIsMonster && game.phase === 'main' && isMyTurn && (
                <span style={{ color: '#8cf', fontSize: 9 }}>→ 召喚先をクリック</span>
              )}
              {selCardIsSpell && game.phase === 'main' && (
                <span style={{ color: '#8cf', fontSize: 9 }}>→ 魔法・トラップゾーンをクリックでセット</span>
              )}
            </>
          )}
        </div>
      )}

      {message && <div style={{ color: '#f66', fontSize: 10, textAlign: 'center', marginBottom: 6 }}>{message}</div>}

      {/* 墓地ビューア */}
      {showGrave && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => { setShowGrave(null); setGraveSelectMode(null) }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: 8, padding: 16, maxWidth: 500, width: '90%' }} onClick={e => e.stopPropagation()}>
            <div style={{ color: '#e8c876', marginBottom: 8 }}>
              {showGrave === 'my' ? '自分' : '相手'}の墓地
              {graveSelectMode && <span style={{ color: '#f88', fontSize: 10, marginLeft: 8 }}>特殊召喚するカードを選んでください</span>}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(showGrave === 'my' ? game.myGrave : game.oppGrave).map((gc, i) => (
                <div key={i} style={{ width: 56, fontSize: 8, color: '#ccc', textAlign: 'center', cursor: graveSelectMode ? 'pointer' : 'default', border: graveSelectMode ? '1px solid #e8c876' : 'none', borderRadius: 4, padding: 2 }}
                  onClick={() => {
                    if (!graveSelectMode) return
                    const g = { ...game }
                    const grave = graveSelectMode.owner === 'my' ? g.myGrave : g.oppGrave

                    if (graveSelectMode.action === 'jigoku_sinpan') {
                      // 地獄の審判：選んだカードのインデックスをpendingEffectに設定してコイントスへ
                      if (g.pendingEffect?.type === 'coin_toss') {
                        g.pendingEffect = { ...g.pendingEffect, graveIndex: i }
                      }
                      setGame({ ...g })
                      setShowGrave(null)
                      setGraveSelectMode(null)
                      setMessage('')
                      return
                    }

                    // witch_revive の処理
                    const revived = grave[i]
                    const backZone = graveSelectMode.owner === 'my' ? 'myBack' : 'oppBack'
                    const frontZone = graveSelectMode.owner === 'my' ? 'myFront' : 'oppFront'
                    const backArr = [...getZoneArr(g, backZone)]
                    const frontArr = [...getZoneArr(g, frontZone)]
                    const emptyBack = backArr.findIndex(c => c === null)
                    const emptyFront = frontArr.findIndex(c => c === null)
                    const targetZoneStr = emptyBack !== -1 ? backZone : emptyFront !== -1 ? frontZone : null
                    const targetIdx = emptyBack !== -1 ? emptyBack : emptyFront !== -1 ? emptyFront : -1
                    if (!targetZoneStr || targetIdx === -1) { setMessage('フィールドが埋まっています'); return }
                    const arr = [...getZoneArr(g, targetZoneStr)]
                    arr[targetIdx] = toField(revived.data, false)
                    setZoneArr(g, targetZoneStr, arr)
                    if (graveSelectMode.owner === 'my') g.myGrave = g.myGrave.filter((_, idx) => idx !== i)
                    else g.oppGrave = g.oppGrave.filter((_, idx) => idx !== i)
                    g.pendingEffect = null
                    addLog(g, `「${revived.data.name}」を封印状態で特殊召喚`)
                    setGame({ ...g })
                    setShowGrave(null)
                    setGraveSelectMode(null)
                    setMessage('')
                  }}>
                  {(gc.data.img_sealed || gc.data.img) && <img src={gc.data.img_sealed ?? gc.data.img ?? ''} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 3 }} alt="" />}
                  <div>{gc.data.name}</div>
                </div>
              ))}
              {(showGrave === 'my' ? game.myGrave : game.oppGrave).length === 0 && <div style={{ color: '#555' }}>空</div>}
            </div>
            <button style={{ ...Z.btn(), marginTop: 12 }} onClick={() => { setShowGrave(null); setGraveSelectMode(null) }}>閉じる</button>
          </div>
        </div>
      )}

      {/* 相手LP */}
      <div style={Z.lp}>
        <div style={{ fontSize: 9, color: '#555' }}>相手 LP</div>
        <div style={{ fontSize: 18, color: '#e8c876', fontWeight: 'bold' }}>{game.oppLP}</div>
      </div>

      {/* 相手手札 */}
      <div style={Z.label}>相手 手札</div>
      <div style={{ ...Z.row, justifyContent: 'flex-end' }}>
        {game.oppHand.map((c, i) => renderHandCard(c, 'oppHand', i))}
        <div style={{ width: 69, flexShrink: 0 }} />
      </div>

      {/* 相手 魔法・トラップ */}
      <div style={Z.label}>相手 魔法・トラップゾーン</div>
      <div style={Z.row}>
        {game.oppSpellZone.map((fc, i) => renderSpellZoneCard(fc, 'oppSpellZone', i))}
        <div style={Z.deck}>
          <div>S/T</div><div>デッキ</div>
          <div style={{ fontSize: 13 }}>{game.oppSpellDeck.length}</div>
        </div>
      </div>

      {/* 相手 後列（封印） */}
      <div style={Z.label}>相手 後列（封印ゾーン）</div>
      <div style={Z.row}>
        {game.oppBack.map((fc, i) => renderFieldCard(fc, 'oppBack', i, '#445'))}
        <div style={{ width: 64, height: 80, borderRadius: 5, border: '1px solid #443', background: '#1a1200', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#a87', flexShrink: 0, cursor: 'pointer', textAlign: 'center' }} onClick={() => setShowGrave('opp')}>
          <div>墓地</div>
          <div style={{ fontSize: 13 }}>{game.oppGrave.length}</div>
        </div>
      </div>

      {/* 相手 前列（覚醒） */}
      <div style={Z.label}>相手 前列（覚醒ゾーン）</div>
      <div style={Z.row}>
        {game.oppFront.map((fc, i) => renderFieldCard(fc, 'oppFront', i, '#4a8'))}
        <div style={Z.deck}>
          <div>Mデッキ</div>
          <div style={{ fontSize: 13 }}>{game.oppMonsterDeck.length}</div>
        </div>
      </div>

      {/* VS */}
      <div style={{ height: 1, background: '#2a2a2a', margin: '8px 0', position: 'relative' }}>
        <span style={{ position: 'absolute', left: '50%', top: -8, transform: 'translateX(-50%)', background: '#0f0f0f', padding: '0 8px', color: '#444', fontSize: 10 }}>VS</span>
      </div>

      {/* 自分 前列（覚醒） */}
      <div style={Z.label}>自分 前列（覚醒ゾーン）</div>
      <div style={Z.row}>
        {game.myFront.map((fc, i) => renderFieldCard(fc, 'myFront', i, '#4a8'))}
        <div style={Z.deck} onClick={() => drawCard('monster')}>
          <div>Mデッキ</div>
          <div style={{ fontSize: 13 }}>{game.myMonsterDeck.length}</div>
        </div>
      </div>

     {/* 自分 後列（封印） */}
      <div style={Z.label}>自分 後列（封印ゾーン）</div>
      <div style={Z.row}>
        {game.myBack.map((fc, i) => renderFieldCard(fc, 'myBack', i, '#445'))}
        <div style={{ width: 64, height: 80, borderRadius: 5, border: '1px solid #443', background: '#1a1200', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#a87', flexShrink: 0, cursor: 'pointer', textAlign: 'center' }} onClick={() => setShowGrave('my')}>
          <div>墓地</div>
          <div style={{ fontSize: 13 }}>{game.myGrave.length}</div>
        </div>
      </div>

      {/* 自分 魔法・トラップ */}
      <div style={Z.label}>自分 魔法・トラップゾーン</div>
      <div style={Z.row}>
        {game.mySpellZone.map((fc, i) => renderSpellZoneCard(fc, 'mySpellZone', i))}
        <div style={Z.deck} onClick={() => drawCard('spell')}>
          <div>S/T</div><div>デッキ</div>
          <div style={{ fontSize: 13 }}>{game.mySpellDeck.length}</div>
        </div>
      </div>

      {/* 自分手札 */}
      <div style={Z.label}>自分 手札</div>
      <div style={{ ...Z.row, justifyContent: 'flex-end' }}>
        {game.myHand.map((c, i) => renderHandCard(c, 'myHand', i))}
        <div style={{ width: 69, flexShrink: 0 }} />
      </div>

      {/* 自分LP */}
      <div style={{ ...Z.lp, marginTop: 6, marginBottom: 0 }}>
        <div style={{ fontSize: 9, color: '#555' }}>自分 LP</div>
        <div style={{ fontSize: 18, color: '#e8c876', fontWeight: 'bold' }}>{game.myLP}</div>
      </div>

      {/* ログ */}
      <div style={{ marginTop: 10, background: '#111', border: '1px solid #2a2a2a', borderRadius: 6, padding: 8, maxHeight: 100, overflowY: 'auto' }}>
        {game.log.map((l, i) => (
          <div key={i} style={{ fontSize: 9, color: i === 0 ? '#e8c876' : '#555', marginBottom: 2 }}>{l}</div>
        ))}
      </div>
    </main>
  )
}