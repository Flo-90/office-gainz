import { useEffect, useState } from 'react'
import { appCopy } from '../lib/copy'
import { fetchChangelog, type ChangelogEntry } from '../lib/changelog'

export default function ChangelogPage() {
  const [entries, setEntries] = useState<ChangelogEntry[] | null>(null)

  useEffect(() => {
    let cancelled = false

    void fetchChangelog().then((list) => {
      if (!cancelled) {
        setEntries(list)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-800 bg-gradient-to-br from-emerald-500/20 via-slate-900/70 to-slate-900 px-6 py-6 shadow-lg shadow-black/30">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-200">
          {appCopy.changelogPage.eyebrow}
        </p>
        <h2 className="mt-3 text-3xl font-semibold">
          {appCopy.changelogPage.title}
        </h2>
        <p className="mt-2 text-sm text-slate-300">
          {appCopy.changelogPage.subtitle}
        </p>
      </section>

      {entries === null ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-slate-400">
          {appCopy.changelogPage.loading}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 px-4 py-6 text-sm text-slate-400">
          {appCopy.changelogPage.empty}
        </div>
      ) : (
        <ol className="space-y-4">
          {entries.map((entry) => (
            <li
              key={entry.version}
              className="rounded-3xl border border-slate-800 bg-slate-900/60 px-6 py-5"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
                {entry.version}
              </p>
              <h3 className="mt-2 text-xl font-semibold text-slate-100">
                {entry.title}
              </h3>
              {entry.bullets.length > 0 ? (
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  {entry.bullets.map((bullet, index) => (
                    <li
                      key={`${entry.version}-${index}`}
                      className="flex gap-2"
                    >
                      <span className="text-emerald-300">•</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
