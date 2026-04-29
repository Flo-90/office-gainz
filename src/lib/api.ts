import { supabase } from './supabaseClient'
import { formatSupabaseErrorMessage } from './supabaseErrors'
import { startOfDay, startOfWeek } from './time'
import type { Exercise, LeaderboardRow, Timeframe, UserProfile } from './types'

type CacheOptions = {
  force?: boolean
}

type CacheEntry<T> = {
  value?: T
  hasValue: boolean
  invalidated: boolean
  promise: Promise<T> | null
}

type DataUpdateEvent = {
  resource: 'entries' | 'exercises'
}

type EntryRow = {
  reps: number
  user_id: string
  user:
    | Pick<UserProfile, 'id' | 'name' | 'avatar_url'>
    | Array<Pick<UserProfile, 'id' | 'name' | 'avatar_url'>>
    | null
}

const exercisesCache = createCacheEntry<Exercise[]>()
const userTotalsCache = new Map<string, CacheEntry<number>>()
const leaderboardCache = new Map<Timeframe, CacheEntry<LeaderboardRow[]>>()
const dataUpdateListeners = new Set<(event: DataUpdateEvent) => void>()

function createCacheEntry<T>(): CacheEntry<T> {
  return {
    hasValue: false,
    invalidated: true,
    promise: null,
  }
}

function getCacheSnapshot<T>(entry?: CacheEntry<T>): T | null {
  if (!entry?.hasValue) {
    return null
  }

  return entry.value as T
}

async function resolveCachedValue<T>(
  entry: CacheEntry<T>,
  load: () => Promise<T>,
  options?: CacheOptions,
): Promise<T> {
  if (!options?.force && entry.hasValue && !entry.invalidated) {
    return entry.value as T
  }

  if (entry.promise) {
    return entry.promise
  }

  entry.promise = load()
    .then((value) => {
      entry.value = value
      entry.hasValue = true
      entry.invalidated = false

      return value
    })
    .finally(() => {
      entry.promise = null
    })

  return entry.promise
}

function getUserTotalCacheKey(userId: string, since?: Date) {
  return `${userId}:${since ? since.toISOString() : 'all'}`
}

function getUserTotalCacheEntry(userId: string, since?: Date) {
  const key = getUserTotalCacheKey(userId, since)
  let entry = userTotalsCache.get(key)

  if (!entry) {
    entry = createCacheEntry<number>()
    userTotalsCache.set(key, entry)
  }

  return entry
}

function getLeaderboardCacheEntry(timeframe: Timeframe) {
  let entry = leaderboardCache.get(timeframe)

  if (!entry) {
    entry = createCacheEntry<LeaderboardRow[]>()
    leaderboardCache.set(timeframe, entry)
  }

  return entry
}

function sortExercises(exercises: Exercise[]) {
  return [...exercises].sort((left, right) =>
    left.name.localeCompare(right.name),
  )
}

function invalidateEntriesCache() {
  userTotalsCache.forEach((entry) => {
    entry.invalidated = true
  })

  leaderboardCache.forEach((entry) => {
    entry.invalidated = true
  })
}

function invalidateExercisesCache() {
  exercisesCache.invalidated = true
}

function emitDataUpdate(event: DataUpdateEvent) {
  dataUpdateListeners.forEach((listener) => {
    listener(event)
  })
}

export function getExercisesSnapshot() {
  return getCacheSnapshot(exercisesCache)
}

export function getUserTotalSnapshot(userId: string, since?: Date) {
  return getCacheSnapshot(userTotalsCache.get(getUserTotalCacheKey(userId, since)))
}

export function getLeaderboardSnapshot(timeframe: Timeframe) {
  return getCacheSnapshot(leaderboardCache.get(timeframe))
}

export function subscribeToDataUpdates(
  listener: (event: DataUpdateEvent) => void,
) {
  dataUpdateListeners.add(listener)

  return () => {
    dataUpdateListeners.delete(listener)
  }
}

export function notifyEntriesChanged() {
  invalidateEntriesCache()
  emitDataUpdate({ resource: 'entries' })
}

export function notifyExercisesChanged() {
  invalidateExercisesCache()
  emitDataUpdate({ resource: 'exercises' })
}

export async function fetchExercises(
  options?: CacheOptions,
): Promise<Exercise[]> {
  return resolveCachedValue(
    exercisesCache,
    async () => {
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .order('name', { ascending: true })

      if (error) throw new Error(formatSupabaseErrorMessage(error))
      return (data ?? []) as Exercise[]
    },
    options,
  )
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

  const exercise = data as Exercise

  if (exercisesCache.hasValue) {
    exercisesCache.value = sortExercises([
      ...(exercisesCache.value as Exercise[]),
      exercise,
    ])
    exercisesCache.invalidated = false
  } else {
    invalidateExercisesCache()
  }

  return exercise
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

  invalidateEntriesCache()
}

export async function fetchUserTotal(
  userId: string,
  since?: Date,
  options?: CacheOptions,
): Promise<number> {
  return resolveCachedValue(
    getUserTotalCacheEntry(userId, since),
    async () => {
      let query = supabase.from('entries').select('reps').eq('user_id', userId)
      if (since) {
        query = query.gte('created_at', since.toISOString())
      }

      const { data, error } = await query
      if (error) throw new Error(formatSupabaseErrorMessage(error))

      return (data ?? []).reduce((sum, row) => sum + row.reps, 0)
    },
    options,
  )
}

export async function fetchLeaderboard(
  timeframe: Timeframe,
  options?: CacheOptions,
): Promise<LeaderboardRow[]> {
  return resolveCachedValue(
    getLeaderboardCacheEntry(timeframe),
    async () => {
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
    },
    options,
  )
}
