import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../contexts/useAuth'
import {
  fetchExercises,
  fetchUserTotal,
  getExercisesSnapshot,
  getUserTotalSnapshot,
  logEntry,
  subscribeToDataUpdates,
} from '../lib/api'
import { appCopy } from '../lib/copy'
import { startOfDay } from '../lib/time'
import type { Exercise } from '../lib/types'

const formatter = new Intl.NumberFormat()
const MIN_REPS = 1
const MAX_REPS = 500
const WHEEL_ITEM_HEIGHT = 56
const WHEEL_PADDING = WHEEL_ITEM_HEIGHT * 2
const REP_OPTIONS = Array.from(
  { length: MAX_REPS - MIN_REPS + 1 },
  (_, index) => MIN_REPS + index,
)
const QUICK_PRESETS = [5, 10, 15, 20] as const

function clampReps(value: number) {
  return Math.min(MAX_REPS, Math.max(MIN_REPS, value))
}

export default function LogPage() {
  const { session } = useAuth()
  const userId = session?.user.id
  const todayStart = useMemo(() => startOfDay(), [])
  const [exercises, setExercises] = useState<Exercise[]>(
    () => getExercisesSnapshot() ?? [],
  )
  const [todayTotal, setTodayTotal] = useState(() => {
    if (!userId) {
      return 0
    }

    return getUserTotalSnapshot(userId, todayStart) ?? 0
  })
  const [loading, setLoading] = useState(() => {
    if (!userId) {
      return true
    }

    return (
      getExercisesSnapshot() === null ||
      getUserTotalSnapshot(userId, todayStart) === null
    )
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeExercise, setActiveExercise] = useState<Exercise | null>(null)
  const [reps, setReps] = useState(10)
  const wheelRef = useRef<HTMLDivElement | null>(null)
  const scrollTimeoutRef = useRef<number | null>(null)

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    if (!userId) return

    const hasCachedData =
      getExercisesSnapshot() !== null &&
      getUserTotalSnapshot(userId, todayStart) !== null

    if (!hasCachedData) {
      setLoading(true)
    }

    try {
      const [exerciseList, total] = await Promise.all([
        fetchExercises(options),
        fetchUserTotal(userId, todayStart, options),
      ])
      setExercises(exerciseList)
      setTodayTotal(total)
      setError(null)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : appCopy.logPage.loadError,
      )
    } finally {
      setLoading(false)
    }
  }, [todayStart, userId])

  const refreshExercises = useCallback(async () => {
    try {
      const exerciseList = await fetchExercises({ force: true })
      setExercises(exerciseList)
      setError(null)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : appCopy.logPage.loadError,
      )
    }
  }, [])

  const refreshTodayTotal = useCallback(async () => {
    if (!userId) return

    try {
      const total = await fetchUserTotal(userId, todayStart, { force: true })
      setTodayTotal(total)
      setError(null)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : appCopy.logPage.loadError,
      )
    }
  }, [todayStart, userId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  useEffect(() => {
    const unsubscribe = subscribeToDataUpdates((event) => {
      if (event.resource === 'entries') {
        void refreshTodayTotal()
        return
      }

      if (event.resource === 'exercises') {
        void refreshExercises()
      }
    })

    return unsubscribe
  }, [refreshExercises, refreshTodayTotal])

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [])

  const scrollWheelToReps = useCallback(
    (value: number, behavior: ScrollBehavior = 'smooth') => {
      const container = wheelRef.current

      if (!container) return

      container.scrollTo({
        top: (clampReps(value) - MIN_REPS) * WHEEL_ITEM_HEIGHT,
        behavior,
      })
    },
    [],
  )

  useEffect(() => {
    if (!activeExercise) return

    const frame = window.requestAnimationFrame(() => {
      scrollWheelToReps(reps, 'auto')
    })

    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [activeExercise, reps, scrollWheelToReps])

  const handleWheelScroll = useCallback(() => {
    const container = wheelRef.current

    if (!container) return

    if (scrollTimeoutRef.current !== null) {
      window.clearTimeout(scrollTimeoutRef.current)
    }

    scrollTimeoutRef.current = window.setTimeout(() => {
      const nextReps = clampReps(
        MIN_REPS + Math.round(container.scrollTop / WHEEL_ITEM_HEIGHT),
      )

      setReps(nextReps)
      scrollWheelToReps(nextReps)
    }, 60)
  }, [scrollWheelToReps])

  const handlePresetSelect = useCallback(
    (value: number) => {
      const nextReps = clampReps(value)

      setReps(nextReps)
      scrollWheelToReps(nextReps)
    },
    [scrollWheelToReps],
  )

  const handleExerciseSelect = (exercise: Exercise) => {
    setActiveExercise(exercise)
    setError(null)
  }

  const handleSave = async () => {
    if (!userId || !activeExercise) return
    const repsValue = clampReps(reps)

    if (repsValue <= 0) {
      setError(appCopy.logPage.invalidRepsError)
      return
    }

    setSaving(true)
    try {
      await logEntry(userId, activeExercise.id, repsValue)
      setTodayTotal((current) => current + repsValue)
      setActiveExercise(null)
      setReps(10)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : appCopy.logPage.saveError)
    } finally {
      setSaving(false)
    }
  }

  const logHint = useMemo(() => {
    if (!activeExercise) return ''
    return appCopy.logPage.buildLogHint(activeExercise.name)
  }, [activeExercise])

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-800 bg-gradient-to-br from-emerald-500/20 via-slate-900/70 to-slate-900 px-6 py-6 shadow-lg shadow-black/30">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-200">
          {appCopy.logPage.todayLabel}
        </p>
        <h2 className="mt-3 text-4xl font-semibold">
          {formatter.format(todayTotal)} {appCopy.common.repsLabel}
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          {appCopy.logPage.summaryDescription}
        </p>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{appCopy.logPage.quickLogTitle}</h3>
          <span className="text-xs text-slate-400">
            {appCopy.logPage.quickLogHint}
          </span>
        </div>

        {loading ? (
          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-slate-400">
            {appCopy.logPage.loadingExercises}
          </div>
        ) : exercises.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-slate-400">
            {appCopy.logPage.noExercises}
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {exercises.map((exercise) => (
              <button
                key={exercise.id}
                type="button"
                onClick={() => handleExerciseSelect(exercise)}
                className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4 text-left text-sm font-semibold transition hover:border-emerald-400/60 hover:text-emerald-200"
              >
                {exercise.name}
                <span className="text-xs text-slate-500">{appCopy.logPage.logAction}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {activeExercise ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/80 sm:items-center sm:px-4 sm:pb-10"
          onClick={() => setActiveExercise(null)}
        >
          <div
            className="w-full max-w-md rounded-t-[2rem] border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-black/40 sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-700 sm:hidden" />
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">{logHint}</h4>
              <button
                type="button"
                onClick={() => setActiveExercise(null)}
                className="text-sm text-slate-400 hover:text-slate-200"
              >
                {appCopy.common.close}
              </button>
            </div>
            <label className="mt-4 block text-sm text-slate-400">
              {appCopy.logPage.repsFieldLabel}
            </label>
            <p className="mt-1 text-xs text-slate-500">
              {appCopy.logPage.wheelHint}
            </p>

            <div className="relative mt-4 overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950/80">
              <div className="pointer-events-none absolute inset-x-3 top-1/2 z-10 h-14 -translate-y-1/2 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.06)]" />
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-slate-950 via-slate-950/90 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent" />

              <div
                ref={wheelRef}
                onScroll={handleWheelScroll}
                className="h-[280px] snap-y snap-mandatory overflow-y-auto overscroll-contain px-4 [&::-webkit-scrollbar]:hidden"
                style={{
                  paddingTop: `${WHEEL_PADDING}px`,
                  paddingBottom: `${WHEEL_PADDING}px`,
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                }}
              >
                {REP_OPTIONS.map((value) => (
                  <div
                    key={value}
                    className="flex h-14 snap-center items-center justify-center text-5xl font-semibold tracking-tight text-slate-500 [font-variant-numeric:tabular-nums] [scroll-snap-stop:always]"
                  >
                    {formatter.format(value)}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2">
              {QUICK_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handlePresetSelect(preset)}
                  className={[
                    'rounded-2xl border px-3 py-3 text-sm font-semibold transition',
                    reps === preset
                      ? 'border-emerald-400/50 bg-emerald-400/10 text-emerald-200'
                      : 'border-slate-800 bg-slate-950 text-slate-200 hover:border-emerald-400/40 hover:text-emerald-200',
                  ].join(' ')}
                >
                  {preset}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="mt-4 w-full rounded-full bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving
                ? appCopy.logPage.savingButton
                : appCopy.logPage.buildSaveButton(reps)}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
