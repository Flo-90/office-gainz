import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/useAuth'
import {
  createExercise,
  fetchExercises,
  getExercisesSnapshot,
  subscribeToDataUpdates,
} from '../lib/api'
import { appCopy } from '../lib/copy'
import type { Exercise } from '../lib/types'

export default function ExercisesPage() {
  const { session } = useAuth()
  const userId = session?.user.id
  const [exercises, setExercises] = useState<Exercise[]>(
    () => getExercisesSnapshot() ?? [],
  )
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(
    () => getExercisesSnapshot() === null,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    if (getExercisesSnapshot() === null) {
      setLoading(true)
    }

    try {
      const data = await fetchExercises(options)
      setExercises(data)
      setError(null)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : appCopy.exercisesPage.loadError,
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
    const unsubscribe = subscribeToDataUpdates((event) => {
      if (event.resource === 'exercises') {
        void refresh({ force: true })
      }
    })

    return unsubscribe
  }, [refresh])

  const handleAdd = async () => {
    if (!userId) return
    const trimmed = name.trim()
    if (!trimmed) {
      setError(appCopy.exercisesPage.emptyNameError)
      return
    }
    setSaving(true)
    try {
      const createdExercise = await createExercise(trimmed, userId)
      setExercises((current) =>
        [...current.filter((exercise) => exercise.id !== createdExercise.id), createdExercise].sort(
          (left, right) => left.name.localeCompare(right.name),
        ),
      )
      setName('')
      setError(null)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : appCopy.exercisesPage.addError,
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-800 bg-slate-900/60 px-6 py-5">
        <h2 className="text-2xl font-semibold">{appCopy.exercisesPage.title}</h2>
        <p className="text-sm text-slate-400">
          {appCopy.exercisesPage.subtitle}
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={appCopy.exercisesPage.inputPlaceholder}
            className="w-full flex-1 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={saving}
            className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving
              ? appCopy.exercisesPage.addingButton
              : appCopy.exercisesPage.addButton}
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/40">
        {loading ? (
          <div className="px-6 py-6 text-sm text-slate-400">
            {appCopy.exercisesPage.loadingList}
          </div>
        ) : exercises.length === 0 ? (
          <div className="px-6 py-6 text-sm text-slate-400">
            {appCopy.exercisesPage.emptyState}
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
