import { supabase } from './supabaseClient'
import { formatSupabaseErrorMessage } from './supabaseErrors'
import { startOfDay, startOfWeek } from './time'
import type { Exercise, LeaderboardRow, Timeframe, UserProfile } from './types'

type EntryRow = {
  reps: number
  user_id: string
  user:
    | Pick<UserProfile, 'id' | 'name' | 'avatar_url'>
    | Array<Pick<UserProfile, 'id' | 'name' | 'avatar_url'>>
    | null
}

export async function fetchExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw new Error(formatSupabaseErrorMessage(error))
  return (data ?? []) as Exercise[]
}

export async function createExercise(
  name: string,
  userId: string,
): Promise<Exercise> {
  const { data, error } = await supabase
    .from('exercises')
    .insert({ name, created_by: userId })
    .select()
    .single()

  if (error) throw new Error(formatSupabaseErrorMessage(error))
  return data as Exercise
}

export async function logEntry(
  userId: string,
  exerciseId: string,
  reps: number,
): Promise<void> {
  const { error } = await supabase
    .from('entries')
    .insert({ user_id: userId, exercise_id: exerciseId, reps })

  if (error) throw new Error(formatSupabaseErrorMessage(error))
}

export async function fetchUserTotal(
  userId: string,
  since?: Date,
): Promise<number> {
  let query = supabase.from('entries').select('reps').eq('user_id', userId)
  if (since) {
    query = query.gte('created_at', since.toISOString())
  }

  const { data, error } = await query
  if (error) throw new Error(formatSupabaseErrorMessage(error))

  return (data ?? []).reduce((sum, row) => sum + row.reps, 0)
}

export async function fetchLeaderboard(
  timeframe: Timeframe,
): Promise<LeaderboardRow[]> {
  let query = supabase
    .from('entries')
    .select(
      'reps, user_id, user:users!entries_user_id_fkey ( id, name, avatar_url )',
    )

  if (timeframe === 'today') {
    query = query.gte('created_at', startOfDay().toISOString())
  }

  if (timeframe === 'week') {
    query = query.gte('created_at', startOfWeek().toISOString())
  }

  const { data, error } = await query
  if (error) throw new Error(formatSupabaseErrorMessage(error))

  const totals = new Map<string, LeaderboardRow>()
  ;(data as EntryRow[] | null)?.forEach((row) => {
    const profile = Array.isArray(row.user) ? row.user[0] : row.user
    if (!profile) return
    const existing = totals.get(profile.id)
    if (existing) {
      existing.totalReps += row.reps
    } else {
      totals.set(profile.id, {
        userId: profile.id,
        name: profile.name ?? 'Mystery Lifter',
        avatarUrl: profile.avatar_url ?? null,
        totalReps: row.reps,
      })
    }
  })

  return Array.from(totals.values()).sort((a, b) => {
    if (b.totalReps !== a.totalReps) {
      return b.totalReps - a.totalReps
    }
    return a.name.localeCompare(b.name)
  })
}
