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

export type NotificationPreferences = {
  pushEnabled: boolean
  dailyNudge15h: boolean
  leaderboardOvertakenToday: boolean
}

export type PushState = {
  publicKey: string | null
  preferences: NotificationPreferences
  hasActiveSubscription: boolean
  subscriptionCount: number
}

export type Timeframe = 'today' | 'week' | 'all'
