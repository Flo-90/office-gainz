export type UserProfile = {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  created_at?: string
}

export type Exercise = {
  id: string
  name: string
  created_by: string | null
  created_at: string
}

export type Entry = {
  id: string
  user_id: string
  exercise_id: string
  reps: number
  created_at: string
}

export type LeaderboardRow = {
  userId: string
  name: string
  avatarUrl: string | null
  totalReps: number
}

export type UserExerciseBreakdownRow = {
  exerciseId: string
  exerciseName: string
  totalReps: number
}

export type RestDaySource = 'manual' | 'recurring'

export type StreakSummary = {
  userId: string
  currentStreak: number
  longestStreak: number
  lastActiveDate: string | null
  activeToday: boolean
  atRiskToday: boolean
  todayIsRestDay: boolean
  todayRestDaySource: RestDaySource | null
  restDaysUsedThisWeek: number
  restDaysQuota: number
  recurringRestWeekdays: number[]
}

export type NotificationPreferences = {
  pushEnabled: boolean
  dailyNudge15h: boolean
  leaderboardOvertakenToday: boolean
  streakAtRisk15h: boolean
}

export type PushState = {
  publicKey: string | null
  preferences: NotificationPreferences
  hasActiveSubscription: boolean
  subscriptionCount: number
}

export type LeaderboardMode = 'total' | 'exercise'

export type Timeframe = 'today' | 'week' | 'all'
