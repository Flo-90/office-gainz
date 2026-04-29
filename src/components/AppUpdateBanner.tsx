import { useEffect, useState } from 'react'
import { applyAppUpdate, subscribeToAppUpdates } from '../lib/appUpdate'
import { appCopy } from '../lib/copy'

export default function AppUpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    return subscribeToAppUpdates((snapshot) => {
      setUpdateAvailable(snapshot.updateAvailable)

      if (snapshot.updateAvailable) {
        setDismissed(false)
      }
    })
  }, [])

  if (!updateAvailable || dismissed) {
    return null
  }

  return (
    <section className="mb-4 rounded-3xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-4 shadow-lg shadow-black/20 backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">
            {appCopy.appUpdate.eyebrow}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-slate-100">
            {appCopy.appUpdate.title}
          </h3>
          <p className="mt-2 text-sm text-slate-300">
            {appCopy.appUpdate.description}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-sm text-slate-400 hover:text-slate-200"
        >
          {appCopy.appUpdate.laterButton}
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={applyAppUpdate}
          className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
        >
          {appCopy.appUpdate.refreshButton}
        </button>
      </div>
    </section>
  )
}