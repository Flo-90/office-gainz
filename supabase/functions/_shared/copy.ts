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
} as const