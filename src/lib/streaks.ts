export type StreakTitle = {
  key: string
  label: string
  minDays: number
}

export const STREAK_PUSH_THRESHOLD_DAYS = 7

const streakTitles: StreakTitle[] = [
  { key: 'fresh_start', label: 'Lauch', minDays: 0 },
  { key: 'serienzuender', label: 'Pumped Potato', minDays: 3 },
  { key: 'kessel_kapitaen', label: 'Zündkerze', minDays: 7 },
  { key: 'streakmaschine', label: 'Pump Warrior', minDays: 14 },
  { key: 'unzerstoerbar', label: 'Kessel-Meister', minDays: 30 },
]

export function getStreakTitle(streakDays: number) {
  for (let index = streakTitles.length - 1; index >= 0; index -= 1) {
    const title = streakTitles[index]

    if (streakDays >= title.minDays) {
      return title
    }
  }

  return streakTitles[0]
}