export const pushCopy = {
  dailyNudge: {
    title: 'Der Kessel muss brennen!',
    body() {
      return `Attacke! Dein Kessel hat heute noch nicht gebrannt.`
    },
  },
  overtaken: {
    title: 'Huppla, jemand hat dich überholt',
    body(actorName: string, actorTotal: number) {
      return `${actorName} liegt jetzt bei ${actorTotal} Reps.`
    },
  },
  streakAtRisk: {
    title: 'Nicht heute. Deine Streak lebt noch.',
    body(streakDays: number) {
      return `Deine ${streakDays}-Tage-Streak kann heute noch gerettet werden. Ein schneller Satz reicht.`
    },
  },
} as const