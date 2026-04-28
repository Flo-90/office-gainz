import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/useAuth'
import { fetchExercises, fetchUserTotal, logEntry } from '../lib/api'
import { supabase } from '../lib/supabaseClient'
import { startOfDay } from '../lib/time'
import type { Exercise } from '../lib/types'

const formatter = new Intl.NumberFormat()

export default function LogPage() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [todayTotal, setTodayTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeExercise, setActiveExercise] = useState<Exercise | null>(null)
  const [reps, setReps] = useState('10')

  const refresh = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const [exerciseList, total] = await Promise.all([
        fetchExercises(),
        fetchUserTotal(userId, startOfDay()),
      ])
      setExercises(exerciseList)
      setTodayTotal(total)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load log data.')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel('log-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'entries' },
        () => {
          void refresh()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'exercises' },
        () => {
          void refresh()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [refresh, userId])

  const handleSave = async () => {
    if (!userId || !activeExercise) return
    const repsValue = Number(reps)
    if (!Number.isFinite(repsValue) || repsValue <= 0) {
      setError('Reps need to be a positive number.')
      return
    }
    setSaving(true)
    try {
      await logEntry(userId, activeExercise.id, repsValue)
      setActiveExercise(null)
      setReps('10')
      setError(null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log reps.')
    } finally {
      setSaving(false)
    }
  }

  const logHint = useMemo(() => {
    if (!activeExercise) return ''
    return `Log ${activeExercise.name}`
  }, [activeExercise])

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-800 bg-gradient-to-br from-emerald-500/20 via-slate-900/70 to-slate-900 px-6 py-6 shadow-lg shadow-black/30">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-200">
          Today
        </p>
        <h2 className="mt-3 text-4xl font-semibold">
          {formatter.format(todayTotal)} reps
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          Every set counts. Drop a quick log below.
        </p>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Quick log</h3>
          <span className="text-xs text-slate-400">
            Tap • Type • Save
          </span>
        </div>

        {loading ? (
          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-slate-400">
            Loading your exercises…
          </div>
        ) : exercises.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-slate-400">
            No exercises yet. Head to Exercises to add your first one.
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {exercises.map((exercise) => (
              <button
                key={exercise.id}
                type="button"
                onClick={() => setActiveExercise(exercise)}
                className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4 text-left text-sm font-semibold transition hover:border-emerald-400/60 hover:text-emerald-200"
              >
                {exercise.name}
                <span className="text-xs text-slate-500">Log</span>
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
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/80 px-4 pb-10 sm:items-center">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-black/40">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold">{logHint}</h4>
              <button
                type="button"
                onClick={() => setActiveExercise(null)}
                className="text-sm text-slate-400 hover:text-slate-200"
              >
                Close
              </button>
            </div>
            <label className="mt-4 block text-sm text-slate-400">
              Reps
            </label>
            <input
              type="number"
              min={1}
              value={reps}
              onChange={(event) => setReps(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-lg font-semibold text-slate-100 focus:border-emerald-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="mt-4 w-full rounded-full bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? 'Saving…' : 'Save reps'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
