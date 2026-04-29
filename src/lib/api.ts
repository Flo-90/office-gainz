import { supabase } from './supabaseClient'
import { formatSupabaseErrorMessage } from './supabaseErrors'
import { startOfDay, startOfWeek } from './time'
import type {
  Exercise,
  LeaderboardRow,
  Timeframe,
  UserExerciseBreakdownRow,
} from './types'

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

type LeaderboardRpcRow = {
  user_id: string
  name: string | null
  avatar_url: string | null
  total_reps: number | string | null
}

type UserExerciseBreakdownRpcRow = {
  exercise_id: string
  exercise_name: string
  total_reps: number | string | null
}

const exercisesCache = createCacheEntry<Exercise[]>()
const userTotalsCache = new Map<string, CacheEntry<number>>()
const leaderboardCache = new Map<string, CacheEntry<LeaderboardRow[]>>()
const userExerciseBreakdownCache = new Map<
  string,
  CacheEntry<UserExerciseBreakdownRow[]>
>()
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

function getSinceForTimeframe(timeframe: Timeframe) {
  if (timeframe === 'today') {
    return startOfDay()
  }

  if (timeframe === 'week') {
    return startOfWeek()
  }

  return undefined
}

function getLeaderboardCacheKey(
  timeframe: Timeframe,
  exerciseId?: string | null,
) {
  return `${timeframe}:${exerciseId ?? 'all'}`
}

function getLeaderboardCacheEntry(
  timeframe: Timeframe,
  exerciseId?: string | null,
) {
  const key = getLeaderboardCacheKey(timeframe, exerciseId)
  let entry = leaderboardCache.get(key)

  if (!entry) {
    entry = createCacheEntry<LeaderboardRow[]>()
    leaderboardCache.set(key, entry)
  }

  return entry
}

function getUserExerciseBreakdownCacheKey(
  userId: string,
  timeframe: Timeframe,
) {
  return `${userId}:${timeframe}`
}

function getUserExerciseBreakdownCacheEntry(
  userId: string,
  timeframe: Timeframe,
) {
  const key = getUserExerciseBreakdownCacheKey(userId, timeframe)
  let entry = userExerciseBreakdownCache.get(key)

  if (!entry) {
    entry = createCacheEntry<UserExerciseBreakdownRow[]>()
    userExerciseBreakdownCache.set(key, entry)
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

  userExerciseBreakdownCache.forEach((entry) => {
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

export function getLeaderboardSnapshot(
  timeframe: Timeframe,
  exerciseId?: string | null,
) {
  return getCacheSnapshot(
    leaderboardCache.get(getLeaderboardCacheKey(timeframe, exerciseId)),
  )
}

export function getUserExerciseBreakdownSnapshot(
  userId: string,
  timeframe: Timeframe,
) {
  return getCacheSnapshot(
    userExerciseBreakdownCache.get(
      getUserExerciseBreakdownCacheKey(userId, timeframe),
    ),
  )
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
  exerciseId?: string | null,
  options?: CacheOptions,
): Promise<LeaderboardRow[]> {
  const since = getSinceForTimeframe(timeframe)

  return resolveCachedValue(
    getLeaderboardCacheEntry(timeframe, exerciseId),
    async () => {
      const { data, error } = await supabase.rpc('get_leaderboard_totals', {
        filter_since: since?.toISOString() ?? null,
        filter_exercise_id: exerciseId ?? null,
      })

      if (error) throw new Error(formatSupabaseErrorMessage(error))

      return ((data ?? []) as LeaderboardRpcRow[])
        .map((row) => ({
          userId: row.user_id,
          name: row.name ?? 'Mystery Lifter',
          avatarUrl: row.avatar_url ?? null,
          totalReps: Number(row.total_reps ?? 0),
        }))
        .sort((a, b) => {
        if (b.totalReps !== a.totalReps) {
          return b.totalReps - a.totalReps
        }
        return a.name.localeCompare(b.name)
      })
    },
    options,
  )
}

export async function fetchUserExerciseBreakdown(
  userId: string,
  timeframe: Timeframe,
  options?: CacheOptions,
): Promise<UserExerciseBreakdownRow[]> {
  const since = getSinceForTimeframe(timeframe)

  return resolveCachedValue(
    getUserExerciseBreakdownCacheEntry(userId, timeframe),
    async () => {
      const { data, error } = await supabase.rpc('get_user_exercise_breakdown', {
        filter_user_id: userId,
        filter_since: since?.toISOString() ?? null,
      })

      if (error) throw new Error(formatSupabaseErrorMessage(error))

      return ((data ?? []) as UserExerciseBreakdownRpcRow[])
        .map((row) => ({
          exerciseId: row.exercise_id,
          exerciseName: row.exercise_name,
          totalReps: Number(row.total_reps ?? 0),
        }))
        .sort((a, b) => {
          if (b.totalReps !== a.totalReps) {
            return b.totalReps - a.totalReps
          }

          return a.exerciseName.localeCompare(b.exerciseName)
        })
    },
    options,
  )
}
