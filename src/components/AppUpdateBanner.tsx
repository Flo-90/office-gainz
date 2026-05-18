import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { applyAppUpdate, subscribeToAppUpdates } from '../lib/appUpdate'
import {
  getUnseenChangelogEntries,
  markAllChangelogSeen,
  type ChangelogEntry,
} from '../lib/changelog'
import { appCopy } from '../lib/copy'

const MAX_VISIBLE_BULLETS = 8

export default function AppUpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [unseen, setUnseen] = useState<ChangelogEntry[]>([])

  useEffect(() => {
    return subscribeToAppUpdates((snapshot) => {
      setUpdateAvailable(snapshot.updateAvailable)

      if (snapshot.updateAvailable) {
        setDismissed(false)
      }
    })
  }, [])

  useEffect(() => {
    if (!updateAvailable) {
      return
    }

    let cancelled = false

    void getUnseenChangelogEntries().then((entries) => {
      if (!cancelled) {
        setUnseen(entries)
      }
    })

    return () => {
      cancelled = true
    }
  }, [updateAvailable])

  if (!updateAvailable || dismissed) {
    return null
  }

  const visibleBullets: Array<{ key: string; text: string }> = []
  for (const entry of unseen) {
    for (let index = 0; index < entry.bullets.length; index += 1) {
      visibleBullets.push({
        key: `${entry.version}-${index}`,
        text: entry.bullets[index],
      })
      if (visibleBullets.length >= MAX_VISIBLE_BULLETS) break
    }
    if (visibleBullets.length >= MAX_VISIBLE_BULLETS) break
  }

  const totalBullets = unseen.reduce(
    (sum, entry) => sum + entry.bullets.length,
    0,
  )
  const hasOverflow = totalBullets > visibleBullets.length

  const handleRefresh = () => {
    void markAllChangelogSeen()
    applyAppUpdate()
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

      {visibleBullets.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200">
            {appCopy.appUpdate.whatsNewLabel}
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-200">
            {visibleBullets.map((bullet) => (
              <li key={bullet.key} className="flex gap-2">
                <span className="text-emerald-300">•</span>
                <span>{bullet.text}</span>
              </li>
            ))}
          </ul>
          {hasOverflow ? (
            <Link
              to="/changelog"
              className="mt-3 inline-block text-xs font-semibold text-emerald-200 hover:text-emerald-100"
            >
              {appCopy.appUpdate.viewAllLink}
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={handleRefresh}
          className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
        >
          {appCopy.appUpdate.refreshButton}
        </button>
      </div>
    </section>
  )
}
