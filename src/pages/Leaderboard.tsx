import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react'
import LeaderboardUserSheet from '../components/LeaderboardUserSheet'
import { useAuth } from '../contexts/useAuth'
import {
  fetchExercises,
  fetchLeaderboard,
  fetchUserExerciseBreakdown,
  getExercisesSnapshot,
  getLeaderboardSnapshot,
  getUserExerciseBreakdownSnapshot,
  subscribeToDataUpdates,
} from '../lib/api'
import { appCopy } from '../lib/copy'
import type {
  Exercise,
  LeaderboardMode,
  LeaderboardRow,
  Timeframe,
  UserExerciseBreakdownRow,
} from '../lib/types'

const formatter = new Intl.NumberFormat()

const timeframeOptions: Array<{ value: Timeframe; label: string }> = [
  { value: 'today', label: appCopy.leaderboardPage.timeframes.today },
  { value: 'week', label: appCopy.leaderboardPage.timeframes.week },
  { value: 'all', label: appCopy.leaderboardPage.timeframes.all },
]

const leaderboardModes: Array<{ value: LeaderboardMode; label: string }> = [
  { value: 'total', label: appCopy.leaderboardPage.modes.total },
  { value: 'exercise', label: appCopy.leaderboardPage.modes.exercise },
]

export default function LeaderboardPage() {
  const { session } = useAuth()
  const [timeframe, setTimeframe] = useState<Timeframe>('today')
  const [mode, setMode] = useState<LeaderboardMode>('total')
  const [exerciseOptions, setExerciseOptions] = useState<Exercise[]>(
    () => getExercisesSnapshot() ?? [],
  )
  const [exercisesLoading, setExercisesLoading] = useState(
    () => getExercisesSnapshot() === null,
  )
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(
    () => getExercisesSnapshot()?.[0]?.id ?? null,
  )
  const [rows, setRows] = useState<LeaderboardRow[]>(
    () => getLeaderboardSnapshot('today', null) ?? [],
  )
  const [loading, setLoading] = useState(
    () => getLeaderboardSnapshot('today', null) === null,
  )
  const [error, setError] = useState<string | null>(null)
  const [selectedUser, setSelectedUser] = useState<{
    userId: string
    name: string
    avatarUrl: string | null
  } | null>(null)
  const [breakdownRows, setBreakdownRows] = useState<UserExerciseBreakdownRow[]>([])
  const [breakdownLoading, setBreakdownLoading] = useState(false)
  const [breakdownError, setBreakdownError] = useState<string | null>(null)

  const activeExerciseId = mode === 'exercise' ? selectedExerciseId : null
  const activeExercise = useMemo(
    () =>
      exerciseOptions.find((exercise) => exercise.id === selectedExerciseId) ??
      null,
    [exerciseOptions, selectedExerciseId],
  )

  const applyLeaderboardSnapshot = useCallback(
    (
      nextTimeframe: Timeframe,
      nextMode: LeaderboardMode,
      nextExerciseId: string | null,
    ) => {
      const exerciseId = nextMode === 'exercise' ? nextExerciseId : null

      if (nextMode === 'exercise' && !exerciseId) {
        setRows([])
        setLoading(exercisesLoading)
        return
      }

      const cachedRows = getLeaderboardSnapshot(nextTimeframe, exerciseId)

      if (cachedRows !== null) {
        setRows(cachedRows)
        setLoading(false)
        return
      }

      setRows([])
      setLoading(true)
    },
    [exercisesLoading],
  )

  const applyBreakdownSnapshot = useCallback(
    (userId: string, nextTimeframe: Timeframe) => {
      const cachedRows = getUserExerciseBreakdownSnapshot(userId, nextTimeframe)

      if (cachedRows !== null) {
        setBreakdownRows(cachedRows)
        setBreakdownLoading(false)
        return
      }

      setBreakdownRows([])
      setBreakdownLoading(true)
    },
    [],
  )

  const loadExerciseOptions = useCallback(async (options?: { force?: boolean }) => {
    if (getExercisesSnapshot() === null) {
      setExercisesLoading(true)
    }

    try {
      const data = await fetchExercises(options)
      setExerciseOptions(data)
      setSelectedExerciseId((current) => {
        if (data.some((exercise) => exercise.id === current)) {
          return current
        }

        return data[0]?.id ?? null
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : appCopy.leaderboardPage.exerciseLoadError,
      )
    } finally {
      setExercisesLoading(false)
    }
  }, [])

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    const exerciseId = mode === 'exercise' ? selectedExerciseId : null

    if (mode === 'exercise' && !exerciseId) {
      setRows([])
      setLoading(exercisesLoading)
      return
    }

    if (getLeaderboardSnapshot(timeframe, exerciseId) === null) {
      setLoading(true)
    }

    try {
      const data = await fetchLeaderboard(timeframe, exerciseId, options)
      setRows(data)
      setError(null)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : appCopy.leaderboardPage.loadError,
      )
    } finally {
      setLoading(false)
    }
  }, [exercisesLoading, mode, selectedExerciseId, timeframe])

  const refreshBreakdown = useCallback(async (options?: { force?: boolean }) => {
    if (!selectedUser) return

    if (getUserExerciseBreakdownSnapshot(selectedUser.userId, timeframe) === null) {
      setBreakdownLoading(true)
    }

    try {
      const data = await fetchUserExerciseBreakdown(
        selectedUser.userId,
        timeframe,
        options,
      )
      setBreakdownRows(data)
      setBreakdownError(null)
    } catch (err) {
      setBreakdownError(
        err instanceof Error
          ? err.message
          : appCopy.leaderboardPage.breakdownLoadError,
      )
    } finally {
      setBreakdownLoading(false)
    }
  }, [selectedUser, timeframe])

  const handleTimeframeChange = (nextTimeframe: Timeframe) => {
    setTimeframe(nextTimeframe)
    applyLeaderboardSnapshot(nextTimeframe, mode, selectedExerciseId)

    if (selectedUser) {
      applyBreakdownSnapshot(selectedUser.userId, nextTimeframe)
    }
  }

  const handleModeChange = (nextMode: LeaderboardMode) => {
    const nextExerciseId =
      nextMode === 'exercise'
        ? selectedExerciseId ?? exerciseOptions[0]?.id ?? null
        : null

    setMode(nextMode)

    if (nextMode === 'exercise' && nextExerciseId !== selectedExerciseId) {
      setSelectedExerciseId(nextExerciseId)
    }

    applyLeaderboardSnapshot(timeframe, nextMode, nextExerciseId)
  }

  const handleExerciseChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextExerciseId = event.target.value || null

    setSelectedExerciseId(nextExerciseId)
    applyLeaderboardSnapshot(timeframe, 'exercise', nextExerciseId)
  }

  const handleUserSelect = (row: LeaderboardRow) => {
    setSelectedUser({
      userId: row.userId,
      name: row.name,
      avatarUrl: row.avatarUrl,
    })
    setBreakdownError(null)
    applyBreakdownSnapshot(row.userId, timeframe)
  }

  const handleCloseUserSheet = () => {
    setSelectedUser(null)
    setBreakdownRows([])
    setBreakdownLoading(false)
    setBreakdownError(null)
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void loadExerciseOptions()
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [loadExerciseOptions])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void refresh()
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [refresh])

  useEffect(() => {
    if (!selectedUser) return

    const frame = window.requestAnimationFrame(() => {
      void refreshBreakdown()
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [refreshBreakdown, selectedUser])

  useEffect(() => {
    const unsubscribe = subscribeToDataUpdates((event) => {
      if (event.resource === 'entries') {
        void refresh({ force: true })
        if (selectedUser) {
          void refreshBreakdown({ force: true })
        }
        return
      }

      if (event.resource === 'exercises') {
        void loadExerciseOptions({ force: true })
      }
    })

    return unsubscribe
  }, [loadExerciseOptions, refresh, refreshBreakdown, selectedUser])

  const currentUserId = session?.user.id
  const currentRank = useMemo(() => {
    if (!currentUserId) return null
    const index = rows.findIndex((row) => row.userId === currentUserId)
    return index >= 0 ? index + 1 : null
  }, [rows, currentUserId])

  const selectedUserCurrentRow = useMemo(() => {
    if (!selectedUser) return null

    return rows.find((row) => row.userId === selectedUser.userId) ?? null
  }, [rows, selectedUser])

  const selectedUserCurrentRank = useMemo(() => {
    if (!selectedUser) return null

    const index = rows.findIndex((row) => row.userId === selectedUser.userId)
    return index >= 0 ? index + 1 : null
  }, [rows, selectedUser])

  const breakdownTotal = useMemo(
    () => breakdownRows.reduce((sum, row) => sum + row.totalReps, 0),
    [breakdownRows],
  )

  const activeExerciseBreakdown = useMemo(() => {
    if (!selectedExerciseId) return null

    return (
      breakdownRows.find((row) => row.exerciseId === selectedExerciseId) ?? null
    )
  }, [breakdownRows, selectedExerciseId])

  const timeframeLabel = useMemo(
    () =>
      timeframeOptions.find((option) => option.value === timeframe)?.label ??
      timeframe,
    [timeframe],
  )

  const detailSliceLabel = appCopy.leaderboardPage.userSheet.buildSliceLabel(
    mode === 'exercise' ? activeExercise?.name ?? null : null,
  )

  const detailSliceReps = selectedUserCurrentRow
    ? selectedUserCurrentRow.totalReps
    : mode === 'exercise'
      ? activeExerciseBreakdown?.totalReps ?? 0
      : breakdownTotal

  const emptyStateMessage =
    mode === 'exercise' && activeExercise
      ? appCopy.leaderboardPage.exerciseEmptyState(activeExercise.name)
      : mode === 'exercise' && !exerciseOptions.length
        ? appCopy.leaderboardPage.noExercisesAvailable
        : appCopy.leaderboardPage.emptyState

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-800 bg-slate-900/60 px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">{appCopy.leaderboardPage.title}</h2>
            <p className="text-sm text-slate-400">
              {appCopy.leaderboardPage.subtitle}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {appCopy.leaderboardPage.tapUserHint}
            </p>
          </div>
          <div className="flex gap-2 rounded-full border border-slate-800 bg-slate-950 p-1">
            {timeframeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleTimeframeChange(option.value)}
                className={[
                  'rounded-full px-3 py-1 text-xs font-semibold transition',
                  timeframe === option.value
                    ? 'bg-emerald-400/20 text-emerald-200'
                    : 'text-slate-400 hover:text-slate-200',
                ].join(' ')}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-2 rounded-full border border-slate-800 bg-slate-950 p-1">
            {leaderboardModes.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleModeChange(option.value)}
                className={[
                  'rounded-full px-3 py-1 text-xs font-semibold transition',
                  mode === option.value
                    ? 'bg-emerald-400/20 text-emerald-200'
                    : 'text-slate-400 hover:text-slate-200',
                ].join(' ')}
              >
                {option.label}
              </button>
            ))}
          </div>

          {mode === 'exercise' ? (
            <label className="flex items-center gap-3 text-sm text-slate-300">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                {appCopy.leaderboardPage.exerciseFilterLabel}
              </span>
              <select
                value={selectedExerciseId ?? ''}
                onChange={handleExerciseChange}
                disabled={exercisesLoading || exerciseOptions.length === 0}
                className="min-w-[180px] rounded-full border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {exerciseOptions.map((exercise) => (
                  <option key={exercise.id} value={exercise.id}>
                    {exercise.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {mode === 'exercise' && exercisesLoading ? (
          <p className="mt-3 text-sm text-slate-400">
            {appCopy.leaderboardPage.loadingExercises}
          </p>
        ) : null}

        {currentRank ? (
          <p className="mt-4 text-sm text-emerald-200">
            {appCopy.leaderboardPage.currentRank(currentRank)}
          </p>
        ) : null}
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/40">
        {loading ? (
          <div className="px-6 py-6 text-sm text-slate-400">
            {appCopy.leaderboardPage.loading}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-6 text-sm text-slate-400">
            {emptyStateMessage}
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {rows.map((row, index) => {
              const isCurrent = row.userId === currentUserId
              return (
                <button
                  key={row.userId}
                  type="button"
                  onClick={() => handleUserSelect(row)}
                  className={[
                    'flex w-full items-center justify-between px-6 py-4 text-left transition hover:bg-slate-900/60',
                    isCurrent ? 'bg-emerald-500/10' : '',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-slate-500">
                      #{index + 1}
                    </span>
                    {row.avatarUrl ? (
                      <img
                        src={row.avatarUrl}
                        alt={row.name}
                        className="h-9 w-9 rounded-full border border-slate-800"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-800 bg-slate-950 text-xs font-semibold">
                        {row.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold">{row.name}</p>
                      {isCurrent ? (
                        <p className="text-xs text-emerald-200">{appCopy.common.youLabel}</p>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-sm font-semibold">
                    {formatter.format(row.totalReps)} {appCopy.common.repsLabel}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <LeaderboardUserSheet
        user={selectedUser}
        timeframeLabel={timeframeLabel}
        currentSliceLabel={detailSliceLabel}
        currentSliceReps={detailSliceReps}
        currentRank={selectedUserCurrentRank}
        breakdownRows={breakdownRows}
        loading={breakdownLoading}
        error={breakdownError}
        highlightedExerciseId={mode === 'exercise' ? activeExerciseId : null}
        onClose={handleCloseUserSheet}
      />
    </div>
  )
}
