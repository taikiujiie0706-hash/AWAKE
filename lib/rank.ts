export const RANK_THRESHOLDS: { wins: number; rank: string }[] = [
  { wins: 320, rank: 'S' },
  { wins: 160, rank: 'A' },
  { wins: 80, rank: 'B' },
  { wins: 40, rank: 'C' },
  { wins: 20, rank: 'D' },
  { wins: 10, rank: 'E' },
]

export function getRank(wins: number): string | null {
  for (const t of RANK_THRESHOLDS) {
    if (wins >= t.wins) return t.rank
  }
  return null
}
