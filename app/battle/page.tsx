'use client'

import { useEffect, useRef, useState } from 'react'
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
  magicCounters: number
  witchRevived: boolean
  justSet: boolean
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
  phase: 'draw' | 'main' | 'battle' | 'main2'
  normalSummonDone: boolean
  awakeDone: boolean
  log: string[]
  selectedCard: { zone: string; index: number } | null
  pendingEffect: PendingEffect | null
  bannedCards: string[]
  endPhaseDestroyUids: { uid: string; owner: 'my' | 'opp'; dueAtOwner: 'my' | 'opp' }[]
  kumomaru_atkDown: { uid: string; owner: 'my' | 'opp' }[]
  isFirstTurn: boolean
  skipMyDraw: boolean
  skipOppDraw: boolean
  singariTargetUid: string | null
  myLPAtTurnStart: number
  oppLPAtTurnStart: number
}

type PendingEffect =
  | { type: 'select_target'; action: string; sourceZone: string; sourceIndex: number; message: string; sourceName?: string }
  | { type: 'coin_toss'; graveIndex: number; owner: 'my' | 'opp' }
  | { type: 'confirm'; message: string; onConfirm: string }

function buildDeckFromIds(ids: string[], cardMap: Map<string, CardData>, target: number): CardData[] {
  const cards = ids.map(id => cardMap.get(id)).filter(Boolean) as CardData[]
  if (cards.length === 0) return []
  const deck: CardData[] = []
  let i = 0
  while (deck.length < target) { deck.push({ ...cards[i % cards.length] }); i++ }
  return deck.sort(() => Math.random() - 0.5)
}

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
  return { uid: uid(), data: { ...card }, isAwake, stance: 'attack', hasAttacked: false, atkMod: 0, defMod: 0, cantAttack: false, lockedByUid: null, magicCounters: 0, witchRevived: false, justSet: false }
}

