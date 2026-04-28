import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/useAuth'
import { createExercise, fetchExercises } from '../lib/api'
import { supabase } from '../lib/supabaseClient'
import type { Exercise } from '../lib/types'

export default function ExercisesPage() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchExercises()
      setExercises(data)
      setError(null)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load exercises.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  useEffect(() => {
    const channel = supabase
      .channel('exercise-updates')
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
  }, [refresh])

  const handleAdd = async () => {
    if (!userId) return
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Exercise name cannot be empty.')
      return
    }
    setSaving(true)
    try {
      await createExercise(trimmed, userId)
      setName('')
      setError(null)
      await refresh()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to add exercise.',
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-800 bg-slate-900/60 px-6 py-5">
        <h2 className="text-2xl font-semibold">Exercises</h2>
        <p className="text-sm text-slate-400">
          Add anything your team loves, from squats to stretch breaks.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New exercise name"
            className="w-full flex-1 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={saving}
            className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? 'Adding…' : 'Add exercise'}
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/40">
        {loading ? (
          <div className="px-6 py-6 text-sm text-slate-400">
            Loading the exercise list…
          </div>
        ) : exercises.length === 0 ? (
          <div className="px-6 py-6 text-sm text-slate-400">
            No exercises yet. Add the first one above.
          </div>
        ) : (
          <ul className="divide-y divide-slate-800">
            {exercises.map((exercise) => (
              <li key={exercise.id} className="px-6 py-4 text-sm font-semibold">
                {exercise.name}
              </li>
            ))}
          </ul>
        )}
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
    </div>
  )
}