function placeInitial(deck: CardData[]): { back: (FieldCard | null)[]; remaining: CardData[] } {
  const remaining = [...deck]
  const back: (FieldCard | null)[] = [null, null, null, null, null]
  for (let i = 1; i <= 3; i++) {
    if (remaining.length === 0) break
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

const MAX_FIELD_MONSTERS = 5

function fieldMonsterCount(g: GameState, owner: 'my' | 'opp'): number {
  return getAllFieldCards(g, owner).length
}

function setZoneArr(g: GameState, zone: string, arr: (FieldCard | null)[]) {
  if (zone === 'myFront') g.myFront = arr
  else if (zone === 'myBack') g.myBack = arr
  else if (zone === 'oppFront') g.oppFront = arr
  else if (zone === 'oppBack') g.oppBack = arr
  else if (zone === 'mySpellZone') g.mySpellZone = arr
  else if (zone === 'oppSpellZone') g.oppSpellZone = arr
}

function addMagicCounters(g: GameState) {
  for (const z of ['myFront', 'myBack', 'oppFront', 'oppBack']) {
    const arr = [...getZoneArr(g, z)]
    let changed = false
    arr.forEach((fc, i) => {
      if (fc?.data.id === 'monster_chuta_01') {
        const atkBoost = fc.isAwake ? 1000 : 0
        arr[i] = { ...fc, magicCounters: fc.magicCounters + 1, atkMod: fc.atkMod + atkBoost }
        changed = true
      }
    })
    if (changed) setZoneArr(g, z, arr)
  }
}

function hasPrincess(g: GameState, owner: 'my' | 'opp'): boolean {
  const front = owner === 'my' ? g.myFront : g.oppFront
  const back = owner === 'my' ? g.myBack : g.oppBack
  return [...front, ...back].some(fc => fc?.data.id === 'monster_healing_cave_01' && fc.isAwake)
}

function restoreAtkDef(g: GameState, owner: 'my' | 'opp') {
  for (const z of ['Front', 'Back'] as const) {
    const zone = `${owner}${z}` as 'myFront' | 'myBack' | 'oppFront' | 'oppBack'
    const arr = [...getZoneArr(g, zone)]
    let changed = false
    arr.forEach((fc, i) => {
      if (fc && (fc.atkMod < 0 || fc.defMod < 0)) {
        arr[i] = { ...fc, atkMod: Math.max(0, fc.atkMod), defMod: Math.max(0, fc.defMod) }
        changed = true
      }
    })
    if (changed) setZoneArr(g, zone, arr)
  }
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

function flipGameState(g: GameState): GameState {
  return {
    myLP: g.oppLP, oppLP: g.myLP,
    myHand: g.oppHand, oppHand: g.myHand,
    myMonsterDeck: g.oppMonsterDeck, oppMonsterDeck: g.myMonsterDeck,
    mySpellDeck: g.oppSpellDeck, oppSpellDeck: g.mySpellDeck,
    myFront: g.oppFront, oppFront: g.myFront,
    myBack: g.oppBack, oppBack: g.myBack,
    mySpellZone: g.oppSpellZone, oppSpellZone: g.mySpellZone,
    myGrave: g.oppGrave, oppGrave: g.myGrave,
    turn: g.turn === 'my' ? 'opp' : 'my',
    phase: g.phase, normalSummonDone: g.normalSummonDone, awakeDone: g.awakeDone,
    log: g.log, selectedCard: null, pendingEffect: g.pendingEffect,
    bannedCards: g.bannedCards,
    endPhaseDestroyUids: g.endPhaseDestroyUids.map(x => ({ uid: x.uid, owner: x.owner === 'my' ? 'opp' as const : 'my' as const, dueAtOwner: x.dueAtOwner === 'my' ? 'opp' as const : 'my' as const })),
    kumomaru_atkDown: g.kumomaru_atkDown.map(x => ({ uid: x.uid, owner: x.owner === 'my' ? 'opp' as const : 'my' as const })),
    isFirstTurn: g.isFirstTurn, skipMyDraw: g.skipOppDraw, skipOppDraw: g.skipMyDraw,
    singariTargetUid: g.singariTargetUid,
    myLPAtTurnStart: g.oppLPAtTurnStart, oppLPAtTurnStart: g.myLPAtTurnStart,
  }
}

const CW = 84
const CH = 66

export default function BattlePage() {
  const [allCards, setAllCards] = useState<CardData[]>([])
  const [game, setGame] = useState<GameState | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [showGrave, setShowGrave] = useState<'my' | 'opp' | null>(null)
  const [graveSelectMode, setGraveSelectMode] = useState<{ owner: 'my' | 'opp'; action: string } | null>(null)
  const [aiRunning, setAiRunning] = useState(false)
  const [discardHandMode, setDiscardHandMode] = useState<{ selected: number[] } | null>(null)
  const [battleDisplay, setBattleDisplay] = useState<{
    atkName: string; atkImg: string; atkVal: number
    defName: string | null; defImg: string | null; defVal: number; defStance: 'attack' | 'defense'
    damage: number; result: string; isPlayerAttack: boolean
  } | null>(null)
  const [awakeDisplay, setAwakeDisplay] = useState<{ name: string; img: string } | null>(null)
  const [trapPrompt, setTrapPrompt] = useState<{ cardName: string; cardEffect?: string; triggeredBy?: string } | null>(null)
  const [singariTargetMode, setSingariTargetMode] = useState(false)
  const trapResolveRef = useRef<((yes: boolean) => void) | null>(null)
  const singariTargetResolveRef = useRef<((uid: string | null) => void) | null>(null)
  const [catSelectModalOpen, setCatSelectModalOpen] = useState(false)
  const [fishermanPrompt, setFishermanPrompt] = useState(false)
  const [fishermanTargetMode, setFishermanTargetMode] = useState(false)
  const fishermanResolveRef = useRef<((activate: boolean) => void) | null>(null)
  const fishermanTargetResolveRef = useRef<(() => void) | null>(null)
  const [kumaAttackModal, setKumaAttackModal] = useState<{ atkZone: string; atkIndex: number; defZone: string; defIndex: number; availableCount: number; maxSummon: number } | null>(null)
  const kumaEffectHandledRef = useRef(false)
  const kumaGameRef = useRef<GameState | null>(null)
  const gameRef = useRef<GameState | null>(null)
  const [coinReward, setCoinReward] = useState(0)
  const coinAwardedRef = useRef(false)
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard' | null>(null)
  const [coinFlipState, setCoinFlipState] = useState<'idle' | 'flipping' | 'result'>('idle')
  const [playerFirst, setPlayerFirst] = useState(true)
  const [myDeckRecord, setMyDeckRecord] = useState<{ monster_cards: string[]; magic_trap_cards: string[] } | null>(null)
  type OnlineMode = { roomId: string; role: 'host' | 'guest'; opponentName: string }
  const [onlineMode, setOnlineMode] = useState<OnlineMode | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null)
  const fromBroadcastRef = useRef(false)
  const onlineModeRef = useRef<OnlineMode | null>(null)
  const [opponentDisconnected, setOpponentDisconnected] = useState(false)
  const onlineActionResolveRef = useRef<((activated: boolean) => void) | null>(null)
  const [onlineTrapCheckPrompt, setOnlineTrapCheckPrompt] = useState<{
    cardName: string; cardEffect: string; triggeredBy: string
  } | null>(null)
  const singariCheckedRef = useRef(false)
  const onlineSingariSlotRef = useRef(-1)
  const [waitingForTrapResponse, setWaitingForTrapResponse] = useState(false)
  const [opponentCheckingTrap, setOpponentCheckingTrap] = useState(false)
  const [cardReveal, setCardReveal] = useState<{ data: CardData; owner: 'my' | 'opp' } | null>(null)
  // GUEST がブロードキャストしてきたデッキ情報を HOST 側で保持するための ref
  const guestDeckBroadcastRef = useRef<{ monster_cards: string[]; magic_trap_cards: string[] } | null>(null)

  useEffect(() => {
    const supabase = createClient()
    async function init() {
      const [cardsRes, sessionRes] = await Promise.all([
        supabase.from('cards').select('*'),
        supabase.auth.getSession(),
      ])
      if (cardsRes.data) setAllCards(cardsRes.data)
      const user = sessionRes.data.session?.user
      let myDeckData: { monster_cards: string[]; magic_trap_cards: string[] } | null = null
      if (user) {
        const { data: deck } = await supabase.from('decks')
          .select('monster_cards,magic_trap_cards')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1).maybeSingle()
        if (deck) {
          myDeckData = deck as { monster_cards: string[]; magic_trap_cards: string[] }
          setMyDeckRecord(deck)
        }
      }

      // オンラインモード：URLパラメータを読む
      const params = new URLSearchParams(window.location.search)
      const roomId = params.get('room')
      const role = params.get('role') as 'host' | 'guest' | null
      const opponentName = params.get('opponent') ? decodeURIComponent(params.get('opponent')!) : '相手'

      if (roomId && role) {
        const mode: OnlineMode = { roomId, role, opponentName }
        setOnlineMode(mode)
        onlineModeRef.current = mode

        const channel = supabase.channel(`battle:${roomId}`)
        channel.on('broadcast', { event: 'game_state' }, ({ payload }: { payload: { state: GameState } }) => {
          fromBroadcastRef.current = true
          setGame(prev => {
            const received = payload.state
            // Restore our own real card data for slots the opponent sees as hidden
            const mergedMySpellZone = received.mySpellZone.map((fc, i) =>
              fc && fc.data.id === '__hidden__' ? (prev?.mySpellZone[i] ?? null) : fc
            )
            return { ...received, mySpellZone: mergedMySpellZone }
          })
          setCoinFlipState('idle')
        })
        channel.on('presence', { event: 'leave' }, () => {
          setOpponentDisconnected(true)
        })
        channel.on('broadcast', { event: 'action_check' }, ({ payload }: { payload: { type: string; cardName?: string } }) => {
          const g = gameRef.current
          if (!g) { channelRef.current?.send({ type: 'broadcast', event: 'trap_response', payload: { activated: false } }); return }
          if (payload.type === 'spell') {
            const akumuSlot = g.mySpellZone.findIndex(fc => fc?.data.id === 'trap_akumu_daihunka_01')
            if (akumuSlot !== -1) {
              setOnlineTrapCheckPrompt({
                cardName: '悪夢の大噴火',
                cardEffect: '発動した効果を無効化し、相手と自分の魔法・トラップゾーンのカードを全て破壊する。',
                triggeredBy: payload.cardName ?? '相手のカード',
              })
            } else {
              channelRef.current?.send({ type: 'broadcast', event: 'trap_response', payload: { activated: false } })
            }
          } else {
            channelRef.current?.send({ type: 'broadcast', event: 'trap_response', payload: { activated: false } })
          }
        })
        channel.on('broadcast', { event: 'trap_response' }, ({ payload }: { payload: { activated: boolean } }) => {
          onlineActionResolveRef.current?.(payload.activated)
          onlineActionResolveRef.current = null
        })
        channel.on('broadcast', { event: 'trap_checking' }, ({ payload }: { payload: { active: boolean } }) => {
          setOpponentCheckingTrap(payload.active)
        })
        channel.on('broadcast', { event: 'card_reveal' }, ({ payload }: { payload: { card: CardData } }) => {
          showCardReveal(payload.card, 'opp')
        })
        channel.on('broadcast', { event: 'battle_anim' }, ({ payload }: { payload: { info: { atkName: string; atkImg: string; atkVal: number; defName: string | null; defImg: string | null; defVal: number; defStance: 'attack' | 'defense'; damage: number; result: string; isPlayerAttack: boolean } } }) => {
          const info = { ...payload.info, isPlayerAttack: !payload.info.isPlayerAttack }
          setBattleDisplay(info)
          setTimeout(() => setBattleDisplay(null), 2000)
        })
        // HOST 側: GUEST がブロードキャストしたデッキ情報を受信して保持
        if (role === 'host') {
          channel.on('broadcast', { event: 'guest_deck_info' }, ({ payload }: { payload: { deck: { monster_cards: string[]; magic_trap_cards: string[] } } }) => {
            if (payload.deck) guestDeckBroadcastRef.current = payload.deck
          })
        }

        // GUEST 側: HOST が presence に参加したら自分のデッキを送信
        if (role === 'guest') {
          channel.on('presence', { event: 'join' }, ({ newPresences }: { newPresences: { role?: string }[] }) => {
            const hostJoined = newPresences.some(p => p.role === 'host')
            if (hostJoined && myDeckData) {
              channel.send({ type: 'broadcast', event: 'guest_deck_info', payload: { deck: myDeckData } })
            }
          })
        }

        channel.subscribe(async (status: string) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({ role, userId: user?.id ?? '' })
          }
        })
        channelRef.current = channel
      }

      setLoading(false)
    }
    init()
    return () => { channelRef.current?.unsubscribe() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    for (const card of allCards) {
      if (card.img_awake) { const img = new Image(); img.src = card.img_awake }
      if (card.img_sealed) { const img = new Image(); img.src = card.img_sealed }
    }
  }, [allCards])

  useEffect(() => {
    if (game?.turn === 'opp' && game?.phase === 'draw' && !aiRunning) {
      if (onlineMode) return
      runOppAI()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.turn, game?.phase, aiRunning, onlineMode])

  useEffect(() => { gameRef.current = game }, [game])

  // オンライン：相手のバトルフェイズ開始時にしんがりトラップをチェック
  useEffect(() => {
    if (!onlineMode || !game) return
    if (game.turn === 'opp' && game.phase === 'battle') {
      if (singariCheckedRef.current) return
      singariCheckedRef.current = true
      const singariSlot = game.mySpellZone.findIndex(fc => fc?.data.id === 'trap_singari_01')
      const hasMyMonsters = [...game.myFront, ...game.myBack].some(fc => fc !== null)
      if (singariSlot !== -1 && hasMyMonsters) {
        channelRef.current?.send({ type: 'broadcast', event: 'trap_checking', payload: { active: true } })
        onlineSingariSlotRef.current = singariSlot
        setTrapPrompt({
          cardName: 'しんがり',
          cardEffect: 'このバトルフェイズでの攻撃は全て選択したモンスターが受ける。',
        })
      }
    } else {
      singariCheckedRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.turn, game?.phase, onlineMode])

  // オンライン：自分のアクションで変化したゲーム状態を相手にブロードキャスト
  useEffect(() => {
    if (!onlineModeRef.current || !game) return
    if (fromBroadcastRef.current) {
      fromBroadcastRef.current = false
      return
    }
    const flipped = flipGameState(game)
    const HIDDEN_CARD: CardData = { id: '__hidden__', name: 'セット中', name_awake: null, type: 'trap', atk_sealed: null, def_sealed: null, atk_awake: null, def_awake: null, effect: null, effect_awake: null, img_sealed: null, img_awake: null, img: null, attribute: null, max_in_deck: null }
    const redacted: GameState = { ...flipped, oppSpellZone: flipped.oppSpellZone.map(fc => fc ? { ...fc, data: HIDDEN_CARD } : null) }
    channelRef.current?.send({
      type: 'broadcast',
      event: 'game_state',
      payload: { state: redacted },
    })
  }, [game])

  type DeckRecord = { monster_cards: string[]; magic_trap_cards: string[] }

  function showCardReveal(data: CardData, owner: 'my' | 'opp') {
    setCardReveal({ data, owner })
    setTimeout(() => setCardReveal(null), 1900)
  }

  function buildPlayerDecks(deckRecord: DeckRecord | null | undefined, isOnline: boolean, cardMap: Map<string, CardData>): { monsterDeck: CardData[]; spellDeck: CardData[] } {
    if (deckRecord && (deckRecord.monster_cards.length > 0 || deckRecord.magic_trap_cards.length > 0)) {
      const monsterDeck = buildDeckFromIds(deckRecord.monster_cards, cardMap, 15)
      const spellDeck = buildDeckFromIds(deckRecord.magic_trap_cards, cardMap, 15)
      return { monsterDeck, spellDeck }
    }
    // デッキレコードが null/空 の場合: オンラインモードは全カードフォールバック禁止
    if (isOnline) {
      console.error('[AWAKE] deck record missing in online mode — using empty deck')
      return { monsterDeck: [], spellDeck: [] }
    }
    const d = buildDecks(allCards)
    return { monsterDeck: d.monsterDeck, spellDeck: d.spellDeck }
  }

  function startGame(first: 'my' | 'opp' = 'my', oppDeckRecord?: DeckRecord | null, myDeckOverride?: DeckRecord | null) {
    const cardMap = new Map(allCards.map(c => [c.id, c]))
    const isOnline = !!onlineModeRef.current

    const effectiveMyDeck = myDeckOverride ?? myDeckRecord
    const { monsterDeck: myMonsterDeck, spellDeck: mySpellDeck2 } = buildPlayerDecks(effectiveMyDeck, isOnline, cardMap)
    const { monsterDeck: oppMonsterDeck, spellDeck: oppSpellDeck2 } = buildPlayerDecks(oppDeckRecord, isOnline, cardMap)
    const myInitial = placeInitial(myMonsterDeck)
    const oppInitial = placeInitial(oppMonsterDeck)

    const myPool = [...myInitial.remaining, ...mySpellDeck2].sort(() => Math.random() - 0.5)
    const myHand = myPool.splice(0, 4)
    const myMonRemaining = myPool.filter(c => c.type === 'monster')
    const mySpellRemaining = myPool.filter(c => c.type !== 'monster')

    const oppPool = [...oppInitial.remaining, ...oppSpellDeck2].sort(() => Math.random() - 0.5)
    const oppHand = oppPool.splice(0, 4)
    const oppMonRemaining = oppPool.filter(c => c.type === 'monster')
    const oppSpellRemaining = oppPool.filter(c => c.type !== 'monster')

    // 初期配置: DEF > ATK のモンスターは守備表示にする
    const oppInitialBack = oppInitial.back.map(fc => {
      if (!fc) return null
      const atk = fc.data.atk_sealed ?? 0
      const def = fc.data.def_sealed ?? 0
      return def > atk ? { ...fc, stance: 'defense' as const } : fc
    })

    setGame({
      myLP: 5000, oppLP: 5000,
      myHand, oppHand,
      myMonsterDeck: myMonRemaining, oppMonsterDeck: oppMonRemaining,
      mySpellDeck: mySpellRemaining, oppSpellDeck: oppSpellRemaining,
      myFront: [null,null,null,null,null], myBack: myInitial.back,
      oppFront: [null,null,null,null,null], oppBack: oppInitialBack,
      mySpellZone: [null,null,null,null,null], oppSpellZone: [null,null,null,null,null],
      myGrave: [], oppGrave: [],
      turn: first, phase: 'draw',
      normalSummonDone: false, awakeDone: false,
      log: [first === 'my' ? 'ゲーム開始！あなたが先行' : 'ゲーム開始！相手が先行'],
      selectedCard: null, pendingEffect: null,
      bannedCards: [], endPhaseDestroyUids: [], kumomaru_atkDown: [],
      isFirstTurn: true, skipMyDraw: false, skipOppDraw: false, singariTargetUid: null,
      myLPAtTurnStart: 5000, oppLPAtTurnStart: 5000,
    })
    setMessage('')
    setCoinFlipState('idle')
  }

  async function handleStartDuel() {
    if (onlineMode?.role === 'host') {
      const supabase = createClient()
      const { data: room } = await supabase.from('online_battles')
        .select('host_deck, guest_deck, guest_id')
        .eq('id', onlineMode.roomId)
        .single()

      // guest_deck を確定（優先順位順）:
      //   1. GUEST がブロードキャストしてきたデッキ（最も確実）
      //   2. online_battles.guest_deck（DB 保存値）
      //   3. decks テーブルを guest_id で直接フェッチ（フォールバック）
      let guestDeck: DeckRecord | null = guestDeckBroadcastRef.current ?? (room?.guest_deck as DeckRecord | null) ?? null
      if (!guestDeck && room?.guest_id) {
        const { data: gd } = await supabase.from('decks')
          .select('monster_cards,magic_trap_cards')
          .eq('user_id', room.guest_id)
          .order('updated_at', { ascending: false })
          .limit(1).maybeSingle()
        if (gd) guestDeck = gd as DeckRecord
      }

      // host 自身のデッキ: myDeckRecord を優先し、null なら DB の host_deck を使用
      const hostDeck = (room?.host_deck as DeckRecord | null) ?? null
      const myDeckForGame = myDeckRecord ?? hostDeck

      setCoinFlipState('flipping')
      await new Promise(res => setTimeout(res, 1200))
      const first = Math.random() < 0.5
      setPlayerFirst(first)
      setCoinFlipState('result')
      await new Promise(res => setTimeout(res, 1800))
      startGame(first ? 'my' : 'opp', guestDeck, myDeckForGame)
      return
    }
    if (!difficulty) return
    setCoinFlipState('flipping')
    await new Promise(res => setTimeout(res, 1200))
    const first = Math.random() < 0.5
    setPlayerFirst(first)
    setCoinFlipState('result')
    await new Promise(res => setTimeout(res, 1800))
    startGame(first ? 'my' : 'opp')
  }

  function addLog(g: GameState, text: string) {
    g.log = [text, ...g.log].slice(0, 40)
  }

  function drawCard(from: 'monster' | 'spell') {
    if (!game) return
    if (game.phase !== 'draw') { setMessage('ドローフェイズのみ'); return }
    const g = { ...game }
    const isMyTurn = g.turn === 'my'
    if (isMyTurn && g.skipMyDraw) {
      addLog(g, 'イタズラット効果：ドローをスキップ')
      g.skipMyDraw = false
      g.phase = 'main'
      setGame({ ...g })
      setMessage('')
      return
    }
    const deck = isMyTurn
      ? (from === 'monster' ? g.myMonsterDeck : g.mySpellDeck)
      : (from === 'monster' ? g.oppMonsterDeck : g.oppSpellDeck)
    const hand = isMyTurn ? g.myHand : g.oppHand
    if (deck.length === 0) {
      const otherDeck = isMyTurn
        ? (from === 'monster' ? g.mySpellDeck : g.myMonsterDeck)
        : (from === 'monster' ? g.oppSpellDeck : g.oppMonsterDeck)
      if (otherDeck.length === 0) {
        addLog(g, `${isMyTurn ? '自分' : '相手'}の両デッキが尽きた！敗北`)
        if (isMyTurn) g.myLP = 0; else g.oppLP = 0
        setGame({ ...g })
        return
      }
      setMessage('デッキが空です')
      return
    }
    const card = deck.shift()!
    hand.push(card)
    addLog(g, `${isMyTurn ? '自分' : '相手'}が${from === 'monster' ? 'モンスター' : '魔法/罠'}デッキからドロー`)
    g.phase = 'main'
    if (isMyTurn) {
      const witchOnField = [...g.myFront, ...g.myBack].some(fc => fc?.data.id === 'monster_witch_01' && fc.isAwake)
      if (witchOnField && g.myGrave.length > 0) {
        const eFront = g.myFront.findIndex(c => c === null)
        const eBack = g.myBack.findIndex(c => c === null)
        if ((eFront !== -1 || eBack !== -1) && fieldMonsterCount(g, 'my') < MAX_FIELD_MONSTERS) {
          addLog(g, 'ウィッチ覚醒効果：墓地から特殊召喚できます')
          setGame({ ...g })
          setGraveSelectMode({ owner: 'my', action: 'witch_revive' })
          setShowGrave('my')
          setMessage('')
          return
        }
      }
    }
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
    if (game.phase !== 'main') { setMessage('メインフェイズのみ'); return }
    if (!game.selectedCard) { setMessage('手札を先に選択'); return }
    const g = { ...game }
    const isMyTurn = g.turn === 'my'
    const sel = g.selectedCard!
    const hand = isMyTurn ? g.myHand : g.oppHand
    if (sel.zone !== (isMyTurn ? 'myHand' : 'oppHand')) { setMessage('手札から召喚してください'); return }
    const card = hand[sel.index]
    if (!card || card.type !== 'monster') { setMessage('モンスターのみ召喚可'); return }
    if (card.id === 'monster_lightning_whale_01') { setMessage('通常召喚不可'); return }
    const isMyZone = toZone.startsWith('my')
    if (isMyZone !== isMyTurn) { setMessage('自分のゾーンのみ'); return }
    const zoneArr = [...getZoneArr(g, toZone)]
    if (zoneArr[toIndex] !== null) { setMessage('そのマスは埋まっています'); return }
    if (g.normalSummonDone) { setMessage('通常召喚は1回まで'); return }
    if (fieldMonsterCount(g, isMyTurn ? 'my' : 'opp') >= MAX_FIELD_MONSTERS) { setMessage('フィールドのモンスターは5体までです'); return }
    zoneArr[toIndex] = toField(card)
    setZoneArr(g, toZone, zoneArr)
    hand.splice(sel.index, 1)
    g.normalSummonDone = true
    g.selectedCard = null
    addLog(g, `${isMyTurn ? '自分' : '相手'}が「${card.name}」を召喚`)
    if (card.id === 'monster_witch_01') {
      const spellDeck = isMyTurn ? g.mySpellDeck : g.oppSpellDeck
      const h = isMyTurn ? g.myHand : g.oppHand
      if (spellDeck.length > 0) {
        h.push(spellDeck.shift()!)
        addLog(g, 'ウィッチ効果：魔法/罠デッキから1枚ドロー')
      }
    }
    if (card.id === 'monster_itazuratto_01') {
      if (isMyTurn) { g.skipOppDraw = true } else { g.skipMyDraw = true }
      addLog(g, 'イタズラット効果：相手の次のドローをスキップ')
    }
    setGame({ ...g })
    setMessage('')
  }

  function setSpellCard(toZone: 'mySpellZone' | 'oppSpellZone', toIndex: number) {
    if (!game) return
    if (game.phase !== 'main' && game.phase !== 'main2') { setMessage('メインフェイズのみ'); return }
    if (!game.selectedCard) { setMessage('手札を先に選択'); return }
    const g = { ...game }
    const isMyTurn = g.turn === 'my'
    const sel = g.selectedCard!
    const hand = isMyTurn ? g.myHand : g.oppHand
    if (sel.zone !== (isMyTurn ? 'myHand' : 'oppHand')) { setMessage('手札からセット'); return }
    const card = hand[sel.index]
    if (!card || card.type === 'monster') { setMessage('魔法・トラップのみ'); return }
    const zoneArr = [...getZoneArr(g, toZone)]
    if (zoneArr[toIndex] !== null) { setMessage('そのマスは埋まっています'); return }
    zoneArr[toIndex] = { ...toField(card), justSet: true }
    setZoneArr(g, toZone, zoneArr)
    hand.splice(sel.index, 1)
    g.selectedCard = null
    addLog(g, `${isMyTurn ? '自分' : '相手'}が「${card.name}」をセット`)
    setGame({ ...g })
    setMessage('')
  }

  async function checkOnlineTrap(cardName: string): Promise<boolean> {
    setWaitingForTrapResponse(true)
    channelRef.current?.send({ type: 'broadcast', event: 'action_check', payload: { type: 'spell', cardName } })
    return new Promise(resolve => {
      onlineActionResolveRef.current = (activated: boolean) => {
        setWaitingForTrapResponse(false)
        resolve(activated)
      }
      setTimeout(() => {
        if (onlineActionResolveRef.current) {
          setWaitingForTrapResponse(false)
          onlineActionResolveRef.current(false)
          onlineActionResolveRef.current = null
        }
      }, 8000)
    })
  }

  async function activateSpell(zone: 'mySpellZone' | 'oppSpellZone', index: number) {
    if (!game) return
    if (game.phase !== 'main' && game.phase !== 'battle' && game.phase !== 'main2') { setMessage('メイン/バトルフェイズのみ'); return }
    const g = { ...game }
    const zoneArr = [...getZoneArr(g, zone)]
    const fc = zoneArr[index]
    if (!fc) return
    const card = fc.data
    const owner: 'my' | 'opp' = zone.startsWith('my') ? 'my' : 'opp'
    if (card.type === 'trap' && fc.justSet) { setMessage('セットしたターンには発動できません'); return }
    if (card.id === 'spell_dragon_01') {
      const grave = owner === 'my' ? g.myGrave : g.oppGrave
      const dragonInGrave = grave.filter(gc => gc.data.type === 'monster' && gc.data.name.includes('ドラゴン'))
      if (dragonInGrave.length === 0) { setMessage('墓地にドラゴンがいません'); return }
      if (fieldMonsterCount(g, owner) >= MAX_FIELD_MONSTERS) { setMessage('フィールドのモンスターは5体までです'); return }
    }
    if (card.id === 'trap_kuromajutu_bousou_01') {
      const ownZones = owner === 'my' ? ['myFront', 'myBack'] : ['oppFront', 'oppBack']
      const hasTarget = ownZones.some(z => getZoneArr(g, z).some(c => c?.witchRevived && !c.isAwake))
      if (!hasTarget) { setMessage('ナイトメア・ウィッチで特殊召喚した封印状態のモンスターがいません'); return }
    }
    addLog(g, `「${card.name}」を発動！`)
    showCardReveal(card, owner)
    if (onlineModeRef.current && owner === 'my') {
      channelRef.current?.send({ type: 'broadcast', event: 'card_reveal', payload: { card } })
    }
    zoneArr[index] = null
    setZoneArr(g, zone, zoneArr)
    const grave = owner === 'my' ? g.myGrave : g.oppGrave
    grave.push({ data: card, isAwake: false })

    const REACTIVE_IDS = ['trap_singari_01', 'trap_akumu_daihunka_01', 'trap_tsurara_mahoujin_01', 'spell_daitenshi_kago_01']
    if (onlineModeRef.current && owner === 'my' && !REACTIVE_IDS.includes(card.id)) {
      const countered = await checkOnlineTrap(card.name)
      if (countered) {
        const akumuSlot = g.oppSpellZone.findIndex(fc2 => fc2?.data.id === 'trap_akumu_daihunka_01')
        if (akumuSlot !== -1) {
          const akumuCard = g.oppSpellZone[akumuSlot]!
          const arr2 = [...g.oppSpellZone]; arr2[akumuSlot] = null; g.oppSpellZone = arr2
          g.oppGrave.push({ data: akumuCard.data, isAwake: false })
          const newMyZ = [...g.mySpellZone]
          const newOppZ = [...g.oppSpellZone]
          for (let idx2 = 0; idx2 < 5; idx2++) {
            if (newMyZ[idx2]) { g.myGrave.push({ data: newMyZ[idx2]!.data, isAwake: false }); newMyZ[idx2] = null }
            if (newOppZ[idx2]) { g.oppGrave.push({ data: newOppZ[idx2]!.data, isAwake: false }); newOppZ[idx2] = null }
          }
          g.mySpellZone = newMyZ; g.oppSpellZone = newOppZ
        }
        addLog(g, `「悪夢の大噴火」発動！「${card.name}」を無効化・全魔法罠ゾーン破壊`)
        addMagicCounters(g)
        setGame({ ...g })
        return
      }
    }

    switch (card.id) {
      case 'spell_unicorn_michibiki_01': {
        const mDeck = owner === 'my' ? g.myMonsterDeck : g.oppMonsterDeck
        const sDeck = owner === 'my' ? g.mySpellDeck : g.oppSpellDeck
        const h = owner === 'my' ? g.myHand : g.oppHand
        for (let i = 0; i < 2; i++) {
          if (mDeck.length) h.push(mDeck.shift()!)
          else if (sDeck.length) h.push(sDeck.shift()!)
        }
        addLog(g, 'デッキから2枚ドロー')
        break
      }
      case 'spell_daitenshi_kago_01': {
        setMessage('この効果は相手のターン終了時に発動できます')
        zoneArr[index] = fc; setZoneArr(g, zone, zoneArr); grave.pop(); return
      }
      case 'spell_dinosaur_crash_01': {
        const all: { zone: string; index: number }[] = []
        for (const z of ['myFront','myBack','oppFront','oppBack']) {
          getZoneArr(g, z).forEach((fc, i) => { if (fc && !(fc.data.id === 'warrior_01' && fc.isAwake)) all.push({ zone: z, index: i }) })
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
        g.pendingEffect = { type: 'select_target', action: 'awake_then_destroy_next', sourceZone: zone, sourceIndex: index, message: '覚醒させるモンスターを選択', sourceName: card.name }
        break
      }
      case 'trap_kuromajutu_bousou_01': {
        const ownZones = owner === 'my' ? ['myFront', 'myBack'] as const : ['oppFront', 'oppBack'] as const
        for (const z of ownZones) {
          const arr = [...getZoneArr(g, z)]
          arr.forEach((c, i) => {
            if (c?.witchRevived && !c.isAwake) {
              const forceAwakeBoost = c.data.id === 'monster_chuta_01' ? c.magicCounters * 1000 : 0
              arr[i] = { ...c, isAwake: true, atkMod: c.atkMod + forceAwakeBoost, witchRevived: false }
              g.endPhaseDestroyUids.push({ uid: c.uid, owner, dueAtOwner: owner })
              addLog(g, `黒魔術の暴走：「${c.data.name}」を覚醒させ破壊予約`)
              if (c.data.id === 'monster_healing_cave_01') {
                restoreAtkDef(g, owner)
                addLog(g, '癒しの洞窟の姫：フィールドのATK/DEF低下を全て回復')
              }
            }
          })
          setZoneArr(g, z, arr)
        }
        break
      }
      case 'spell_seiryu_manako_01': {
        g.pendingEffect = { type: 'select_target', action: 'return_to_sealed', sourceZone: zone, sourceIndex: index, message: '封印に戻すモンスターを選択', sourceName: card.name }
        break
      }
      case 'spell_dragon_01': {
        addMagicCounters(g)
        setGame({ ...g })
        setGraveSelectMode({ owner, action: 'dragon_revive' })
        setShowGrave(owner)
        setMessage('墓地のドラゴンを選択して特殊召喚')
        return
      }
      case 'spell_electric_shark_01': {
        const whale = allCards.find(c => c.id === 'monster_lightning_whale_01')
        if (whale && fieldMonsterCount(g, owner) < MAX_FIELD_MONSTERS) {
          const backZone = owner === 'my' ? 'myBack' : 'oppBack'
          const emptyBack = getZoneArr(g, backZone).findIndex(c => c === null)
          if (emptyBack !== -1) {
            const arr = [...getZoneArr(g, backZone)]
            arr[emptyBack] = toField(whale)
            setZoneArr(g, backZone, arr)
            addLog(g, 'キラーホエール特殊召喚')
          }
        }
        break
      }
      case 'spell_jigoku_sinpan_01': {
        const graveToUse = owner === 'my' ? g.myGrave : g.oppGrave
        if (!graveToUse.some(gc => gc.data.type === 'monster')) { addLog(g, '墓地にモンスターなし'); break }
        g.pendingEffect = { type: 'coin_toss', graveIndex: -1, owner }
        addLog(g, '地獄の審判：墓地からカードを選択')
        addMagicCounters(g)
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
          h.push(picked)
          const deck = owner === 'my' ? g.myMonsterDeck : g.oppMonsterDeck
          const idx = deck.findIndex(c => c.id === picked.id)
          if (idx !== -1) deck.splice(idx, 1)
          addLog(g, `「${picked.name}」を手札に加えた`)
        } else {
          addLog(g, '条件を満たすモンスターなし')
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
          h.push(t.fc.data)
          addLog(g, `「${t.fc.data.name}」を手札に戻した`)
        }
        break
      }
      case 'trap_mano_kaiiki_01': {
        for (const z of ['myFront','myBack','oppFront','oppBack']) {
          const arr = [...getZoneArr(g, z)].map(fc => fc ? { ...fc, stance: fc.stance === 'attack' ? 'defense' as const : 'attack' as const } : null)
          setZoneArr(g, z, arr)
        }
        addLog(g, '全モンスターの表示変更')
        break
      }
      case 'trap_tsurara_mahoujin_01': {
        const allAwake = [...getAllFieldCards(g, 'my'), ...getAllFieldCards(g, 'opp')].filter(({ fc }) => fc.isAwake)
        for (const { zone, index } of allAwake) {
          removeFromField(g, zone, index)
        }
        addLog(g, '覚醒中モンスターを全破壊')
        break
      }
      case 'trap_akumu_daihunka_01': {
        setMessage('この効果は相手が魔法・トラップを発動した時のみ使用できます')
        zoneArr[index] = fc; setZoneArr(g, zone, zoneArr); grave.pop(); return
      }
      case 'trap_singari_01': {
        g.pendingEffect = { type: 'select_target', action: 'singari', sourceZone: zone, sourceIndex: index, message: 'しんがりを受けるモンスターを選択' }
        break
      }
    }
    addMagicCounters(g)
    setGame({ ...g })
    setMessage('')
  }

  function awakeMonster(fromZone: 'myBack' | 'oppBack', fromIndex: number) {
    if (!game) return
    if (game.phase !== 'main' && game.phase !== 'main2') { setMessage('メインフェイズのみ'); return }
    const g = { ...game }
    const isMyTurn = g.turn === 'my'
    if (g.awakeDone) { setMessage('覚醒は1回まで'); return }
    const backZone = isMyTurn ? g.myBack : g.oppBack
    if (backZone[fromIndex]?.data.id === 'monster_lightning_whale_01') { setMessage('このカードは覚醒できません'); return }
    const frontZone = isMyTurn ? g.myFront : g.oppFront
    const card = backZone[fromIndex]
    if (!card) { setMessage('カードがありません'); return }
    const emptyFront = frontZone.findIndex(c => c === null)
    if (emptyFront === -1) { setMessage('前列が埋まっています'); return }
    const awakeAtkBoost = card.data.id === 'monster_chuta_01' ? card.magicCounters * 1000 : 0
    frontZone[emptyFront] = { ...card, isAwake: true, atkMod: card.atkMod + awakeAtkBoost }
    backZone[fromIndex] = null
    g.awakeDone = true
    g.selectedCard = null
    addLog(g, `${isMyTurn ? '自分' : '相手'}の「${card.data.name}」が覚醒！`)
    const awakeImg = card.data.img_awake ?? card.data.img_sealed ?? ''
    const awakeName = card.data.name_awake ?? card.data.name
    if (awakeImg) {
      setAwakeDisplay({ name: awakeName, img: awakeImg })
      setTimeout(() => setAwakeDisplay(null), 1200)
    }
    if (card.data.id === 'monster_healing_cave_01') {
      const awakeOwner: 'my' | 'opp' = isMyTurn ? 'my' : 'opp'
      restoreAtkDef(g, awakeOwner)
      addLog(g, '癒しの洞窟の姫：フィールドのATK/DEF低下を全て回復')
    }
    if (card.data.id === 'monster_twin_cats_01') {
      g.pendingEffect = { type: 'select_target', action: 'lock_attack', sourceZone: isMyTurn ? 'myFront' : 'oppFront', sourceIndex: emptyFront, message: '攻撃を封じる相手モンスターを選択' }
      setCatSelectModalOpen(true)
    }
    if (card.data.id === 'monster_witch_01') {
      const witchOwner: 'my' | 'opp' = isMyTurn ? 'my' : 'opp'
      const grave = isMyTurn ? g.myGrave : g.oppGrave
      const eFront = (isMyTurn ? g.myFront : g.oppFront).findIndex(c => c === null)
      const eBack = (isMyTurn ? g.myBack : g.oppBack).findIndex(c => c === null)
      if (grave.length > 0 && (eFront !== -1 || eBack !== -1)) {
        addLog(g, 'ウィッチ覚醒効果：墓地から特殊召喚できます')
        setGame({ ...g })
        setGraveSelectMode({ owner: witchOwner, action: 'witch_revive' })
        setShowGrave(witchOwner)
        setMessage('')
        return
      }
    }
    if (card.data.id === 'monster_itazuratto_01') {
      const targetHand = isMyTurn ? g.oppHand : g.myHand
      if (targetHand.length > 0) {
        addLog(g, 'メカ・イタズラット効果：相手の手札を確認し2枚捨てさせる')
        setGame({ ...g })
        setDiscardHandMode({ selected: [] })
        setMessage('')
        return
      }
    }
    setGame({ ...g })
    setMessage('')
  }

  function toggleStance(zone: 'myFront' | 'myBack' | 'oppFront' | 'oppBack', index: number) {
    if (!game) return
    if (game.phase !== 'main' && game.phase !== 'main2') { setMessage('メインフェイズのみ'); return }
    const g = { ...game }
    const arr = [...getZoneArr(g, zone)]
    const card = arr[index]
    if (!card) return
    if (game.phase === 'main2' && card.hasAttacked && card.stance === 'attack') { setMessage('攻撃したモンスターは守備表示に変更できません'); return }
    arr[index] = { ...card, stance: card.stance === 'attack' ? 'defense' : 'attack' }
    setZoneArr(g, zone, arr)
    addLog(g, `「${card.data.name}」表示変更`)
    setGame({ ...g })
  }

  function attack(atkZone: string, atkIndex: number, defZone: string, defIndex: number) {
    if (!game) return
    if (game.phase !== 'battle') { setMessage('バトルフェイズのみ'); return }
    const g = kumaGameRef.current ?? { ...game }
    kumaGameRef.current = null
    const isMyTurn = g.turn === 'my'
    let triggerFishermanPrompt = false
    const fishermanAutoDestroy = () => {
      const spellIdx = g.mySpellZone.findIndex(fc => fc !== null)
      if (spellIdx !== -1) {
        const card = g.mySpellZone[spellIdx]!
        const arr = [...g.mySpellZone]; arr[spellIdx] = null; g.mySpellZone = arr
        g.myGrave.push({ data: card.data, isAwake: false })
        addLog(g, `釣り人効果：「${card.data.name}」を破壊！`)
      } else { addLog(g, '釣り人効果：対象なし') }
    }
    const atkArr = [...getZoneArr(g, atkZone)]
    const defArr = [...getZoneArr(g, defZone)]
    const attacker = atkArr[atkIndex]
    const defender = defArr[defIndex]
    if (!attacker) { setMessage('攻撃カードなし'); return }
    if (attacker.stance === 'defense') { setMessage('守備表示は攻撃不可'); return }
    if (attacker.hasAttacked && attacker.data.id !== 'monster_kumomaru_01') { setMessage('攻撃済み'); return }
    if (attacker.cantAttack) { setMessage('攻撃不可'); return }
    if (attacker.data.id === 'monster_forest_dragon_01' && !attacker.isAwake) { setMessage('このカードは覚醒前は攻撃できません'); return }
    const isMyCard = atkZone.startsWith('my')
    if (isMyCard !== isMyTurn) { setMessage('自分のカードのみ'); return }
    const atkVal = (attacker.isAwake ? (attacker.data.atk_awake ?? 0) : (attacker.data.atk_sealed ?? 0)) + attacker.atkMod
    const oppMonsters = isMyTurn
      ? [...g.oppFront, ...g.oppBack].filter(Boolean)
      : [...g.myFront, ...g.myBack].filter(Boolean)
    if (!defender && oppMonsters.length > 0) { setMessage('モンスターを先に攻撃'); return }

    // オンライン：しんがりターゲットへの攻撃を強制
    if (onlineModeRef.current && g.singariTargetUid && defender && defender.uid !== g.singariTargetUid) {
      setMessage('しんがり：指定されたモンスターを先に攻撃してください')
      return
    }

    if (attacker.data.id === 'monster_araiguma_01' && attacker.isAwake && isMyCard && !kumaEffectHandledRef.current) {
      const araigumaInDeck = g.myMonsterDeck.filter(c => c.id === 'monster_araiguma_01')
      const emptySlots = [...g.myFront, ...g.myBack].filter(c => c === null).length
      const maxSummon = Math.min(araigumaInDeck.length, emptySlots)
      setKumaAttackModal({ atkZone, atkIndex, defZone, defIndex, availableCount: araigumaInDeck.length, maxSummon })
      return
    }
    kumaEffectHandledRef.current = false

    const atkImg = attacker.isAwake ? (attacker.data.img_awake ?? attacker.data.img_sealed ?? '') : (attacker.data.img_sealed ?? '')
    let battleInfo: typeof battleDisplay = null

    if (!defender) {
      if (isMyTurn) g.oppLP -= atkVal; else g.myLP -= atkVal
      addLog(g, `「${attacker.data.name}」DA！ ${atkVal}ダメージ`)
      battleInfo = {
        atkName: attacker.data.name, atkImg, atkVal,
        defName: null, defImg: null, defVal: 0, defStance: 'attack',
        damage: atkVal, result: 'direct', isPlayerAttack: true
      }
    } else {
      const defImg = defender.isAwake ? (defender.data.img_awake ?? defender.data.img_sealed ?? '') : (defender.data.img_sealed ?? '')
      if (defender.stance === 'attack') {
        const defVal = (defender.isAwake ? (defender.data.atk_awake ?? 0) : (defender.data.atk_sealed ?? 0)) + defender.atkMod
        if (atkVal > defVal) {
          removeFromField(g, defZone, defIndex)
          const diff = atkVal - defVal
          if (isMyTurn) g.oppLP -= diff; else g.myLP -= diff
          addLog(g, `「${attacker.data.name}」→「${defender.data.name}」破壊！ ${diff}ダメージ`)
          if (defender.data.id === 'monster_fisherman_01') fishermanAutoDestroy()
          battleInfo = { atkName: attacker.data.name, atkImg, atkVal, defName: defender.data.name, defImg, defVal, defStance: 'attack', damage: diff, result: 'win', isPlayerAttack: true }
        } else if (atkVal < defVal) {
          removeFromField(g, atkZone, atkIndex)
          const diff = defVal - atkVal
          if (isMyTurn) g.myLP -= diff; else g.oppLP -= diff
          addLog(g, `「${attacker.data.name}」敗北… ${diff}ダメージ`)
          if (attacker.data.id === 'monster_fisherman_01' && g.oppSpellZone.some(fc => fc)) triggerFishermanPrompt = true
          battleInfo = { atkName: attacker.data.name, atkImg, atkVal, defName: defender.data.name, defImg, defVal, defStance: 'attack', damage: diff, result: 'lose', isPlayerAttack: true }
        } else {
          removeFromField(g, atkZone, atkIndex)
          removeFromField(g, defZone, defIndex)
          addLog(g, `「${attacker.data.name}」vs「${defender.data.name}」相打ち`)
          if (attacker.data.id === 'monster_fisherman_01' && g.oppSpellZone.some(fc => fc)) triggerFishermanPrompt = true
          if (defender.data.id === 'monster_fisherman_01') fishermanAutoDestroy()
          battleInfo = { atkName: attacker.data.name, atkImg, atkVal, defName: defender.data.name, defImg, defVal, defStance: 'attack', damage: 0, result: 'draw', isPlayerAttack: true }
        }
      } else {
        const defVal = (defender.isAwake ? (defender.data.def_awake ?? 0) : (defender.data.def_sealed ?? 0)) + defender.defMod
        if (atkVal >= defVal) {
          removeFromField(g, defZone, defIndex)
          addLog(g, `守備「${defender.data.name}」破壊`)
          if (defender.data.id === 'monster_fisherman_01') fishermanAutoDestroy()
          battleInfo = { atkName: attacker.data.name, atkImg, atkVal, defName: defender.data.name, defImg, defVal, defStance: 'defense', damage: 0, result: 'win', isPlayerAttack: true }
        } else {
          const diff = defVal - atkVal
          if (isMyTurn) g.myLP -= diff; else g.oppLP -= diff
          addLog(g, `守備貫通失敗… ${diff}ダメージ`)
          battleInfo = { atkName: attacker.data.name, atkImg, atkVal, defName: defender.data.name, defImg, defVal, defStance: 'defense', damage: diff, result: 'nobreach', isPlayerAttack: true }
        }
      }
    }

    const atkArrAfter = [...getZoneArr(g, atkZone)]
    if (atkArrAfter[atkIndex]) {
      atkArrAfter[atkIndex] = { ...atkArrAfter[atkIndex]!, hasAttacked: true }
      setZoneArr(g, atkZone, atkArrAfter)
    }
    const atkArrFinal = [...getZoneArr(g, atkZone)]
    if (atkArrFinal[atkIndex]?.data.id === 'monster_mechanic_dragon_01' && atkArrFinal[atkIndex]?.isAwake) {
      const atkOwner: 'my' | 'opp' = atkZone.startsWith('my') ? 'my' : 'opp'
      if (!hasPrincess(g, atkOwner)) {
        atkArrFinal[atkIndex] = { ...atkArrFinal[atkIndex]!, atkMod: (atkArrFinal[atkIndex]?.atkMod ?? 0) - 500 }
        setZoneArr(g, atkZone, atkArrFinal)
        addLog(g, 'メカドラゴンATK-500')
      } else {
        addLog(g, '癒しの洞窟の姫：メカドラゴンATK低下を無効')
      }
    }
    // しんがりターゲットが破壊された場合はクリア
    if (g.singariTargetUid) {
      const singariStillOnField = [...g.oppFront, ...g.oppBack, ...g.myFront, ...g.myBack].some(fc => fc?.uid === g.singariTargetUid)
      if (!singariStillOnField) g.singariTargetUid = null
    }
    g.selectedCard = null
    setGame({ ...g })
    setMessage('')
    if (battleInfo) {
      setBattleDisplay(battleInfo)
      setTimeout(() => setBattleDisplay(null), 2000)
      if (onlineModeRef.current) {
        channelRef.current?.send({ type: 'broadcast', event: 'battle_anim', payload: { info: battleInfo } })
      }
    }
    if (triggerFishermanPrompt) setFishermanPrompt(true)
  }

  function confirmKumaAttack(count: number) {
    if (!kumaAttackModal || !game) return
    const g = { ...game }
    for (let i = 0; i < count; i++) {
      if (fieldMonsterCount(g, 'my') >= MAX_FIELD_MONSTERS) break
      const deckIdx = g.myMonsterDeck.findIndex(c => c.id === 'monster_araiguma_01')
      if (deckIdx === -1) break
      const card = g.myMonsterDeck.splice(deckIdx, 1)[0]
      const backArr = [...g.myBack]; const frontArr = [...g.myFront]
      const eBack = backArr.findIndex(c => c === null); const eFront = frontArr.findIndex(c => c === null)
      if (eBack !== -1) { backArr[eBack] = toField(card); g.myBack = backArr }
      else if (eFront !== -1) { frontArr[eFront] = toField(card); g.myFront = frontArr }
      addLog(g, `クマ軍曹効果：「${card.name}」を特殊召喚`)
    }
    const { atkZone, atkIndex, defZone, defIndex } = kumaAttackModal
    setKumaAttackModal(null)
    kumaGameRef.current = g
    kumaEffectHandledRef.current = true
    attack(atkZone, atkIndex, defZone, defIndex)
  }

  function applyOppSpellEffect(g: GameState, card: CardData) {
    switch (card.id) {
      case 'spell_unicorn_michibiki_01': {
        for (let i = 0; i < 2; i++) {
          if (g.oppMonsterDeck.length) g.oppHand.push(g.oppMonsterDeck.shift()!)
          else if (g.oppSpellDeck.length) g.oppHand.push(g.oppSpellDeck.shift()!)
        }
        addLog(g, 'ユニコーンの導き：相手カード2枚ドロー')
        break
      }
      case 'spell_umi_no_kami_01': {
        const waterMonsters = g.oppMonsterDeck.filter(c => c.attribute === '水' && (c.atk_awake ?? 0) >= 2000)
        if (waterMonsters.length > 0) {
          const picked = waterMonsters[Math.floor(Math.random() * waterMonsters.length)]
          const idx = g.oppMonsterDeck.findIndex(c => c.id === picked.id)
          if (idx !== -1) g.oppMonsterDeck.splice(idx, 1)
          g.oppHand.push(picked)
          addLog(g, `海の神の伝説：「${picked.name}」を手札に加えた`)
        } else {
          addLog(g, '海の神の伝説：対象なし')
        }
        break
      }
      case 'spell_electric_shark_01': {
        const whaleInHand = g.oppHand.findIndex(c => c.id === 'monster_lightning_whale_01')
        const whaleInDeck = g.oppMonsterDeck.findIndex(c => c.id === 'monster_lightning_whale_01')
        const emptyBack = g.oppBack.findIndex(c => c === null)
        if (emptyBack !== -1 && fieldMonsterCount(g, 'opp') < MAX_FIELD_MONSTERS) {
          let whale: CardData | null = null
          if (whaleInHand !== -1) { whale = g.oppHand.splice(whaleInHand, 1)[0] }
          else if (whaleInDeck !== -1) { whale = g.oppMonsterDeck.splice(whaleInDeck, 1)[0] }
          if (whale) {
            const arr = [...g.oppBack]; arr[emptyBack] = toField(whale); g.oppBack = arr
            addLog(g, `電気シャチの注意書き：「${whale.name}」特殊召喚`)
          }
        } else { addLog(g, '電気シャチの注意書き：スペースなし') }
        break
      }
      case 'spell_dragon_01': {
        const dragonInGrave = g.oppGrave.filter(gc => gc.data.type === 'monster' && gc.data.name.includes('ドラゴン'))
        if (dragonInGrave.length === 0) { addLog(g, '巨竜の再来：墓地にドラゴンなし'); break }
        if (fieldMonsterCount(g, 'opp') >= MAX_FIELD_MONSTERS) { addLog(g, '巨竜の再来：フィールドにスペースなし'); break }
        {
          const target = dragonInGrave[dragonInGrave.length - 1]
          const emptyBack = g.oppBack.findIndex(c => c === null)
          const emptyFront = g.oppFront.findIndex(c => c === null)
          const emptyZone = emptyBack !== -1 ? 'oppBack' : emptyFront !== -1 ? 'oppFront' : null
          const emptyIndex = emptyBack !== -1 ? emptyBack : emptyFront !== -1 ? emptyFront : -1
          if (emptyZone && emptyIndex !== -1) {
            const arr = [...getZoneArr(g, emptyZone)]
            arr[emptyIndex] = toField(target.data, target.isAwake)
            setZoneArr(g, emptyZone, arr)
            g.oppGrave = g.oppGrave.filter(gc => gc !== target)
            addLog(g, `巨竜の再来：「${target.data.name}」特殊召喚`)
          }
        }
        break
      }
      case 'spell_dinosaur_crash_01': {
        const all: { zone: string; index: number }[] = []
        for (const z of ['myFront','myBack','oppFront','oppBack']) {
          getZoneArr(g, z).forEach((fc, i) => { if (fc && !(fc.data.id === 'warrior_01' && fc.isAwake)) all.push({ zone: z, index: i }) })
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
            addLog(g, `ダイナソークラッシュ：「${destroyed.data.name}」破壊`)
          }
        }
        break
      }
      case 'trap_mano_kaiiki_01': {
        for (const z of ['myFront','myBack','oppFront','oppBack']) {
          const arr = [...getZoneArr(g, z)].map(fc => fc ? { ...fc, stance: fc.stance === 'attack' ? 'defense' as const : 'attack' as const } : null)
          setZoneArr(g, z, arr)
        }
        addLog(g, '魔の海流：全モンスター表示形式変更')
        break
      }
      case 'trap_ootatumaki_01': {
        const all2: { zone: string; index: number; fc: FieldCard }[] = []
        for (const z of ['myFront','myBack','oppFront','oppBack']) {
          getZoneArr(g, z).forEach((fc2, i) => { if (fc2) all2.push({ zone: z, index: i, fc: fc2 }) })
        }
        const targets2 = all2.sort(() => Math.random() - 0.5).slice(0, 2)
        for (const t of targets2) {
          const arr = [...getZoneArr(g, t.zone)]; arr[t.index] = null; setZoneArr(g, t.zone, arr)
          const h = t.zone.startsWith('my') ? g.myHand : g.oppHand
          h.push(t.fc.data)
          addLog(g, `大竜巻：「${t.fc.data.name}」を手札に戻した`)
        }
        break
      }
      case 'spell_jigoku_sinpan_01': {
        const monsters = g.oppGrave
          .map((gc, i) => ({ gc, i }))
          .filter(x => x.gc.data.type === 'monster')
          .sort((a, b) => (b.gc.data.atk_sealed ?? 0) - (a.gc.data.atk_sealed ?? 0))
        if (monsters.length === 0) { addLog(g, '地獄の審判：墓地にモンスターなし'); break }
        const { gc, i } = monsters[0]
        if (Math.random() < 0.5) {
          if (fieldMonsterCount(g, 'opp') < MAX_FIELD_MONSTERS) {
            const emptyBack = g.oppBack.findIndex(c => c === null)
            const emptyFront = g.oppFront.findIndex(c => c === null)
            const targetZone = emptyBack !== -1 ? 'oppBack' : emptyFront !== -1 ? 'oppFront' : null
            const targetIdx = emptyBack !== -1 ? emptyBack : emptyFront
            if (targetZone && targetIdx !== -1) {
              const arr = [...getZoneArr(g, targetZone)]
              arr[targetIdx] = toField(gc.data, gc.isAwake)
              setZoneArr(g, targetZone, arr)
              g.oppGrave = g.oppGrave.filter((_, idx) => idx !== i)
              addLog(g, `地獄の審判：コイン表！「${gc.data.name}」特殊召喚`)
            }
          } else {
            addLog(g, '地獄の審判：コイン表だがフィールドにスペースなし')
          }
        } else {
          g.bannedCards.push(gc.data.id)
          g.oppGrave = g.oppGrave.filter((_, idx) => idx !== i)
          addLog(g, `地獄の審判：コイン裏…「${gc.data.name}」を除外`)
        }
        break
      }
      case 'spell_seiryu_manako_01': {
        const targets = g.myFront
          .map((fc, i) => ({ fc, i }))
          .filter((x): x is { fc: FieldCard; i: number } => !!x.fc?.isAwake)
          .sort((a, b) => (b.fc.data.atk_awake ?? 0) - (a.fc.data.atk_awake ?? 0))
        if (targets.length === 0) { addLog(g, '青龍の眼：対象なし'); break }
        const { fc, i } = targets[0]
        const backArr = [...g.myBack]
        const empty = backArr.findIndex(c => c === null)
        if (empty === -1) { addLog(g, '青龍の眼：スペースなし'); break }
        backArr[empty] = { ...fc, isAwake: false }
        const frontArr = [...g.myFront]; frontArr[i] = null; g.myFront = frontArr
        g.myBack = backArr
        addLog(g, `青龍の眼：「${fc.data.name}」を封印に戻した`)
        break
      }
      case 'spell_mizou_daisaigai_01': {
        const targets = g.myBack
          .map((fc, i) => ({ fc, i }))
          .filter((x): x is { fc: FieldCard; i: number } => !!x.fc && !x.fc.isAwake)
          .sort((a, b) => (b.fc.data.atk_awake ?? 0) - (a.fc.data.atk_awake ?? 0))
        if (targets.length === 0) { addLog(g, '未曾有の大災害：対象なし'); break }
        const { fc, i } = targets[0]
        const arr = [...g.myBack]
        const forceAwakeBoost = fc.data.id === 'monster_chuta_01' ? fc.magicCounters * 1000 : 0
        arr[i] = { ...fc, isAwake: true, atkMod: fc.atkMod + forceAwakeBoost }
        g.myBack = arr
        if (fc.data.id === 'monster_healing_cave_01') {
          restoreAtkDef(g, 'my')
          addLog(g, '癒しの洞窟の姫：フィールドのATK/DEF低下を全て回復')
        }
        g.endPhaseDestroyUids.push({ uid: fc.uid, owner: 'my', dueAtOwner: 'my' })
        addLog(g, `未曾有の大災害：「${fc.data.name}」を覚醒させ破壊予約`)
        break
      }
      case 'trap_kuromajutu_bousou_01': {
        for (const z of ['oppFront', 'oppBack'] as const) {
          const arr = [...getZoneArr(g, z)]
          arr.forEach((c, i) => {
            if (c?.witchRevived && !c.isAwake) {
              const forceAwakeBoost = c.data.id === 'monster_chuta_01' ? c.magicCounters * 1000 : 0
              arr[i] = { ...c, isAwake: true, atkMod: c.atkMod + forceAwakeBoost, witchRevived: false }
              g.endPhaseDestroyUids.push({ uid: c.uid, owner: 'opp', dueAtOwner: 'opp' })
              addLog(g, `黒魔術の暴走：「${c.data.name}」を覚醒させ破壊予約`)
              if (c.data.id === 'monster_healing_cave_01') {
                restoreAtkDef(g, 'opp')
                addLog(g, '癒しの洞窟の姫：フィールドのATK/DEF低下を全て回復')
              }
            }
          })
          setZoneArr(g, z, arr)
        }
        break
      }
      default:
        addLog(g, `相手「${card.name}」発動`)
    }
  }

  async function runOppAI() {
    if (!game) return
    if (game.myLP <= 0 || game.oppLP <= 0) return
    if (aiRunning) return
    setAiRunning(true)
    const g = { ...game }
    const wait = (ms: number) => new Promise(res => setTimeout(res, ms))

    const effAtk = (fc: FieldCard) =>
      (fc.isAwake ? (fc.data.atk_awake ?? 0) : (fc.data.atk_sealed ?? 0)) + fc.atkMod
    const effDef = (fc: FieldCard) =>
      (fc.isAwake ? (fc.data.def_awake ?? 0) : (fc.data.def_sealed ?? 0)) + fc.defMod

    // --- ドロー: イタズラット効果でスキップチェック ---
    if (g.skipOppDraw) {
      addLog(g, 'イタズラット効果：相手のドローをスキップ')
      g.skipOppDraw = false
      setGame({ ...g }); await wait(700)
    } else {
    if (g.oppMonsterDeck.length === 0 && g.oppSpellDeck.length === 0) {
      addLog(g, '相手の両デッキが尽きた！相手の敗北')
      g.oppLP = 0
      setGame({ ...g })
      setAiRunning(false)
      return
    }
    const handMonCount = g.oppHand.filter(c => c.type === 'monster').length
    if (handMonCount < 2 && g.oppMonsterDeck.length > 0) {
      g.oppHand.push(g.oppMonsterDeck.shift()!)
      addLog(g, '相手モンスタードロー')
    } else if (g.oppSpellDeck.length > 0) {
      g.oppHand.push(g.oppSpellDeck.shift()!)
      addLog(g, '相手魔法/罠ドロー')
    } else if (g.oppMonsterDeck.length > 0) {
      g.oppHand.push(g.oppMonsterDeck.shift()!)
      addLog(g, '相手モンスタードロー')
    }
    setGame({ ...g }); await wait(700)
    // AI ウィッチ覚醒効果
    const oppWitchAwake = [...g.oppFront, ...g.oppBack].some(fc => fc?.data.id === 'monster_witch_01' && fc.isAwake)
    if (oppWitchAwake) {
      const graveMonsters = g.oppGrave
        .map((gc, i) => ({ gc, i }))
        .filter(x => x.gc.data.type === 'monster')
        .sort((a, b) => (b.gc.data.atk_sealed ?? 0) - (a.gc.data.atk_sealed ?? 0))
      const emptySlots = Math.min([...g.oppBack, ...g.oppFront].filter(c => c === null).length, MAX_FIELD_MONSTERS - fieldMonsterCount(g, 'opp'))
      const toRevive = graveMonsters.slice(0, emptySlots)
      if (toRevive.length > 0) {
        const removeIndices = new Set(toRevive.map(x => x.i))
        for (const { gc } of toRevive) {
          const eBack = g.oppBack.findIndex(c => c === null)
          const eFront = g.oppFront.findIndex(c => c === null)
          if (eBack !== -1) { const a = [...g.oppBack]; a[eBack] = { ...toField(gc.data, false), witchRevived: true }; g.oppBack = a }
          else if (eFront !== -1) { const a = [...g.oppFront]; a[eFront] = { ...toField(gc.data, false), witchRevived: true }; g.oppFront = a }
          addLog(g, `ウィッチ覚醒効果：「${gc.data.name}」特殊召喚（ターン終了時に墓地へ）`)
        }
        g.oppGrave = g.oppGrave.filter((_, i) => !removeIndices.has(i))
        setGame({ ...g }); await wait(700)
      }
    }
    } // end skipOppDraw else

    // --- 召喚: 封印ATK最大のモンスターを選択 ---
    if (!g.normalSummonDone) {
      const emptyBack = g.oppBack.findIndex(c => c === null)
      const candidates = g.oppHand
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => c.type === 'monster' && c.id !== 'monster_lightning_whale_01')
        .sort((a, b) => (b.c.atk_sealed ?? 0) - (a.c.atk_sealed ?? 0))
      if (candidates.length > 0 && emptyBack !== -1 && fieldMonsterCount(g, 'opp') < MAX_FIELD_MONSTERS) {
        const { c, i } = candidates[0]
        const arr = [...g.oppBack]; arr[emptyBack] = toField(c); g.oppBack = arr
        g.oppHand.splice(i, 1)
        g.normalSummonDone = true
        addLog(g, `相手「${c.name}」召喚`)
        if (c.id === 'monster_witch_01' && g.oppSpellDeck.length > 0) {
          g.oppHand.push(g.oppSpellDeck.shift()!)
          addLog(g, 'ウィッチ効果：魔法/罠ドロー')
        }
        if (c.id === 'monster_itazuratto_01') {
          g.skipMyDraw = true
          addLog(g, 'イタズラット効果：相手の次のドローをスキップ')
        }
        // 召喚後の守備表示判断
        {
          const arr = [...g.oppBack]
          const newMon = arr[emptyBack]
          if (newMon && !newMon.isAwake) {
            const atk = newMon.data.atk_sealed ?? 0
            const def = newMon.data.def_sealed ?? 0
            const myMaxAtk = Math.max(0, ...[...g.myFront, ...g.myBack].filter(Boolean).map(fc => effAtk(fc!)))
            const shouldDefend = difficulty === 'easy'
              ? def > atk
              : def > atk || (atk < myMaxAtk && def >= myMaxAtk * 0.7)
            if (shouldDefend) {
              arr[emptyBack] = { ...newMon, stance: 'defense' }
              g.oppBack = arr
              addLog(g, `相手「${c.name}」守備表示`)
            }
          }
        }
        setGame({ ...g }); await wait(700)
      }
    }

    // --- 守備表示切替: 後列の弱いモンスターを守備にする ---
    {
      const myMaxAtk = Math.max(0, ...[...g.myFront, ...g.myBack].filter(Boolean).map(fc => effAtk(fc!)))
      const arr = [...g.oppBack]
      let stanceChanged = false
      arr.forEach((fc, i) => {
        if (!fc || fc.isAwake) return
        const atk = fc.data.atk_sealed ?? 0
        const def = fc.data.def_sealed ?? 0
        if (fc.stance === 'attack') {
          const shouldDefend = difficulty === 'easy'
            ? def > atk
            : def > atk || (atk < myMaxAtk && def >= myMaxAtk * 0.7)
          if (shouldDefend) { arr[i] = { ...fc, stance: 'defense' }; stanceChanged = true }
        } else if (fc.stance === 'defense') {
          // ATKで勝てるなら攻撃表示に戻す（normal/hard）
          if (difficulty !== 'easy' && atk > myMaxAtk) {
            arr[i] = { ...fc, stance: 'attack' }; stanceChanged = true
          }
        }
      })
      if (stanceChanged) {
        g.oppBack = arr
        addLog(g, '相手がモンスターの表示形式を変更')
        setGame({ ...g }); await wait(400)
      }
    }

    // --- 覚醒: 覚醒ATK最大の後列モンスターを選択 ---
    if (!g.awakeDone && !(difficulty === 'easy' && Math.random() < 0.45)) {
      const frontIdx = g.oppFront.findIndex(c => c === null)
      const backCandidates = g.oppBack
        .map((fc, i) => ({ fc, i }))
        .filter((x): x is { fc: FieldCard; i: number } => x.fc !== null)
        .sort((a, b) => (b.fc.data.atk_awake ?? 0) - (a.fc.data.atk_awake ?? 0))
      if (backCandidates.length > 0 && frontIdx !== -1) {
        const { fc, i } = backCandidates[0]
        const newBack = [...g.oppBack]; newBack[i] = null
        const newFront = [...g.oppFront]
        const oppAwakeBoost = fc.data.id === 'monster_chuta_01' ? fc.magicCounters * 1000 : 0
        newFront[frontIdx] = { ...fc, isAwake: true, atkMod: fc.atkMod + oppAwakeBoost }
        g.oppBack = newBack; g.oppFront = newFront
        g.awakeDone = true
        addLog(g, `相手「${fc.data.name}」覚醒！`)
        if (fc.data.id === 'monster_healing_cave_01') {
          restoreAtkDef(g, 'opp')
          addLog(g, '癒しの洞窟の姫：フィールドのATK/DEF低下を全て回復')
        }
        if (fc.data.id === 'monster_itazuratto_01' && g.myHand.length > 0) {
          const sorted = [...g.myHand].map((c, idx) => ({ c, idx })).sort((a, b) => (b.c.atk_sealed ?? 0) - (a.c.atk_sealed ?? 0))
          const toDiscard = sorted.slice(0, Math.min(2, g.myHand.length)).map(x => x.idx).sort((a, b) => b - a)
          for (const idx of toDiscard) {
            addLog(g, `メカ・イタズラット効果：「${g.myHand[idx].name}」を捨てさせた`)
            g.myGrave.push({ data: g.myHand[idx], isAwake: false })
            g.myHand.splice(idx, 1)
          }
        }
        setGame({ ...g }); await wait(700)
      }
    }

    // --- 魔法・罠発動: 手札から1枚発動（リアクティブトラップを除く） ---
    if (difficulty === 'easy' && Math.random() < 0.5) {
      // easy: 50%の確率でスペル発動をスキップ
    } else
    {
      const REACTIVE = ['trap_singari_01','trap_akumu_daihunka_01','trap_tsurara_mahoujin_01','spell_daitenshi_kago_01']
      const spellInHand = g.oppHand
        .map((c, i) => ({ c, i }))
        .filter(({ c }) => (c.type === 'spell' || c.type === 'trap') && !REACTIVE.includes(c.id))
      if (spellInHand.length > 0) {
        const PRIO = ['spell_unicorn_michibiki_01','spell_umi_no_kami_01','spell_electric_shark_01','spell_dragon_01']
        const preferred = spellInHand.find(x => PRIO.includes(x.c.id)) ?? spellInHand[0]
        const { c: spellCard, i: spellIdx } = preferred

        addLog(g, `相手「${spellCard.name}」発動！`)
        showCardReveal(spellCard, 'opp')
        setGame({ ...g })
        await wait(400)

        // 悪夢の大噴火チェック
        const akumuSlot = g.mySpellZone.findIndex(fc => fc?.data.id === 'trap_akumu_daihunka_01')
        let negated = false
        if (akumuSlot !== -1) {
          const countered = await new Promise<boolean>(resolve => {
            trapResolveRef.current = resolve
            setTrapPrompt({
              cardName: '悪夢の大噴火',
              cardEffect: '発動した効果を無効化し、相手と自分の魔法・トラップゾーンのカードを全て破壊する。',
              triggeredBy: spellCard.name,
            })
          })
          if (countered) {
            negated = true
            const akumuCard = g.mySpellZone[akumuSlot]!
            const myZ = [...g.mySpellZone]; myZ[akumuSlot] = null; g.mySpellZone = myZ
            g.myGrave.push({ data: akumuCard.data, isAwake: false })
            // 両者の魔法・罠ゾーン全破壊
            const newMyZ = [...g.mySpellZone]
            const newOppZ = [...g.oppSpellZone]
            for (let idx = 0; idx < 5; idx++) {
              if (newMyZ[idx]) { g.myGrave.push({ data: newMyZ[idx]!.data, isAwake: false }); newMyZ[idx] = null }
              if (newOppZ[idx]) { g.oppGrave.push({ data: newOppZ[idx]!.data, isAwake: false }); newOppZ[idx] = null }
            }
            g.mySpellZone = newMyZ; g.oppSpellZone = newOppZ
            // 発動を無効化（手札から墓地へ）
            g.oppHand.splice(spellIdx, 1)
            g.oppGrave.push({ data: spellCard, isAwake: false })
            addLog(g, `「悪夢の大噴火」発動！「${spellCard.name}」を無効化・全魔法罠ゾーン破壊`)
            addMagicCounters(g)
            setGame({ ...g })
            await wait(700)
          }
        }
        if (!negated) {
          g.oppHand.splice(spellIdx, 1)
          g.oppGrave.push({ data: spellCard, isAwake: false })
          applyOppSpellEffect(g, spellCard)
          addMagicCounters(g)
          setGame({ ...g })
          await wait(700)
        }
      }
    }

    // --- バトル: 勝てる戦闘のみ実行、最大脅威を優先 ---
    if (!g.isFirstTurn) {
      const getMyMonsters = () => [
        ...g.myFront.map((fc, i) => fc ? { fc, zone: 'myFront', index: i } : null),
        ...g.myBack.map((fc, i) => fc ? { fc, zone: 'myBack', index: i } : null),
      ].filter(Boolean) as { fc: FieldCard; zone: string; index: number }[]

      const getReadyAttackers = () => [
        ...g.oppFront.map((fc, i) => fc ? { fc, zone: 'oppFront', index: i } : null),
        ...g.oppBack.map((fc, i) => fc ? { fc, zone: 'oppBack', index: i } : null),
      ].filter(Boolean)
        .filter((x): x is { fc: FieldCard; zone: string; index: number } => {
          if (!x) return false
          const fc = getZoneArr(g, x.zone)[x.index]
          return !!fc && !fc.hasAttacked && !fc.cantAttack
            && fc.stance === 'attack' && !(fc.data.id === 'monster_forest_dragon_01' && !fc.isAwake)
        })
        .sort((a, b) => effAtk(b.fc) - effAtk(a.fc))

      // しんがり発動チェック（攻撃前）
      let singariUid: string | null = null
      const singariSlot = g.mySpellZone.findIndex(fc => fc?.data.id === 'trap_singari_01')
      if (singariSlot !== -1 && getReadyAttackers().length > 0 && getMyMonsters().length > 0) {
        const activate = await new Promise<boolean>(resolve => {
          trapResolveRef.current = resolve
          setTrapPrompt({ cardName: 'しんがり', cardEffect: 'このバトルフェイズでの攻撃は全て選択したモンスターが受ける。選択したモンスターが破壊された場合、このターンのバトルフェイズを強制終了する。' })
        })
        if (activate) {
          const singariCard = g.mySpellZone[singariSlot]!
          const arr = [...g.mySpellZone]; arr[singariSlot] = null; g.mySpellZone = arr
          g.myGrave.push({ data: singariCard.data, isAwake: false })
          addLog(g, '「しんがり」発動！')
          setGame({ ...g })
          const targetUid = await new Promise<string | null>(resolve => {
            singariTargetResolveRef.current = resolve
            setSingariTargetMode(true)
          })
          if (targetUid) {
            singariUid = targetUid
            const sMonster = [...g.myFront, ...g.myBack].find(fc => fc?.uid === targetUid)
            if (sMonster) addLog(g, `しんがり：「${sMonster.data.name}」が全攻撃を受ける`)
            setGame({ ...g })
          }
        }
      }

      let madeMove = true
      let singariForceEnd = false
      let myFishermanDestroyed = false
      const checkFishermanEffect = async () => {
        if (!myFishermanDestroyed || !g.oppSpellZone.some(fc => fc)) { myFishermanDestroyed = false; return }
        myFishermanDestroyed = false
        const activate = await new Promise<boolean>(resolve => {
          fishermanResolveRef.current = resolve
          setFishermanPrompt(true)
        })
        if (activate) {
          await new Promise<void>(resolve => {
            fishermanTargetResolveRef.current = resolve
            setFishermanTargetMode(true)
          })
        }
      }
      while (madeMove && !singariForceEnd) {
        if (g.myLP <= 0 || g.oppLP <= 0) break
        madeMove = false

        for (const { zone, index } of getReadyAttackers()) {
          const atkFc = getZoneArr(g, zone)[index]
          if (!atkFc || atkFc.hasAttacked) continue
          const atkVal = effAtk(atkFc)
          const myMonsters = getMyMonsters()

          const atkImg = atkFc.isAwake ? (atkFc.data.img_awake ?? atkFc.data.img_sealed ?? '') : (atkFc.data.img_sealed ?? '')

          // クマ軍曹：攻撃宣言時にデッキのアライグマ戦士を全て特殊召喚
          if (atkFc.data.id === 'monster_araiguma_01' && atkFc.isAwake) {
            let summoned = false
            while (true) {
              if (fieldMonsterCount(g, 'opp') >= MAX_FIELD_MONSTERS) break
              const deckIdx = g.oppMonsterDeck.findIndex(c => c.id === 'monster_araiguma_01')
              if (deckIdx === -1) break
              const eBack = [...g.oppBack].findIndex(c => c === null)
              const eFront = [...g.oppFront].findIndex(c => c === null)
              if (eBack === -1 && eFront === -1) break
              const card = g.oppMonsterDeck.splice(deckIdx, 1)[0]
              if (eBack !== -1) { const a = [...g.oppBack]; a[eBack] = toField(card); g.oppBack = a }
              else { const a = [...g.oppFront]; a[eFront] = toField(card); g.oppFront = a }
              addLog(g, `クマ軍曹効果：「${card.name}」を特殊召喚`)
              summoned = true
            }
            if (summoned) { setGame({ ...g }); await wait(500) }
          }

          // しんがりアクティブ：攻撃先を固定
          if (singariUid) {
            let sZone: string | null = null; let sIdx = -1
            for (const z of ['myFront', 'myBack']) {
              const idx = (getZoneArr(g, z) as (FieldCard | null)[]).findIndex(fc => fc?.uid === singariUid)
              if (idx !== -1) { sZone = z; sIdx = idx; break }
            }
            if (!sZone || sIdx === -1) { singariForceEnd = true; break }
            const sTgt = (getZoneArr(g, sZone) as (FieldCard | null)[])[sIdx]!
            const sDefImg = sTgt.isAwake ? (sTgt.data.img_awake ?? sTgt.data.img_sealed ?? '') : (sTgt.data.img_sealed ?? '')
            const canWin = sTgt.stance === 'attack' ? atkVal > effAtk(sTgt) : atkVal >= effDef(sTgt)
            if (!canWin) continue
            addLog(g, `相手「${atkFc.data.name}」攻撃！（しんがり）`)
            let siBattleInfo: NonNullable<typeof battleDisplay>
            if (sTgt.stance === 'attack') {
              const defVal = effAtk(sTgt)
              removeFromField(g, sZone, sIdx)
              const diff = atkVal - defVal
              addLog(g, `「${atkFc.data.name}」→「${sTgt.data.name}」破壊！バトルフェイズ強制終了` + (diff > 0 ? ` ${diff}ダメージ` : ''))
              if (diff > 0) g.myLP -= diff
              siBattleInfo = { atkName: atkFc.data.name, atkImg, atkVal, defName: sTgt.data.name, defImg: sDefImg, defVal, defStance: 'attack', damage: diff, result: 'win', isPlayerAttack: false }
            } else {
              const defVal = effDef(sTgt)
              removeFromField(g, sZone, sIdx)
              addLog(g, `守備「${sTgt.data.name}」破壊（しんがり）バトルフェイズ強制終了`)
              siBattleInfo = { atkName: atkFc.data.name, atkImg, atkVal, defName: sTgt.data.name, defImg: sDefImg, defVal, defStance: 'defense', damage: 0, result: 'win', isPlayerAttack: false }
            }
            singariForceEnd = true
            if (sTgt.data.id === 'monster_fisherman_01') myFishermanDestroyed = true
            const sa = [...getZoneArr(g, zone)]; if (sa[index]) sa[index] = { ...sa[index]!, hasAttacked: true }
            setZoneArr(g, zone, sa)
            if (atkFc.data.id === 'monster_mechanic_dragon_01' && atkFc.isAwake) {
              if (!hasPrincess(g, 'opp')) {
                const mArr = [...getZoneArr(g, zone)]; if (mArr[index]) { mArr[index] = { ...mArr[index]!, atkMod: (mArr[index]?.atkMod ?? 0) - 500 }; setZoneArr(g, zone, mArr) }
                addLog(g, 'メカドラゴンATK-500')
              } else { addLog(g, '癒しの洞窟の姫：メカドラゴンATK低下を無効') }
            }
            setGame({ ...g })
            setBattleDisplay(siBattleInfo)
            await wait(2000)
            setBattleDisplay(null)
            await wait(200)
            await checkFishermanEffect()
            madeMove = true
            break
          }

          if (myMonsters.length === 0) {
            // ダイレクトアタック
            g.myLP -= atkVal
            addLog(g, `相手「${atkFc.data.name}」DA！ ${atkVal}ダメージ`)
            const a = [...getZoneArr(g, zone)]; if (a[index]) a[index] = { ...a[index]!, hasAttacked: true }
            setZoneArr(g, zone, a)
            if (atkFc.data.id === 'monster_mechanic_dragon_01' && atkFc.isAwake) {
              if (!hasPrincess(g, 'opp')) {
                const mArr = [...getZoneArr(g, zone)]; if (mArr[index]) { mArr[index] = { ...mArr[index]!, atkMod: (mArr[index]?.atkMod ?? 0) - 500 }; setZoneArr(g, zone, mArr) }
                addLog(g, 'メカドラゴンATK-500')
              } else { addLog(g, '癒しの洞窟の姫：メカドラゴンATK低下を無効') }
            }
            setGame({ ...g })
            setBattleDisplay({ atkName: atkFc.data.name, atkImg, atkVal, defName: null, defImg: null, defVal: 0, defStance: 'attack', damage: atkVal, result: 'direct', isPlayerAttack: false })
            await wait(2000)
            setBattleDisplay(null)
            await wait(200)
            madeMove = true
            break
          }

          // 勝てる相手を探してスコア最大を選ぶ（スコア = 相手ATK + 与えるダメージ）
          let bestTarget: { zone: string; index: number; score: number } | null = null
          for (const tgt of myMonsters) {
            let score: number | null = null
            if (tgt.fc.stance === 'attack') {
              const defVal = effAtk(tgt.fc)
              if (atkVal > defVal) score = defVal + (atkVal - defVal)
            } else {
              const defVal = effDef(tgt.fc)
              if (atkVal >= defVal) score = defVal
            }
            if (score !== null && (bestTarget === null || score > bestTarget.score))
              bestTarget = { zone: tgt.zone, index: tgt.index, score }
          }

          // hard: 相打ち（同値）でも攻撃する
          if (!bestTarget && difficulty === 'hard') {
            for (const tgt of myMonsters) {
              if (tgt.fc.stance === 'attack') {
                const defVal = effAtk(tgt.fc)
                if (atkVal === defVal && (bestTarget === null || defVal > bestTarget.score))
                  bestTarget = { zone: tgt.zone, index: tgt.index, score: defVal }
              }
            }
          }
          if (!bestTarget) continue // 勝てる相手なし → このカードは攻撃しない

          const defender = getZoneArr(g, bestTarget.zone)[bestTarget.index]
          if (!defender) continue

          const defImg = defender.isAwake ? (defender.data.img_awake ?? defender.data.img_sealed ?? '') : (defender.data.img_sealed ?? '')
          addLog(g, `相手「${atkFc.data.name}」攻撃！`)
          let aiBattleInfo: NonNullable<typeof battleDisplay>
          if (defender.stance === 'attack') {
            const defVal = effAtk(defender)
            if (atkVal > defVal) {
              removeFromField(g, bestTarget.zone, bestTarget.index)
              const diff = atkVal - defVal
              if (diff > 0) g.myLP -= diff
              if (defender.data.id === 'monster_fisherman_01') myFishermanDestroyed = true
              addLog(g, `「${atkFc.data.name}」→「${defender.data.name}」破壊！` + (diff > 0 ? ` ${diff}ダメージ` : ''))
              aiBattleInfo = { atkName: atkFc.data.name, atkImg, atkVal, defName: defender.data.name, defImg, defVal, defStance: 'attack', damage: diff, result: 'win', isPlayerAttack: false }
            } else if (atkVal < defVal) {
              removeFromField(g, zone, index)
              const diff = defVal - atkVal
              g.oppLP -= diff
              addLog(g, `「${atkFc.data.name}」敗北… ${diff}ダメージ`)
              aiBattleInfo = { atkName: atkFc.data.name, atkImg, atkVal, defName: defender.data.name, defImg, defVal, defStance: 'attack', damage: diff, result: 'lose', isPlayerAttack: false }
            } else {
              removeFromField(g, zone, index)
              removeFromField(g, bestTarget.zone, bestTarget.index)
              if (defender.data.id === 'monster_fisherman_01') myFishermanDestroyed = true
              addLog(g, `「${atkFc.data.name}」vs「${defender.data.name}」相打ち`)
              aiBattleInfo = { atkName: atkFc.data.name, atkImg, atkVal, defName: defender.data.name, defImg, defVal, defStance: 'attack', damage: 0, result: 'draw', isPlayerAttack: false }
            }
          } else {
            const defVal = effDef(defender)
            if (atkVal >= defVal) {
              removeFromField(g, bestTarget.zone, bestTarget.index)
              addLog(g, `守備「${defender.data.name}」破壊`)
              if (defender.data.id === 'monster_fisherman_01') myFishermanDestroyed = true
              aiBattleInfo = { atkName: atkFc.data.name, atkImg, atkVal, defName: defender.data.name, defImg, defVal, defStance: 'defense', damage: 0, result: 'win', isPlayerAttack: false }
            } else {
              const diff = defVal - atkVal
              g.oppLP -= diff
              addLog(g, `守備貫通失敗… ${diff}ダメージ（CPU）`)
              aiBattleInfo = { atkName: atkFc.data.name, atkImg, atkVal, defName: defender.data.name, defImg, defVal, defStance: 'defense', damage: diff, result: 'nobreach', isPlayerAttack: false }
            }
          }
          const a = [...getZoneArr(g, zone)]; if (a[index]) a[index] = { ...a[index]!, hasAttacked: true }
          setZoneArr(g, zone, a)
          if (atkFc.data.id === 'monster_mechanic_dragon_01' && atkFc.isAwake) {
            if (!hasPrincess(g, 'opp')) {
              const mArr = [...getZoneArr(g, zone)]; if (mArr[index]) { mArr[index] = { ...mArr[index]!, atkMod: (mArr[index]?.atkMod ?? 0) - 500 }; setZoneArr(g, zone, mArr) }
              addLog(g, 'メカドラゴンATK-500')
            } else { addLog(g, '癒しの洞窟の姫：メカドラゴンATK低下を無効') }
          }
          setGame({ ...g })
          setBattleDisplay(aiBattleInfo)
          await wait(2000)
          setBattleDisplay(null)
          await wait(200)
          await checkFishermanEffect()
          madeMove = true
          break // ターゲット状況が変わるのでループ再評価
        }
      }
    }

    for (const { fc } of getAllFieldCards(g, 'opp')) {
      if (fc.data.id === 'monster_healing_cave_01') {
        g.oppLP += 500
        addLog(g, '癒しの洞窟：相手500LP回復')
      }
    }
    for (const z of ['oppFront', 'oppBack'] as const) {
      const arr = [...getZoneArr(g, z)]
      arr.forEach((fc, i) => {
        if (fc?.data.id === 'monster_kumomaru_01' && fc.isAwake) {
          if (hasPrincess(g, 'opp')) {
            addLog(g, '癒しの洞窟の姫：雲丸ATK低下を無効')
          } else {
            arr[i] = { ...fc, atkMod: fc.atkMod - 500 }
            addLog(g, '雲丸ATK-500')
          }
        }
      })
      setZoneArr(g, z, arr)
    }
    for (const z of ['oppFront', 'oppBack'] as const) {
      const arr = [...getZoneArr(g, z)]
      let changed = false
      arr.forEach((fc, i) => {
        if (fc?.witchRevived) {
          addLog(g, `「${fc.data.name}」ウィッチ効果終了→墓地へ`)
          g.oppGrave.push({ data: fc.data, isAwake: false })
          arr[i] = null; changed = true
        }
      })
      if (changed) setZoneArr(g, z, arr)
    }
    for (const { uid: targetUid, owner, dueAtOwner } of g.endPhaseDestroyUids) {
      if (dueAtOwner !== 'opp') continue
      for (const z of ['Front', 'Back']) {
        const zone = `${owner}${z}`
        const arr = [...getZoneArr(g, zone)]
        const idx = arr.findIndex(fc => fc?.uid === targetUid)
        if (idx !== -1) { removeFromField(g, zone, idx); addLog(g, '大災害：予約破壊') }
      }
    }
    g.endPhaseDestroyUids = g.endPhaseDestroyUids.filter(x => x.dueAtOwner !== 'opp')
    g.mySpellZone = g.mySpellZone.map(fc => fc ? { ...fc, justSet: false } : null)
    g.oppSpellZone = g.oppSpellZone.map(fc => fc ? { ...fc, justSet: false } : null)

    // 大天使の加護チェック（自分の罠、相手ターン終了時）
    {
      const kagoSlot = g.mySpellZone.findIndex(fc => fc?.data.id === 'spell_daitenshi_kago_01')
      const dmg = Math.max(0, g.myLPAtTurnStart - g.myLP)
      if (kagoSlot !== -1 && dmg > 0) {
        const activate = await new Promise<boolean>(resolve => {
          trapResolveRef.current = resolve
          setTrapPrompt({
            cardName: '大天使の加護',
            cardEffect: '相手のターン終了時に発動できる。このターンに受けたダメージを全て回復する。',
          })
        })
        if (activate) {
          const kagoCard = g.mySpellZone[kagoSlot]!
          const arr = [...g.mySpellZone]; arr[kagoSlot] = null; g.mySpellZone = arr
          g.myGrave.push({ data: kagoCard.data, isAwake: false })
          g.myLP += dmg
          addLog(g, `「大天使の加護」発動！${dmg}LP回復`)
          setGame({ ...g })
          await wait(700)
        }
      }
    }
    g.oppLPAtTurnStart = g.oppLP

    const resetAttack = (arr: (FieldCard | null)[]) => arr.map(c => c ? { ...c, hasAttacked: false } : null)
    g.myFront = resetAttack(g.myFront); g.myBack = resetAttack(g.myBack)
    g.oppFront = resetAttack(g.oppFront); g.oppBack = resetAttack(g.oppBack)
    g.turn = 'my'; g.phase = 'draw'
    g.normalSummonDone = false; g.awakeDone = false; g.selectedCard = null; g.isFirstTurn = false
    g.singariTargetUid = null
    addLog(g, '--- 自分のターン開始 ---')
    setGame({ ...g })
    setMessage('')
    setAiRunning(false)
  }

  function nextPhase() {
    if (!game) return
    const g = { ...game }
    const endTurn = () => {
      for (const owner of ['my', 'opp'] as const) {
        for (const { fc } of getAllFieldCards(g, owner)) {
          if (fc.data.id === 'monster_healing_cave_01') {
            if (owner === 'my') g.myLP += 500; else g.oppLP += 500
            addLog(g, '癒しの洞窟：500LP回復')
          }
        }
      }
      for (const z of ['myFront', 'myBack'] as const) {
        const arr = [...getZoneArr(g, z)]
        arr.forEach((fc, i) => {
          if (fc?.data.id === 'monster_kumomaru_01' && fc.isAwake) {
            if (hasPrincess(g, 'my')) {
              addLog(g, '癒しの洞窟の姫：雲丸ATK低下を無効')
            } else {
              arr[i] = { ...fc, atkMod: fc.atkMod - 500 }
              addLog(g, '雲丸ATK-500')
            }
          }
        })
        setZoneArr(g, z, arr)
      }
      for (const { uid: targetUid, owner, dueAtOwner } of g.endPhaseDestroyUids) {
        if (dueAtOwner !== 'my') continue
        for (const z of ['Front', 'Back']) {
          const zone = `${owner}${z}`
          const arr = [...getZoneArr(g, zone)]
          const idx = arr.findIndex(fc => fc?.uid === targetUid)
          if (idx !== -1) { removeFromField(g, zone, idx); addLog(g, '大災害：予約破壊') }
        }
      }
      g.endPhaseDestroyUids = g.endPhaseDestroyUids.filter(x => x.dueAtOwner !== 'my')
      g.mySpellZone = g.mySpellZone.map(fc => fc ? { ...fc, justSet: false } : null)
      g.oppSpellZone = g.oppSpellZone.map(fc => fc ? { ...fc, justSet: false } : null)
      const witchZones = g.turn === 'my' ? ['myFront', 'myBack'] : ['oppFront', 'oppBack']
      for (const z of witchZones) {
        const arr = [...getZoneArr(g, z)]
        let changed = false
        arr.forEach((fc, i) => {
          if (fc?.witchRevived) {
            addLog(g, `「${fc.data.name}」ウィッチ効果終了→墓地へ`)
            if (z.startsWith('my')) g.myGrave.push({ data: fc.data, isAwake: false })
            else g.oppGrave.push({ data: fc.data, isAwake: false })
            arr[i] = null; changed = true
          }
        })
        if (changed) setZoneArr(g, z, arr)
      }
      // 大天使の加護チェック（相手の罠、自分のターン終了時・CPU自動発動）
      {
        const kagoSlot = g.oppSpellZone.findIndex(fc => fc?.data.id === 'spell_daitenshi_kago_01')
        const dmg = Math.max(0, g.oppLPAtTurnStart - g.oppLP)
        if (kagoSlot !== -1 && dmg > 0) {
          const kagoCard = g.oppSpellZone[kagoSlot]!
          const arr = [...g.oppSpellZone]; arr[kagoSlot] = null; g.oppSpellZone = arr
          g.oppGrave.push({ data: kagoCard.data, isAwake: false })
          g.oppLP += dmg
          addLog(g, `相手「大天使の加護」発動！${dmg}LP回復`)
        }
      }
      g.myLPAtTurnStart = g.myLP

      const next = g.turn === 'my' ? 'opp' : 'my'
      const resetAttack = (arr: (FieldCard | null)[]) => arr.map(c => c ? { ...c, hasAttacked: false } : null)
      g.myFront = resetAttack(g.myFront); g.myBack = resetAttack(g.myBack)
      g.oppFront = resetAttack(g.oppFront); g.oppBack = resetAttack(g.oppBack)
      g.turn = next; g.phase = 'draw'
      g.normalSummonDone = false; g.awakeDone = false; g.selectedCard = null; g.isFirstTurn = false
      g.singariTargetUid = null
      addLog(g, `--- ${next === 'my' ? '自分' : '相手'}のターン ---`)
    }
    if (g.phase === 'main') {
      g.phase = 'main2'
      addLog(g, 'メインフェイズ2開始')
    } else if (g.phase === 'battle') {
      g.phase = 'main2'
      addLog(g, 'メインフェイズ2開始')
    } else if (g.phase === 'main2') {
      endTurn()
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
    if (targetFc && targetFc.data.id === 'warrior_01' && targetFc.isAwake) {
      addLog(g, `不屈の狂剣士：「${effect.sourceName ?? '魔法・トラップ'}」の効果を無効にし破壊！`)
      g.pendingEffect = null
      g.selectedCard = null
      setGame({ ...g })
      setMessage('')
      return
    }
    switch (effect.action) {
      case 'return_to_sealed': {
        if (!targetFc || !targetFc.isAwake) { setMessage('覚醒中を選択'); return }
        if (targetZone.includes('Front')) {
          const backZone = targetZone.replace('Front', 'Back')
          const backArr = [...getZoneArr(g, backZone)]
          const empty = backArr.findIndex(c => c === null)
          if (empty !== -1) {
            backArr[empty] = { ...targetFc, isAwake: false }
            targetArr[targetIndex] = null
            setZoneArr(g, targetZone, targetArr)
            setZoneArr(g, backZone, backArr)
            addLog(g, `「${targetFc.data.name}」封印に戻した`)
          }
        }
        break
      }
      case 'awake_then_destroy_next': {
        if (!targetFc) { setMessage('モンスターを選択'); return }
        if (!targetFc.isAwake) {
          const forceAwakeBoost = targetFc.data.id === 'monster_chuta_01' ? targetFc.magicCounters * 1000 : 0
          targetArr[targetIndex] = { ...targetFc, isAwake: true, atkMod: targetFc.atkMod + forceAwakeBoost }
          setZoneArr(g, targetZone, targetArr)
          addLog(g, `「${targetFc.data.name}」覚醒→次エンドに破壊予定`)
          const owner: 'my' | 'opp' = targetZone.startsWith('my') ? 'my' : 'opp'
          if (targetFc.data.id === 'monster_healing_cave_01') {
            restoreAtkDef(g, owner)
            addLog(g, '癒しの洞窟の姫：フィールドのATK/DEF低下を全て回復')
          }
          const dueAtOwner: 'my' | 'opp' = g.turn === 'my' ? 'opp' : 'my'
          g.endPhaseDestroyUids.push({ uid: targetFc.uid, owner, dueAtOwner })
        }
        break
      }
      case 'lock_attack': {
        if (!targetFc) { setMessage('モンスターを選択'); return }
        targetArr[targetIndex] = { ...targetFc, cantAttack: true }
        setZoneArr(g, targetZone, targetArr)
        addLog(g, `「${targetFc.data.name}」攻撃封じ`)
        break
      }
      case 'singari': {
        if (!targetFc) { setMessage('モンスターを選択'); return }
        addLog(g, `しんがり：「${targetFc.data.name}」が全攻撃を受ける`)
        g.singariTargetUid = targetFc.uid
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
    if (!g.pendingEffect || g.pendingEffect.type !== 'coin_toss') return
    const effect = g.pendingEffect
    if (effect.graveIndex === -1) { setMessage('カードを選択してください'); return }
    const result = Math.random() < 0.5
    const grave = effect.owner === 'my' ? g.myGrave : g.oppGrave
    const card = grave[effect.graveIndex]
    if (result) {
      if (fieldMonsterCount(g, effect.owner) >= MAX_FIELD_MONSTERS) {
        addLog(g, `コイン表！しかしフィールドにスペースがなく特殊召喚できない`)
      } else {
        addLog(g, `コイン表！「${card.data.name}」特殊召喚`)
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
      }
    } else {
      addLog(g, `コイン裏…「${card.data.name}」除外`)
      g.bannedCards.push(card.data.id)
      grave.splice(effect.graveIndex, 1)
    }
    g.pendingEffect = null
    setGame({ ...g })
  }

  const winner = game && !battleDisplay
    ? game.myLP <= 0 ? '相手の勝利'
      : game.oppLP <= 0 ? 'あなたの勝利'
      : (game.turn === 'my' && game.phase === 'draw' && game.myMonsterDeck.length === 0 && game.mySpellDeck.length === 0) ? '相手の勝利'
      : (game.turn === 'opp' && game.phase === 'draw' && game.oppMonsterDeck.length === 0 && game.oppSpellDeck.length === 0) ? 'あなたの勝利'
      : null
    : null

  useEffect(() => {
    if (winner === 'あなたの勝利' && !coinAwardedRef.current) {
      coinAwardedRef.current = true
      const reward = onlineMode ? 50 : difficulty === 'hard' ? 150 : difficulty === 'normal' ? 100 : 50
      setCoinReward(reward)
      const supabase = createClient()
      supabase.auth.getUser().then(async ({ data: { user } }) => {
        if (!user) return
        const { data: profile } = await supabase.from('profiles').select('coins,wins').eq('id', user.id).maybeSingle()
        if (profile) {
          await supabase.from('profiles').update({ coins: profile.coins + reward, wins: (profile.wins ?? 0) + 1 }).eq('id', user.id)
        } else {
          await supabase.from('profiles').insert({ id: user.id, coins: 1000 + reward, wins: 1 })
        }
      })
    }
    if (!winner) coinAwardedRef.current = false
  }, [winner, onlineMode, difficulty])

  useEffect(() => {
    if (opponentDisconnected && !coinAwardedRef.current) {
      coinAwardedRef.current = true
      const reward = 50
      setCoinReward(reward)
      const supabase = createClient()
      supabase.auth.getUser().then(async ({ data: { user } }) => {
        if (!user) return
        const { data: profile } = await supabase.from('profiles').select('coins,wins').eq('id', user.id).maybeSingle()
        if (profile) {
          await supabase.from('profiles').update({ coins: profile.coins + reward, wins: (profile.wins ?? 0) + 1 }).eq('id', user.id)
        } else {
          await supabase.from('profiles').insert({ id: user.id, coins: 1000 + reward, wins: 1 })
        }
      })
    }
  }, [opponentDisconnected])

  if (loading) return (
    <main style={{ background: '#0f0f0f', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#e8c876' }}>読み込み中...</p>
    </main>
  )

  if (opponentDisconnected && !game) return (
    <main style={{ background: '#0f0f0f', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 32, color: '#e8c876', fontWeight: 'bold' }}>相手が切断しました</div>
      <div style={{ fontSize: 20, color: '#4a8' }}>あなたの勝利！</div>
      <a href="/online" style={{ background: '#e8c876', color: '#0f0f0f', border: 'none', padding: '12px 32px', borderRadius: 8, fontSize: 15, fontWeight: 'bold', textDecoration: 'none' }}>ロビーへ戻る</a>
    </main>
  )

  if (!game) {
    const baseStyle: React.CSSProperties = { background: '#0f0f0f', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20 }

    if (coinFlipState === 'flipping') return (
      <main style={baseStyle}>
        <div style={{ fontSize: 18, color: '#e8c876', letterSpacing: '0.2em', fontFamily: 'Georgia, serif' }}>先行・後攻を決定中...</div>
        <div style={{ fontSize: 40 }}>🪙</div>
        <div style={{ color: '#555', fontSize: 12 }}>コインを投げています</div>
      </main>
    )

    if (coinFlipState === 'result') return (
      <main style={baseStyle}>
        <div style={{ fontSize: 14, color: '#666', letterSpacing: '0.1em' }}>結果</div>
        <div style={{ fontSize: 36, color: '#e8c876', fontWeight: 'bold', letterSpacing: '0.15em', fontFamily: 'Georgia, serif' }}>
          {playerFirst ? 'あなたが先行！' : '相手が先行！'}
        </div>
        <div style={{ color: '#555', fontSize: 12, marginTop: 8 }}>デュエルを開始します...</div>
      </main>
    )

    if (onlineMode) {
      if (onlineMode.role === 'host') return (
        <main style={baseStyle}>
          <a href="/online" style={{ position: 'absolute', top: 16, left: 16, color: '#555', fontSize: 13, textDecoration: 'none', background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, padding: '6px 14px' }}>← ロビーへ</a>
          <h1 style={{ color: '#e8c876', fontFamily: 'Georgia, serif', fontSize: 44, letterSpacing: '0.3em', margin: 0 }}>AWAKE</h1>
          <div style={{ color: '#666', fontSize: 11, letterSpacing: '0.2em' }}>ONLINE BATTLE</div>
          <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '14px 28px', textAlign: 'center' }}>
            <div style={{ color: '#666', fontSize: 11, marginBottom: 4 }}>対戦相手</div>
            <div style={{ color: '#e8c876', fontSize: 18, fontWeight: 'bold' }}>{onlineMode.opponentName}</div>
          </div>
          <button
            onClick={handleStartDuel}
            style={{ background: '#e8c876', color: '#0f0f0f', border: 'none', padding: '14px 48px', borderRadius: 10, fontSize: 17, fontWeight: 'bold', cursor: 'pointer' }}
          >
            デュエル開始
          </button>
        </main>
      )
      return (
        <main style={baseStyle}>
          <h1 style={{ color: '#e8c876', fontFamily: 'Georgia, serif', fontSize: 44, letterSpacing: '0.3em', margin: 0 }}>AWAKE</h1>
          <div style={{ color: '#666', fontSize: 11, letterSpacing: '0.2em' }}>ONLINE BATTLE</div>
          <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '14px 28px', textAlign: 'center' }}>
            <div style={{ color: '#666', fontSize: 11, marginBottom: 4 }}>対戦相手</div>
            <div style={{ color: '#e8c876', fontSize: 18, fontWeight: 'bold' }}>{onlineMode.opponentName}</div>
          </div>
          <div style={{ fontSize: 28, marginBottom: 4 }}>🌀</div>
          <div style={{ color: '#888', fontSize: 13 }}>相手がデュエルを開始するのを待っています...</div>
        </main>
      )
    }

    const diffBtnStyle = (d: 'easy' | 'normal' | 'hard'): React.CSSProperties => ({
      padding: '14px 28px', border: `2px solid ${difficulty === d ? '#e8c876' : '#333'}`,
      borderRadius: 10, background: difficulty === d ? '#2a2a00' : '#1a1a1a',
      color: difficulty === d ? '#e8c876' : '#666', fontSize: 15, cursor: 'pointer',
      fontWeight: 'bold', transition: 'all 0.15s', minWidth: 120,
    })

    const deckInfo = myDeckRecord
      ? `モンスター ${myDeckRecord.monster_cards.length}枚 / 魔法・罠 ${myDeckRecord.magic_trap_cards.length}枚`
      : 'デッキ未作成（ランダムデッキ使用）'

    return (
      <main style={baseStyle}>
        <a href="/" style={{ position: 'absolute', top: 16, left: 16, color: '#fff', fontSize: 13, textDecoration: 'none', background: '#2a2a2a', border: '1px solid #666', borderRadius: 6, padding: '6px 14px' }}>← ホーム</a>
        <h1 style={{ color: '#e8c876', fontFamily: 'Georgia, serif', fontSize: 44, letterSpacing: '0.3em', margin: 0 }}>AWAKE</h1>

        <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '12px 24px', textAlign: 'center' }}>
          <div style={{ color: '#666', fontSize: 11, marginBottom: 4 }}>あなたのデッキ</div>
          <div style={{ color: myDeckRecord ? '#e8c876' : '#555', fontSize: 13 }}>{deckInfo}</div>
          {!myDeckRecord && (
            <a href="/deck" style={{ color: '#4a8a4a', fontSize: 11, textDecoration: 'none', display: 'block', marginTop: 6 }}>デッキを作成する →</a>
          )}
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#888', fontSize: 13, marginBottom: 12, letterSpacing: '0.1em' }}>CPU 難易度</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button style={diffBtnStyle('easy')} onClick={() => setDifficulty('easy')}>
              易しい<br /><span style={{ fontSize: 10, fontWeight: 'normal', color: '#555' }}>ミスが多い</span>
            </button>
            <button style={diffBtnStyle('normal')} onClick={() => setDifficulty('normal')}>
              普通<br /><span style={{ fontSize: 10, fontWeight: 'normal', color: '#555' }}>標準</span>
            </button>
            <button style={diffBtnStyle('hard')} onClick={() => setDifficulty('hard')}>
              難しい<br /><span style={{ fontSize: 10, fontWeight: 'normal', color: '#555' }}>積極的</span>
            </button>
          </div>
        </div>

        <button
          onClick={handleStartDuel}
          disabled={!difficulty}
          style={{
            background: difficulty ? '#e8c876' : '#2a2a2a', color: difficulty ? '#0f0f0f' : '#555',
            border: 'none', padding: '14px 48px', borderRadius: 10, fontSize: 17,
            fontWeight: 'bold', cursor: difficulty ? 'pointer' : 'not-allowed', marginTop: 8,
            transition: 'background 0.2s',
          }}
        >
          デュエル開始
        </button>
      </main>
    )
  }

  if (opponentDisconnected && game) return (
    <main style={{ background: '#0f0f0f', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 32, color: '#e8c876', fontWeight: 'bold' }}>相手が切断しました</div>
      <div style={{ fontSize: 20, color: '#4a8' }}>あなたの勝利！</div>
      {coinReward > 0 && (
        <div style={{ background: '#1a1500', border: '1px solid #5c4a00', borderRadius: 10, padding: '12px 24px', color: '#e8c876', fontSize: 16 }}>
          🪙 +{coinReward} コイン獲得！
        </div>
      )}
      <a href="/online" style={{ background: '#e8c876', color: '#0f0f0f', border: 'none', padding: '12px 32px', borderRadius: 8, fontSize: 15, fontWeight: 'bold', textDecoration: 'none' }}>ロビーへ戻る</a>
    </main>
  )

  if (winner) return (
    <main style={{ background: '#0f0f0f', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 36, color: '#e8c876', fontWeight: 'bold' }}>{winner}</div>
      {winner === 'あなたの勝利' && coinReward > 0 && (
        <div style={{ background: '#1a1500', border: '1px solid #5c4a00', borderRadius: 10, padding: '12px 24px', color: '#e8c876', fontSize: 16 }}>
          🪙 +{coinReward} コイン獲得！
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        {onlineMode
          ? <a href="/online" style={{ background: '#e8c876', color: '#0f0f0f', border: 'none', padding: '12px 32px', borderRadius: 8, fontSize: 15, fontWeight: 'bold', cursor: 'pointer', textDecoration: 'none' }}>ロビーへ戻る</a>
          : <button onClick={() => { setGame(null); setDifficulty(null); coinAwardedRef.current = false }} style={{ background: '#e8c876', color: '#0f0f0f', border: 'none', padding: '12px 32px', borderRadius: 8, fontSize: 15, fontWeight: 'bold', cursor: 'pointer' }}>もう一度</button>
        }
        <a href="/" style={{ background: '#2a2a2a', color: '#aaa', border: '1px solid #444', padding: '12px 24px', borderRadius: 8, fontSize: 15, fontWeight: 'bold', cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>ホームへ</a>
      </div>
    </main>
  )

  const isMyTurn = game.turn === 'my'
  const phaseLabel: Record<string, string> = {
    draw: 'ドロー', main: 'メイン', battle: 'バトル', main2: 'メイン2'
  }

  const btn = (bg = '#2a2a2a', disabled = false): React.CSSProperties => ({
    background: disabled ? '#2a2a2a' : bg,
    color: disabled ? '#555' : bg === '#e8c876' ? '#0f0f0f' : '#fff',
    border: `1px solid ${disabled ? '#333' : 'transparent'}`,
    padding: '4px 10px', borderRadius: 4,
    fontSize: 10, cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 'bold', flexShrink: 0, opacity: disabled ? 0.5 : 1,
  })

  const cardBox = (selected: boolean, borderColor: string, dimmed = false): React.CSSProperties => ({
    width: CW, height: CH, borderRadius: 5,
    border: `1px solid ${selected ? '#e8c876' : borderColor}`,
    background: selected ? '#2a2a00' : '#1a1a1a',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    fontSize: 8, flexShrink: 0, cursor: 'pointer', padding: 2,
    boxSizing: 'border-box' as const, gap: 1, opacity: dimmed ? 0.5 : 1,
    overflow: 'hidden',
  })

  const emptyBox = (selected: boolean, borderColor: string): React.CSSProperties => ({
    width: CW, height: CH, borderRadius: 5,
    border: `1px solid ${selected ? '#e8c876' : borderColor}`,
    background: selected ? '#2a2a00' : '#161616',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 9, color: '#2a2a2a', flexShrink: 0, cursor: 'pointer',
  })

  const deckBox: React.CSSProperties = {
    width: CW, height: CH, borderRadius: 5, border: '1px solid #554',
    background: '#1e1a0a', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', fontSize: 9,
    color: '#e8c876', flexShrink: 0, textAlign: 'center', cursor: 'pointer',
  }

  const graveBox: React.CSSProperties = {
    width: CW, height: CH, borderRadius: 5, border: '1px solid #443',
    background: '#1a1200', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', fontSize: 9,
    color: '#a87', flexShrink: 0, textAlign: 'center', cursor: 'pointer',
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'center',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 8, color: '#555', textAlign: 'center', lineHeight: 1, marginBottom: 1,
  }

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
    const isLockAttackTarget = !catSelectModalOpen && isPendingTarget &&
      (game.pendingEffect as { action?: string })?.action === 'lock_attack' &&
      !!fc && zone.startsWith('opp')
    const handleClick = () => {
      if (singariTargetMode) {
        if (fc && zone.startsWith('my')) {
          setSingariTargetMode(false)
          if (singariTargetResolveRef.current) {
            singariTargetResolveRef.current(fc.uid)
            singariTargetResolveRef.current = null
          } else if (onlineModeRef.current) {
            // Online mode: store singari target in game state and broadcast
            const g = { ...gameRef.current! }
            g.singariTargetUid = fc.uid
            addLog(g, `しんがり：「${fc.data.name}」が全攻撃を受ける`)
            setGame({ ...g })
            channelRef.current?.send({ type: 'broadcast', event: 'trap_checking', payload: { active: false } })
          }
        } else {
          setMessage('自分のモンスターを選択してください')
        }
        return
      }
      if (fishermanTargetMode) { setMessage('相手の魔法・罠カードを選択してください'); return }
      if (isPendingTarget) { handlePendingTarget(zone, index); return }
      if (game.phase === 'battle' && selIsMyField && sel && zone.startsWith('opp')) {
        attack(sel.zone, sel.index, zone, index); return
      }
      if (game.phase === 'main' && selIsHand && selCardIsMonster && zone === 'myBack' && !fc) {
        summonMonster('myBack', index); return
      }
      if ((game.phase === 'main' || game.phase === 'main2') && selIsHand && selCardIsSpell && zone.startsWith(isMyTurn ? 'my' : 'opp') && !fc) {
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
    const isDefense = fc.stance === 'defense'
    const isSingariTarget = game.singariTargetUid !== null && fc.uid === game.singariTargetUid
    const fieldCardClass = [isLockAttackTarget ? 'lock-attack-target' : '', isSingariTarget ? 'singari-target' : ''].filter(Boolean).join(' ') || undefined
    return (
      <div key={index} style={cardBox(isSel, borderColor, fc.hasAttacked)} className={fieldCardClass} onClick={handleClick}>
        {imgUrl && (
          <img src={imgUrl} style={{
            width: isDefense ? 52 : 44,
            height: isDefense ? 44 : 52,
            objectFit: 'cover',
            borderRadius: 3,
            transform: isDefense ? 'rotate(90deg)' : 'none',
          }} alt="" />
        )}
        {attr && <div style={{ fontSize: 8, color: ATTR_COLOR[attr] ?? '#888', lineHeight: 1 }}>{attr}</div>}
        <div style={{ fontSize: 7, color: '#ccc', maxWidth: CW-6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1 }}>{name}</div>
        <div style={{ fontSize: 8, color: isDefense ? '#88f' : '#f88', lineHeight: 1 }}>
          {isDefense ? `DEF${defVal}` : `ATK${atkVal}`}
        </div>
        {fc.isAwake && <div style={{ fontSize: 7, color: '#4f4', lineHeight: 1 }}>覚醒</div>}
        {fc.cantAttack && <div style={{ fontSize: 7, color: '#f44', lineHeight: 1 }}>封</div>}
        {fc.magicCounters > 0 && <div style={{ fontSize: 7, color: '#99f', lineHeight: 1, fontWeight: 'bold' }}>魔×{fc.magicCounters}</div>}
      </div>
    )
  }

  const renderSpellZoneCard = (fc: FieldCard | null, zone: string, index: number) => {
    const isSel = sel?.zone === zone && sel?.index === index
    const handleClick = () => {
      if (singariTargetMode) { setMessage('モンスターを選択してください'); return }
      if (fishermanTargetMode) {
        if (zone === 'oppSpellZone' && fc) {
          const g2 = { ...game }
          const arr = [...g2.oppSpellZone]; arr[index] = null; g2.oppSpellZone = arr
          g2.oppGrave.push({ data: fc.data, isAwake: false })
          addLog(g2, `釣り人効果：「${fc.data.name}」を破壊！`)
          setGame({ ...g2 })
          setFishermanTargetMode(false)
          if (fishermanTargetResolveRef.current) { fishermanTargetResolveRef.current(); fishermanTargetResolveRef.current = null }
        } else {
          setMessage('相手の魔法・罠カードを選択してください')
        }
        return
      }
      if (isPendingTarget) return
      if (fc && (game.phase === 'main' || game.phase === 'battle' || game.phase === 'main2')) { activateSpell(zone as 'mySpellZone' | 'oppSpellZone', index); return }
      if (!fc && selIsHand && selCardIsSpell) { setSpellCard(zone as 'mySpellZone' | 'oppSpellZone', index); return }
      if (fc) selectCard(zone, index)
    }
    if (!fc) return <div key={index} style={emptyBox(isSel, '#446')} onClick={handleClick}>空</div>
    if (fc.data.id === '__hidden__') {
      return (
        <div key={index} style={cardBox(false, '#446')}>
          <div style={{ width: 44, height: 44, background: '#1a1430', borderRadius: 3, border: '1px solid #334', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#334' }}>?</div>
          <div style={{ fontSize: 7, color: '#446', lineHeight: 1 }}>セット中</div>
        </div>
      )
    }
    const imgUrl = fc.data.img ?? fc.data.img_sealed
    return (
      <div key={index} style={cardBox(isSel, '#66a')} onClick={handleClick}>
        {imgUrl && <img src={imgUrl} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 3 }} alt="" />}
        <div style={{ fontSize: 7, color: '#ccc', maxWidth: CW-6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1 }}>{fc.data.name}</div>
        <div style={{ fontSize: 7, color: '#88f', lineHeight: 1 }}>発動</div>
      </div>
    )
  }

  const renderHandCard = (card: CardData, zone: string, index: number) => {
    const isSel = sel?.zone === zone && sel?.index === index
    const imgUrl = card.img_sealed ?? card.img
    return (
      <div key={index} style={cardBox(isSel, '#555')} onClick={() => selectCard(zone, index)}>
        {imgUrl && <img src={imgUrl} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 3 }} alt="" />}
        <div style={{ fontSize: 7, color: ATTR_COLOR[card.attribute ?? ''] ?? '#888', lineHeight: 1 }}>{card.attribute}</div>
        <div style={{ fontSize: 7, color: '#ccc', maxWidth: CW-6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1 }}>{card.name}</div>
        {card.type === 'monster'
          ? <div style={{ fontSize: 7, color: '#f88', lineHeight: 1 }}>{card.atk_sealed ?? 0}/{card.def_sealed ?? 0}</div>
          : <div style={{ fontSize: 7, color: '#aaf', lineHeight: 1 }}>{card.type}</div>
        }
      </div>
    )
  }

  return (
    <main style={{ background: '#0f0f0f', height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '4px 8px', boxSizing: 'border-box', fontFamily: 'monospace' }}>

      {/* 右上：ホームに戻るボタン（対戦中のみ） */}
      <a
        href="/"
        style={{ position: 'fixed', top: 10, right: 12, zIndex: 200, background: '#2a2a2a', border: '1px solid #e8c876', color: '#e8c876', borderRadius: 6, padding: '5px 14px', fontSize: 12, fontWeight: 'bold', textDecoration: 'none', letterSpacing: '0.05em' }}
      >
        ← ホーム
      </a>

      {/* オンライン：相手のターンオーバーレイ */}
      {onlineMode && !isMyTurn && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 20, pointerEvents: 'none', display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
          <div style={{ background: 'rgba(20,20,40,0.85)', border: '1px solid #446', borderRadius: 20, padding: '4px 18px', color: '#88f', fontSize: 11, letterSpacing: '0.1em' }}>
            {onlineMode.opponentName} のターン
          </div>
        </div>
      )}

      {/* 魔法・罠カード発動演出 */}
      {cardReveal && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70, pointerEvents: 'none' }}>
          <div className="card-reveal-anim" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.2em', color: cardReveal.owner === 'my' ? '#8cf' : '#f88', fontWeight: 'bold', textShadow: '0 0 10px currentColor' }}>
              {cardReveal.owner === 'my' ? 'あなたが発動！' : '相手が発動！'}
            </div>
            <div style={{ background: '#0a0a1a', border: `2px solid ${cardReveal.owner === 'my' ? '#55f' : '#f55'}`, borderRadius: 10, padding: 8, boxShadow: `0 0 30px ${cardReveal.owner === 'my' ? 'rgba(80,80,255,0.6)' : 'rgba(255,80,80,0.6)'}` }}>
              {(cardReveal.data.img_sealed || cardReveal.data.img) && (
                <img
                  src={cardReveal.data.img_sealed ?? cardReveal.data.img ?? ''}
                  alt={cardReveal.data.name}
                  style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 6, display: 'block' }}
                />
              )}
            </div>
            <div style={{ color: '#eee', fontSize: 15, fontWeight: 'bold', textShadow: '0 2px 8px #000', maxWidth: 200, textAlign: 'center' }}>
              {cardReveal.data.name}
            </div>
            {cardReveal.data.effect && (
              <div style={{ color: '#aaa', fontSize: 10, maxWidth: 220, textAlign: 'center', lineHeight: 1.5, padding: '4px 8px', background: 'rgba(0,0,0,0.6)', borderRadius: 6 }}>
                {cardReveal.data.effect}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 相手がトラップを選択中：操作ブロックオーバーレイ */}
      {(waitingForTrapResponse || opponentCheckingTrap) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 65, pointerEvents: 'all' }}>
          <div style={{ background: '#141428', border: '1px solid #446', borderRadius: 10, padding: '22px 40px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, marginBottom: 10, animation: 'pulse 1.2s ease-in-out infinite' }}>⏳</div>
            <div style={{ color: '#aaf', fontSize: 13, letterSpacing: '0.08em', marginBottom: 6 }}>相手がカードを選択中...</div>
            <div style={{ color: '#445', fontSize: 10 }}>しばらくお待ちください</div>
          </div>
        </div>
      )}

      {/* バトル演出モーダル */}
      <style>{`
        @keyframes shatter { 0% { transform: scale(1) rotate(0deg); opacity: 1; } 100% { transform: scale(0.2) rotate(-120deg); opacity: 0; } }
        @keyframes shatter-r { 0% { transform: scale(1) rotate(0deg); opacity: 1; } 100% { transform: scale(0.2) rotate(120deg); opacity: 0; } }
        @keyframes target-blink { 0%,100% { box-shadow: 0 0 0 2px #f80, 0 0 10px rgba(255,128,0,0.5); border-color: #f80 !important; } 50% { box-shadow: none; border-color: #442 !important; } }
        .lock-attack-target { animation: target-blink 0.7s ease-in-out infinite; border-style: dashed !important; cursor: pointer; }
        @keyframes singari-blink { 0%,100% { box-shadow: 0 0 0 2px #ff4, 0 0 14px rgba(255,255,64,0.6); border-color: #ff4 !important; } 50% { box-shadow: none; border-color: #443 !important; } }
        .singari-target { animation: singari-blink 0.8s ease-in-out infinite; }
        @keyframes card-reveal { 0% { opacity:0; transform:scale(0.4) rotateY(-80deg); } 18% { opacity:1; transform:scale(1.06) rotateY(0deg); } 65% { opacity:1; transform:scale(1) rotateY(0deg); } 100% { opacity:0; transform:scale(0.95); } }
        .card-reveal-anim { animation: card-reveal 1.9s ease-in-out forwards; }
      `}</style>
      {battleDisplay && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, cursor: 'pointer' }} onClick={() => setBattleDisplay(null)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>

           {/* 攻撃側 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              {battleDisplay.atkImg && (() => {
                const doShatter = battleDisplay.result === 'lose' || battleDisplay.result === 'draw'
                const SIZE = 560
                return (
                  <img src={battleDisplay.atkImg} style={{ width: SIZE, height: SIZE, objectFit: 'cover', borderRadius: 12, border: '2px solid #f88', animation: doShatter ? 'shatter 0.9s ease-in forwards' : 'none' }} alt="" />
                )
              })()}
              <div style={{ color: '#e8c876', fontSize: 13, fontWeight: 'bold', textAlign: 'center' }}>{battleDisplay.atkName}</div>
              <div style={{ color: '#f88', fontSize: 18, fontWeight: 'bold' }}>ATK {battleDisplay.atkVal}</div>
            </div>

            {/* 中央：結果 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, minWidth: 160 }}>
              <div style={{ fontSize: 13, color: '#666' }}>
                {battleDisplay.result === 'direct' && 'ダイレクトアタック'}
                {battleDisplay.result === 'win' && '撃破！'}
                {battleDisplay.result === 'lose' && '敗北…'}
                {battleDisplay.result === 'draw' && '相打ち'}
                {battleDisplay.result === 'nobreach' && '貫通失敗'}
              </div>
              {battleDisplay.damage > 0 && (() => {
                const playerTakesDamage =
                  (battleDisplay.isPlayerAttack && (battleDisplay.result === 'lose' || battleDisplay.result === 'nobreach')) ||
                  (!battleDisplay.isPlayerAttack && (battleDisplay.result === 'win' || battleDisplay.result === 'direct'))
                const dmgColor = playerTakesDamage ? '#f44' : '#4f4'
                const dmgShadow = playerTakesDamage ? '0 0 20px rgba(255,64,64,0.5)' : '0 0 20px rgba(64,255,64,0.5)'
                return (
                  <div style={{ fontSize: 52, fontWeight: 'bold', lineHeight: 1, color: dmgColor, textShadow: dmgShadow }}>
                    {battleDisplay.damage}
                  </div>
                )
              })()}
              {battleDisplay.damage > 0 && (
                <div style={{ fontSize: 14, color: '#888' }}>ダメージ</div>
              )}
              {battleDisplay.result === 'draw' && (
                <div style={{ fontSize: 32, fontWeight: 'bold', color: '#aaa' }}>相打ち</div>
              )}
            </div>

           {/* 防御側 */}
            {battleDisplay.defName && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                {battleDisplay.defImg && (() => {
                  const doShatter = battleDisplay.result === 'win' || battleDisplay.result === 'draw'
                  const SIZE = 560
                  return (
                    <img src={battleDisplay.defImg} style={{ width: SIZE, height: SIZE, objectFit: 'cover', borderRadius: 12, border: '2px solid #88f', animation: doShatter ? 'shatter-r 0.9s ease-in forwards' : 'none' }} alt="" />
                  )
                })()}
                <div style={{ color: '#e8c876', fontSize: 13, fontWeight: 'bold', textAlign: 'center' }}>{battleDisplay.defName}</div>
                <div style={{ color: battleDisplay.defStance === 'defense' ? '#88f' : '#f88', fontSize: 18, fontWeight: 'bold' }}>
                  {battleDisplay.defStance === 'defense' ? 'DEF' : 'ATK'} {battleDisplay.defVal}
                </div>
              </div>
            )}

          </div>
        </div>
      )}
      {/* 覚醒演出モーダル */}
      {awakeDisplay && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 55, flexDirection: 'column', gap: 20, cursor: 'pointer' }} onClick={() => setAwakeDisplay(null)}>
          <div style={{ fontSize: 14, color: '#4f4', letterSpacing: '0.3em' }}>覚 醒</div>
          <img src={awakeDisplay.img} style={{ width: 420, height: 420, objectFit: 'cover', borderRadius: 12, border: '2px solid #4f4', boxShadow: '0 0 40px rgba(64,255,64,0.3)' }} alt="" />
          <div style={{ fontSize: 20, color: '#e8c876', fontWeight: 'bold', letterSpacing: '0.1em' }}>{awakeDisplay.name}</div>
        </div>
      )}
      {/* コイントスオーバーレイ */}
      {game.pendingEffect?.type === 'coin_toss' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ color: '#e8c876', fontSize: 18, marginBottom: 16 }}>地獄の審判：コイントス</div>
          <button style={{ ...btn('#e8c876'), fontSize: 14, padding: '10px 30px' }} onClick={coinToss}>コインを投げる</button>
        </div>
      )}

      {/* メカ・イタズラット：手札捨てモーダル */}
      {discardHandMode && game && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 55 }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #e8c876', borderRadius: 8, padding: 20, maxWidth: 540, width: '90%' }}>
            <div style={{ color: '#e8c876', marginBottom: 4, fontSize: 14, fontWeight: 'bold' }}>メカ・イタズラット効果</div>
            <div style={{ color: '#aaa', marginBottom: 12, fontSize: 11 }}>相手の手札から2枚選んで捨てさせる（{discardHandMode.selected.length}/2枚選択中）</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {game.oppHand.map((card, i) => {
                const isSel = discardHandMode.selected.includes(i)
                return (
                  <div key={i} onClick={() => {
                    const sel = discardHandMode.selected
                    if (isSel) setDiscardHandMode({ selected: sel.filter(s => s !== i) })
                    else if (sel.length < 2) setDiscardHandMode({ selected: [...sel, i] })
                  }} style={{ width: 90, padding: 6, borderRadius: 6, border: `2px solid ${isSel ? '#e8c876' : '#444'}`, background: isSel ? '#2a2a00' : '#111', cursor: 'pointer', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#ccc', marginBottom: 2 }}>{card.name}</div>
                    {card.type === 'monster'
                      ? <div style={{ fontSize: 9, color: '#f88' }}>ATK {card.atk_sealed ?? 0}</div>
                      : <div style={{ fontSize: 9, color: '#aaf' }}>{card.type}</div>}
                  </div>
                )
              })}
            </div>
            <button
              disabled={discardHandMode.selected.length < Math.min(2, game.oppHand.length)}
              onClick={() => {
                const g = { ...game }
                const indices = [...discardHandMode.selected].sort((a, b) => b - a)
                for (const idx of indices) {
                  addLog(g, `「${g.oppHand[idx].name}」を捨てさせた`)
                  g.oppGrave.push({ data: g.oppHand[idx], isAwake: false })
                  g.oppHand.splice(idx, 1)
                }
                setGame({ ...g })
                setDiscardHandMode(null)
              }}
              style={{ background: discardHandMode.selected.length >= Math.min(2, game.oppHand.length) ? '#e8c876' : '#333', color: '#0f0f0f', border: 'none', borderRadius: 6, padding: '8px 24px', fontSize: 13, fontWeight: 'bold', cursor: 'pointer' }}
            >
              捨てさせる
            </button>
          </div>
        </div>
      )}

      {/* しんがり発動確認モーダル */}
      {trapPrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70 }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #e8c876', borderRadius: 8, padding: 28, textAlign: 'center', minWidth: 280 }}>
            <div style={{ color: '#e8c876', fontSize: 15, fontWeight: 'bold', marginBottom: 8 }}>罠カード「{trapPrompt.cardName}」</div>
            {trapPrompt.triggeredBy && (
              <div style={{ color: '#f88', fontSize: 11, marginBottom: 8 }}>相手「{trapPrompt.triggeredBy}」の発動に対して</div>
            )}
            {trapPrompt.cardEffect && (
              <div style={{ color: '#888', fontSize: 11, marginBottom: 12, lineHeight: 1.5, textAlign: 'left' }}>{trapPrompt.cardEffect}</div>
            )}
            <div style={{ color: '#ccc', fontSize: 12, marginBottom: 20 }}>
              {trapPrompt.triggeredBy ? '発動しますか？' : '相手の攻撃に対して発動しますか？'}
            </div>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button style={{ background: '#e8c876', color: '#0f0f0f', border: 'none', borderRadius: 6, padding: '8px 24px', fontSize: 13, fontWeight: 'bold', cursor: 'pointer' }}
                onClick={() => {
                  setTrapPrompt(null)
                  if (onlineSingariSlotRef.current >= 0) {
                    const slot = onlineSingariSlotRef.current
                    onlineSingariSlotRef.current = -1
                    const g = { ...gameRef.current! }
                    const singariCard = g.mySpellZone[slot]
                    if (singariCard) {
                      const arr = [...g.mySpellZone]; arr[slot] = null; g.mySpellZone = arr
                      g.myGrave.push({ data: singariCard.data, isAwake: false })
                      addLog(g, '「しんがり」発動！')
                      setGame({ ...g })
                    }
                    setSingariTargetMode(true)
                    return
                  }
                  trapResolveRef.current?.(true); trapResolveRef.current = null
                }}>
                発動する
              </button>
              <button style={{ background: '#333', color: '#aaa', border: '1px solid #555', borderRadius: 6, padding: '8px 24px', fontSize: 13, cursor: 'pointer' }}
                onClick={() => {
                  setTrapPrompt(null)
                  if (onlineSingariSlotRef.current >= 0) {
                    onlineSingariSlotRef.current = -1
                    channelRef.current?.send({ type: 'broadcast', event: 'trap_checking', payload: { active: false } })
                    return
                  }
                  trapResolveRef.current?.(false); trapResolveRef.current = null
                }}>
                しない
              </button>
            </div>
          </div>
        </div>
      )}

      {/* オンライン：悪夢の大噴火 発動確認 */}
      {onlineTrapCheckPrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 71 }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #e8c876', borderRadius: 8, padding: 28, textAlign: 'center', minWidth: 340, maxWidth: 400 }}>
            <div style={{ color: '#f88', fontSize: 12, marginBottom: 8 }}>「{onlineTrapCheckPrompt.triggeredBy}」発動！</div>
            <div style={{ color: '#e8c876', fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>罠カード「{onlineTrapCheckPrompt.cardName}」</div>
            <div style={{ color: '#888', fontSize: 11, marginBottom: 20, lineHeight: 1.6, textAlign: 'left' }}>{onlineTrapCheckPrompt.cardEffect}</div>
            <div style={{ color: '#ccc', fontSize: 12, marginBottom: 20 }}>発動しますか？</div>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button style={{ background: '#e8c876', color: '#0f0f0f', border: 'none', borderRadius: 6, padding: '8px 24px', fontSize: 13, fontWeight: 'bold', cursor: 'pointer' }}
                onClick={() => { setOnlineTrapCheckPrompt(null); channelRef.current?.send({ type: 'broadcast', event: 'trap_response', payload: { activated: true } }) }}>
                発動する
              </button>
              <button style={{ background: '#333', color: '#aaa', border: '1px solid #555', borderRadius: 6, padding: '8px 24px', fontSize: 13, cursor: 'pointer' }}
                onClick={() => { setOnlineTrapCheckPrompt(null); channelRef.current?.send({ type: 'broadcast', event: 'trap_response', payload: { activated: false } }) }}>
                しない
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 異界の怪猫 効果発動モーダル */}
      {catSelectModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70 }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #e8c876', borderRadius: 8, padding: 28, textAlign: 'center', minWidth: 300, maxWidth: 380 }}>
            <div style={{ color: '#e8c876', fontSize: 15, fontWeight: 'bold', marginBottom: 4 }}>異界の怪猫</div>
            <div style={{ color: '#e8c876', fontSize: 11, marginBottom: 12, opacity: 0.7 }}>-アザー・ワールド・キャット-</div>
            <div style={{ color: '#888', fontSize: 11, marginBottom: 20, lineHeight: 1.6, textAlign: 'left' }}>
              覚醒効果：相手のモンスターを1枚選択する。選択したモンスターはこのカードがフィールドに存在する限り攻撃が行えなくなる。
            </div>
            <button
              style={{ background: '#e8c876', color: '#0f0f0f', border: 'none', borderRadius: 6, padding: '10px 28px', fontSize: 13, fontWeight: 'bold', cursor: 'pointer' }}
              onClick={() => setCatSelectModalOpen(false)}
            >
              対象を選択する
            </button>
          </div>
        </div>
      )}

      {/* 砂浜の釣り人 効果モーダル */}
      {fishermanPrompt && !battleDisplay && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70 }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #e8c876', borderRadius: 8, padding: 28, textAlign: 'center', minWidth: 300, maxWidth: 380 }}>
            <div style={{ color: '#e8c876', fontSize: 15, fontWeight: 'bold', marginBottom: 8 }}>砂浜の釣り人</div>
            <div style={{ color: '#888', fontSize: 11, marginBottom: 20, lineHeight: 1.6, textAlign: 'left' }}>
              このカードが破壊された時、相手の魔法・トラップカードを1枚選択して破壊できる。
            </div>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button style={{ background: '#e8c876', color: '#0f0f0f', border: 'none', borderRadius: 6, padding: '8px 24px', fontSize: 13, fontWeight: 'bold', cursor: 'pointer' }}
                onClick={() => {
                  setFishermanPrompt(false)
                  if (fishermanResolveRef.current) { fishermanResolveRef.current(true); fishermanResolveRef.current = null }
                  else setFishermanTargetMode(true)
                }}>
                発動する
              </button>
              <button style={{ background: '#333', color: '#aaa', border: '1px solid #555', borderRadius: 6, padding: '8px 24px', fontSize: 13, cursor: 'pointer' }}
                onClick={() => {
                  setFishermanPrompt(false)
                  if (fishermanResolveRef.current) { fishermanResolveRef.current(false); fishermanResolveRef.current = null }
                }}>
                しない
              </button>
            </div>
          </div>
        </div>
      )}

      {/* クマ軍曹：攻撃宣言時アライグマ戦士召喚モーダル */}
      {kumaAttackModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70 }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #e8c876', borderRadius: 8, padding: 28, textAlign: 'center', minWidth: 320 }}>
            <div style={{ color: '#e8c876', fontSize: 15, fontWeight: 'bold', marginBottom: 12 }}>クマ軍曹の効果</div>
            {kumaAttackModal.availableCount === 0 ? (
              <>
                <div style={{ color: '#f88', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
                  デッキに「アライグマ戦士」がいないため<br />効果を発動できません。
                </div>
                <button style={{ background: '#2a2a2a', color: '#aaa', border: '1px solid #555', borderRadius: 6, padding: '8px 28px', fontSize: 14, cursor: 'pointer' }}
                  onClick={() => confirmKumaAttack(0)}>
                  そのまま攻撃
                </button>
              </>
            ) : (
              <>
                <div style={{ color: '#aaa', fontSize: 11, marginBottom: 18, lineHeight: 1.6 }}>
                  攻撃宣言時、デッキの「アライグマ戦士」を任意の枚数特殊召喚できる。<br />
                  デッキに <span style={{ color: '#e8c876', fontWeight: 'bold' }}>{kumaAttackModal.availableCount}</span> 体 / 召喚可能 <span style={{ color: '#e8c876', fontWeight: 'bold' }}>{kumaAttackModal.maxSummon}</span> 体
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
                  {Array.from({ length: kumaAttackModal.maxSummon + 1 }, (_, n) => (
                    <button key={n} style={{ background: '#2a2a2a', color: '#e8c876', border: '1px solid #554', borderRadius: 6, padding: '6px 16px', fontSize: 14, cursor: 'pointer', fontWeight: 'bold' }}
                      onClick={() => confirmKumaAttack(n)}>
                      {n}体
                    </button>
                  ))}
                </div>
                <button style={{ background: '#333', color: '#888', border: '1px solid #555', borderRadius: 6, padding: '6px 20px', fontSize: 12, cursor: 'pointer' }}
                  onClick={() => confirmKumaAttack(0)}>
                  召喚せずに攻撃
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 釣り人：破壊する相手魔法・罠選択オーバーレイ */}
      {fishermanTargetMode && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(20,20,20,0.95)', border: '1px solid #e8c876', borderRadius: 8, padding: '10px 20px', zIndex: 70, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ color: '#e8c876', fontSize: 13 }}>釣り人効果：破壊する相手の魔法・罠をクリック</div>
          <button style={{ background: '#333', color: '#aaa', border: '1px solid #555', borderRadius: 6, padding: '4px 14px', fontSize: 12, cursor: 'pointer' }}
            onClick={() => {
              setFishermanTargetMode(false)
              if (fishermanTargetResolveRef.current) { fishermanTargetResolveRef.current(); fishermanTargetResolveRef.current = null }
            }}>
            キャンセル
          </button>
        </div>
      )}

      {/* しんがり：攻撃受けるモンスター選択オーバーレイ */}
      {singariTargetMode && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(20,20,20,0.95)', border: '1px solid #e8c876', borderRadius: 8, padding: '10px 20px', zIndex: 70, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ color: '#e8c876', fontSize: 13 }}>しんがり：全攻撃を受けるモンスターをクリック</div>
          <button style={{ background: '#333', color: '#aaa', border: '1px solid #555', borderRadius: 6, padding: '4px 14px', fontSize: 12, cursor: 'pointer' }}
            onClick={() => { setSingariTargetMode(false); singariTargetResolveRef.current?.(null); singariTargetResolveRef.current = null }}>
            キャンセル
          </button>
        </div>
      )}

      {/* 墓地ビューア */}
      {showGrave && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => { setShowGrave(null); setGraveSelectMode(null) }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: 8, padding: 16, maxWidth: 520, width: '90%', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ color: '#e8c876', marginBottom: 8, fontSize: 13 }}>
              {showGrave === 'my' ? '自分' : '相手'}の墓地
              {graveSelectMode?.action === 'dragon_revive' && <span style={{ color: '#f88', fontSize: 10, marginLeft: 8 }}>ドラゴンを選択して特殊召喚</span>}
              {graveSelectMode?.action === 'witch_revive' && <span style={{ color: '#f88', fontSize: 10, marginLeft: 8 }}>蘇生するカードを選択（何枚でも可・閉じるで終了）</span>}
              {graveSelectMode && graveSelectMode.action !== 'dragon_revive' && graveSelectMode.action !== 'witch_revive' && <span style={{ color: '#f88', fontSize: 10, marginLeft: 8 }}>特殊召喚するカードを選択</span>}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(showGrave === 'my' ? game.myGrave : game.oppGrave).map((gc, i) => {
                const isDragonSelectable = graveSelectMode?.action === 'dragon_revive' && gc.data.type === 'monster' && gc.data.name.includes('ドラゴン')
                const isWitchSelectable = graveSelectMode?.action === 'witch_revive' && gc.data.type === 'monster'
                const isSelectableCard = graveSelectMode && graveSelectMode.action !== 'dragon_revive' && graveSelectMode.action !== 'witch_revive' && gc.data.type === 'monster'
                const anySelectable = isDragonSelectable || isWitchSelectable || isSelectableCard
                const cardBorder = isDragonSelectable ? '2px solid #f80' : (isWitchSelectable || isSelectableCard) ? '1px solid #e8c876' : 'none'
                const cardOpacity = (graveSelectMode?.action === 'dragon_revive' && !isDragonSelectable) || (graveSelectMode?.action === 'witch_revive' && gc.data.type !== 'monster') || (graveSelectMode?.action === 'jigoku_sinpan' && gc.data.type !== 'monster') ? 0.35 : 1
                const cardCursor = anySelectable ? 'pointer' : 'default'
                return (
                <div key={i} style={{ width: 60, fontSize: 8, color: '#ccc', textAlign: 'center', cursor: cardCursor, border: cardBorder, borderRadius: 4, padding: 2, opacity: cardOpacity }}
                  onClick={() => {
                    if (!graveSelectMode) return
                    if (graveSelectMode.action === 'witch_revive' && gc.data.type !== 'monster') return
                    const g = { ...game }
                    const grave = graveSelectMode.owner === 'my' ? g.myGrave : g.oppGrave
                    if (graveSelectMode.action === 'jigoku_sinpan') {
                      if (g.pendingEffect?.type === 'coin_toss') {
                        g.pendingEffect = { ...g.pendingEffect, graveIndex: i }
                      }
                      setGame({ ...g }); setShowGrave(null); setGraveSelectMode(null); setMessage(''); return
                    }
                    if (fieldMonsterCount(g, graveSelectMode.owner) >= MAX_FIELD_MONSTERS) { setMessage('フィールドのモンスターは5体までです'); return }
                    if (graveSelectMode.action === 'dragon_revive') {
                      if (gc.data.type !== 'monster' || !gc.data.name.includes('ドラゴン')) { setMessage('ドラゴンを選択してください'); return }
                      const revived = grave[i]
                      const backZone = graveSelectMode.owner === 'my' ? 'myBack' : 'oppBack'
                      const frontZone = graveSelectMode.owner === 'my' ? 'myFront' : 'oppFront'
                      const backArr = [...getZoneArr(g, backZone)]
                      const frontArr = [...getZoneArr(g, frontZone)]
                      const emptyBack = backArr.findIndex(c => c === null)
                      const emptyFront = frontArr.findIndex(c => c === null)
                      const targetZoneStr: string | null = emptyBack !== -1 ? backZone : emptyFront !== -1 ? frontZone : null
                      const targetIdx = emptyBack !== -1 ? emptyBack : emptyFront !== -1 ? emptyFront : -1
                      if (!targetZoneStr || targetIdx === -1) { setMessage('フィールドにスペースがありません'); return }
                      const arr = [...getZoneArr(g, targetZoneStr)]
                      arr[targetIdx] = toField(revived.data, revived.isAwake)
                      setZoneArr(g, targetZoneStr, arr)
                      if (graveSelectMode.owner === 'my') g.myGrave = g.myGrave.filter((_, idx) => idx !== i)
                      else g.oppGrave = g.oppGrave.filter((_, idx) => idx !== i)
                      addLog(g, `巨竜の再来：「${revived.data.name}」特殊召喚`)
                      setGame({ ...g }); setShowGrave(null); setGraveSelectMode(null); setMessage(''); return
                    }
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
                    arr[targetIdx] = { ...toField(revived.data, false), witchRevived: graveSelectMode.action === 'witch_revive' }
                    setZoneArr(g, targetZoneStr, arr)
                    if (graveSelectMode.owner === 'my') g.myGrave = g.myGrave.filter((_, idx) => idx !== i)
                    else g.oppGrave = g.oppGrave.filter((_, idx) => idx !== i)
                    g.pendingEffect = null
                    addLog(g, `「${revived.data.name}」特殊召喚${graveSelectMode.action === 'witch_revive' ? '（ターン終了時に墓地へ）' : ''}`)
                    if (graveSelectMode.action === 'witch_revive') {
                      const updatedGrave = graveSelectMode.owner === 'my' ? g.myGrave : g.oppGrave
                      const updBackArr = [...getZoneArr(g, backZone)]
                      const updFrontArr = [...getZoneArr(g, frontZone)]
                      if (updatedGrave.length > 0 && (updBackArr.some(c => c === null) || updFrontArr.some(c => c === null))) {
                        setGame({ ...g }); setMessage('続けて蘇生できます'); return
                      }
                    }
                    setGame({ ...g }); setShowGrave(null); setGraveSelectMode(null); setMessage('')
                  }}>
                  {(gc.data.img_sealed || gc.data.img) && <img src={gc.data.img_sealed ?? gc.data.img ?? ''} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 3 }} alt="" />}
                  <div>{gc.data.name}</div>
                </div>
              )
              })}
              {(showGrave === 'my' ? game.myGrave : game.oppGrave).length === 0 && <div style={{ color: '#555' }}>空</div>}
            </div>
            <button style={{ ...btn(), marginTop: 10 }} onClick={() => { setShowGrave(null); setGraveSelectMode(null) }}>閉じる</button>
          </div>
        </div>
      )}


      {/* コントロールバー */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3, flexShrink: 0 }}>
        <span style={{ color: isMyTurn ? '#e8c876' : '#888', fontSize: 11, fontWeight: 'bold' }}>
          {isMyTurn ? '自分のターン' : '相手のターン'}
        </span>
        <span style={{ color: '#444', fontSize: 10 }}>|</span>
        <span style={{ color: '#aaa', fontSize: 10 }}>{phaseLabel[game.phase]}</span>
        {!isMyTurn && aiRunning && (
          <span style={{ fontSize: 10, color: '#a84' }}>相手ターン実行中...</span>
        )}
        {game.isFirstTurn && (
          <span style={{ fontSize: 9, color: '#666' }}>先攻：バトルフェイズ不可</span>
        )}
      </div>

      {/* ドローモーダル */}
      {isMyTurn && game.phase === 'draw' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40 }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #554', borderRadius: 12, padding: '32px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ color: '#e8c876', fontSize: 24, fontWeight: 'bold', letterSpacing: '0.1em' }}>ドローフェイズ</div>
            <div style={{ color: '#666', fontSize: 16 }}>どちらのデッキからドローしますか？</div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              <button
                style={{ background: '#2a2a1a', border: '1px solid #554', color: '#e8c876', padding: '20px 40px', borderRadius: 8, fontSize: 18, cursor: 'pointer', fontWeight: 'bold' }}
                onClick={() => drawCard('monster')}
              >
                モンスターデッキ<br />
                <span style={{ fontSize: 14, color: '#888', fontWeight: 'normal' }}>残{game.myMonsterDeck.length}枚</span>
              </button>
              <button
                style={{ background: '#1a1a2a', border: '1px solid #446', color: '#aaf', padding: '20px 40px', borderRadius: 8, fontSize: 18, cursor: 'pointer', fontWeight: 'bold' }}
                onClick={() => drawCard('spell')}
              >
                魔法・トラップデッキ<br />
                <span style={{ fontSize: 14, color: '#888', fontWeight: 'normal' }}>残{game.mySpellDeck.length}枚</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 選択カード情報 / メッセージ */}
      <div style={{ flexShrink: 0, minHeight: 28, marginBottom: 2 }}>
        {isPendingTarget && !catSelectModalOpen && (
          <div style={{ background: '#2a1a00', border: '1px solid #e8c876', borderRadius: 4, padding: '3px 10px', fontSize: 10, color: '#e8c876' }}>
            {(game.pendingEffect as { message: string }).message}（対象をクリック）
          </div>
        )}

        {!isPendingTarget && !selCard && message && (
          <div style={{ color: '#f66', fontSize: 10, padding: '3px 0' }}>{message}</div>
        )}
      </div>

      {/* メインエリア：左サイドバー + フィールド + ログサイドバー */}
      <div style={{ display: 'flex', flex: 1, gap: 8, overflow: 'hidden', minHeight: 0 }}>

        {/* 左サイドバー：カード詳細 */}
        <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 6, padding: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1, overflowY: 'auto' }}>
            {selCard ? (
              <>
                {(() => {
                  const isField = 'data' in selCard
                  const cardData = isField ? (selCard as FieldCard).data : selCard as CardData
                  const isAwake = isField ? (selCard as FieldCard).isAwake : false
                  const imgUrl = isAwake ? (cardData.img_awake ?? cardData.img_sealed ?? cardData.img) : (cardData.img_sealed ?? cardData.img)
                  const name = isAwake && cardData.name_awake ? cardData.name_awake : cardData.name
                  const atkVal = isField ? (((isAwake ? cardData.atk_awake : cardData.atk_sealed) ?? 0) + (selCard as FieldCard).atkMod) : (cardData.atk_sealed ?? 0)
                  const defVal = isField ? (((isAwake ? cardData.def_awake : cardData.def_sealed) ?? 0) + (selCard as FieldCard).defMod) : (cardData.def_sealed ?? 0)
                  const effect = isAwake ? cardData.effect_awake : cardData.effect
                  const attr = cardData.attribute ?? ''
                  return (
                    <>
                      {imgUrl && <img src={imgUrl} style={{ width: 320, height: 320, objectFit: 'cover', borderRadius: 6, border: '1px solid #333' }} alt="" />}
                      {attr && <div style={{ fontSize: 11, color: ATTR_COLOR[attr] ?? '#888' }}>{attr}属性</div>}
                      <div style={{ fontSize: 12, color: '#e8c876', fontWeight: 'bold', textAlign: 'center', lineHeight: 1.4 }}>{name}</div>
                      {cardData.type === 'monster' && (
                        <div style={{ fontSize: 11, color: '#ccc' }}>ATK {atkVal} / DEF {defVal}</div>
                      )}
                      {isAwake && <div style={{ fontSize: 10, color: '#4f4', background: '#1a2a1a', padding: '2px 8px', borderRadius: 4 }}>覚醒中</div>}
                      {effect && (
                        <div style={{ fontSize: 13, color: '#bbb', lineHeight: 1.7, textAlign: 'left', width: '100%', borderTop: '1px solid #2a2a2a', paddingTop: 8, marginTop: 4 }}>
                          {effect}
                        </div>
                      )}
                      {/* フィールドカードの操作ボタン */}
                      {isField && sel?.zone === (isMyTurn ? 'myBack' : 'oppBack') && (selCard as FieldCard)?.data.id !== 'monster_lightning_whale_01' && (
                      <button
  style={{ ...btn('#2a4a2a', game.awakeDone), width: '100%', marginTop: 4, fontSize: 14, padding: '10px 0' }}
  onClick={() => !game.awakeDone && awakeMonster(sel!.zone as 'myBack'|'oppBack', sel!.index)}
  disabled={game.awakeDone}
>
  {game.awakeDone ? '覚醒済み（1回まで）' : '覚醒させる'}
</button>
                      )}
                      {isField && selIsMyField && (
                        <button style={{ ...btn('#2a2a4a'), width: '100%', fontSize: 14, padding: '10px 0' }} onClick={() => toggleStance(sel!.zone as 'myFront'|'myBack', sel!.index)}>表示変更</button>
                      )}
                      {isField && game.phase === 'battle' && selIsMyField && (
                        <div style={{ fontSize: 14, color: '#f88', textAlign: 'center' }}>→ 攻撃先を選択</div>
                      )}
                      {!isField && selCardIsMonster && (game.phase === 'main' || game.phase === 'main2') && isMyTurn && (
                <div style={{ fontSize: 14, color: game.normalSummonDone ? '#555' : '#8cf', textAlign: 'center' }}>
                  {game.normalSummonDone ? '通常召喚済み（1回まで）' : '→ 封印ゾーンをクリックで召喚'}
                </div>
              )}
                      {!isField && selCardIsSpell && (game.phase === 'main' || game.phase === 'main2') && (
                        <div style={{ fontSize: 14, color: '#8cf', textAlign: 'center' }}>→ 魔法/罠ゾーンをクリック</div>
                      )}
                    </>
                  )
                })()}
              </>
            ) : (
              <div style={{ color: '#333', fontSize: 10, textAlign: 'center', marginTop: 80, lineHeight: 1.8 }}>カードを選択すると<br />ここに詳細が<br />表示されます</div>
            )}
          </div>
        </div>

        {/* フィールド */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden' }}>

          {/* 相手LP */}
          <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 4, padding: '2px 10px', textAlign: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 9, color: '#555' }}>相手 LP </span>
            <span style={{ fontSize: 16, color: '#e8c876', fontWeight: 'bold' }}>{game.oppLP}</span>
          </div>

          {/* 相手手札 */}
          <div style={{ flexShrink: 0 }}>
            <div style={labelStyle}>相手 手札</div>
            <div style={{ ...rowStyle, justifyContent: 'center' }}>
              {game.oppHand.map((_, i) => (
                <div key={i} style={{ width: CW, height: CH, borderRadius: 5, border: '1px solid #333', overflow: 'hidden', flexShrink: 0 }}>
                  <img src="https://kttszcizyccenutwgdch.supabase.co/storage/v1/object/public/cards/card_back.png" style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                </div>
              ))}
            </div>
          </div>

          {/* 相手 魔法・トラップ */}
          <div style={{ flexShrink: 0 }}>
            <div style={labelStyle}>相手 魔法・トラップ</div>
            <div style={rowStyle}>
              {game.oppSpellZone.map((fc, i) => renderSpellZoneCard(fc, 'oppSpellZone', i))}
              <div style={deckBox}>
                <div style={{ fontSize: 8 }}>魔法/罠</div>
                <div style={{ fontSize: 12 }}>{game.oppSpellDeck.length}</div>
              </div>
            </div>
          </div>

          {/* 相手 後列（封印） */}
          <div style={{ flexShrink: 0 }}>
            <div style={labelStyle}>相手 後列（封印）</div>
            <div style={rowStyle}>
              {game.oppBack.map((fc, i) => renderFieldCard(fc, 'oppBack', i, '#445'))}
              <div style={graveBox} onClick={() => setShowGrave('opp')}>
                <div style={{ fontSize: 8 }}>墓地</div>
                <div style={{ fontSize: 12 }}>{game.oppGrave.length}</div>
              </div>
            </div>
          </div>

          {/* 相手 前列（覚醒） */}
          <div style={{ flexShrink: 0 }}>
            <div style={labelStyle}>相手 前列（覚醒）</div>
            <div style={rowStyle}>
              {game.oppFront.map((fc, i) => renderFieldCard(fc, 'oppFront', i, '#4a8'))}
              <div style={deckBox}>
                <div style={{ fontSize: 8 }}>モンスターデッキ</div>
                <div style={{ fontSize: 12 }}>{game.oppMonsterDeck.length}</div>
              </div>
            </div>
          </div>

          {/* VS */}
          <div style={{ height: 12, flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ height: 1, background: '#2a2a2a', width: '100%', position: 'absolute' }} />
            <span style={{ background: '#0f0f0f', padding: '0 8px', color: '#444', fontSize: 9, position: 'relative' }}>VS</span>
          </div>

          {/* 自分 前列（覚醒） */}
          <div style={{ flexShrink: 0 }}>
            <div style={labelStyle}>自分 前列（覚醒）</div>
            <div style={rowStyle}>
              {game.myFront.map((fc, i) => renderFieldCard(fc, 'myFront', i, '#4a8'))}
              <div style={{ ...deckBox, cursor: 'pointer' }} onClick={() => drawCard('monster')}>
                <div style={{ fontSize: 8 }}>モンスターデッキ</div>
                <div style={{ fontSize: 12 }}>{game.myMonsterDeck.length}</div>
              </div>
            </div>
          </div>

          {/* 自分 後列（封印） */}
          <div style={{ flexShrink: 0 }}>
            <div style={labelStyle}>自分 後列（封印）</div>
            <div style={rowStyle}>
              {game.myBack.map((fc, i) => renderFieldCard(fc, 'myBack', i, '#445'))}
              <div style={graveBox} onClick={() => setShowGrave('my')}>
                <div style={{ fontSize: 8 }}>墓地</div>
                <div style={{ fontSize: 12 }}>{game.myGrave.length}</div>
              </div>
            </div>
          </div>

          {/* 自分 魔法・トラップ */}
          <div style={{ flexShrink: 0 }}>
            <div style={labelStyle}>自分 魔法・トラップ</div>
            <div style={rowStyle}>
              {game.mySpellZone.map((fc, i) => renderSpellZoneCard(fc, 'mySpellZone', i))}
              <div style={{ ...deckBox, cursor: 'pointer' }} onClick={() => drawCard('spell')}>
                <div style={{ fontSize: 8 }}>魔法/罠</div>
                <div style={{ fontSize: 12 }}>{game.mySpellDeck.length}</div>
              </div>
            </div>
          </div>

          {/* 自分手札 */}
          <div style={{ flexShrink: 0 }}>
            <div style={labelStyle}>自分 手札</div>
            <div style={{ ...rowStyle, justifyContent: 'center' }}>
              {game.myHand.map((c, i) => renderHandCard(c, 'myHand', i))}
            </div>
          </div>

          {/* 自分LP */}
          <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 4, padding: '2px 10px', textAlign: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 9, color: '#555' }}>自分 LP </span>
            <span style={{ fontSize: 16, color: '#e8c876', fontWeight: 'bold' }}>{game.myLP}</span>
          </div>

        </div>

        {/* ログ＋フェーズボタン列 */}
        <div style={{ width: 180, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ flex: 1, minHeight: 0, background: '#111', border: '1px solid #222', borderRadius: 6, padding: 8, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 9, color: '#444', marginBottom: 4 }}>ログ</div>
            {game.log.map((l, i) => (
              <div key={i} style={{ fontSize: 9, color: i === 0 ? '#e8c876' : '#444', lineHeight: 1.4, borderBottom: i === 0 ? '1px solid #2a2a2a' : 'none', paddingBottom: i === 0 ? 4 : 0, marginBottom: i === 0 ? 4 : 0 }}>{l}</div>
            ))}
          </div>
          {isMyTurn && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              {game.phase === 'main' && !game.isFirstTurn && (
                <button
                  onClick={() => { const g = { ...game }; g.phase = 'battle'; addLog(g, 'バトル開始'); setGame({ ...g }) }}
                  style={{ width: '100%', background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: 6, padding: '10px 0', fontSize: 13, fontWeight: 'bold', cursor: 'pointer' }}
                >
                  バトルへ
                </button>
              )}
              <button
                onClick={nextPhase}
                style={{
                  width: '100%', border: 'none', borderRadius: 6,
                  padding: '10px 0', fontSize: 13, fontWeight: 'bold', cursor: 'pointer',
                  background: game.phase === 'main2' ? '#e8c876' : '#446',
                  color: game.phase === 'main2' ? '#0f0f0f' : '#fff',
                }}
              >
                {game.phase === 'main2' ? 'ターン終了' : 'メイン2へ'}
              </button>
            </div>
          )}
        </div>

      </div>
    </main>
  )
}