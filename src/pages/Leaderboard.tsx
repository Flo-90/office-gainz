import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/useAuth'
import {
  fetchLeaderboard,
  getLeaderboardSnapshot,
  subscribeToDataUpdates,
} from '../lib/api'
import { appCopy } from '../lib/copy'
import type { LeaderboardRow, Timeframe } from '../lib/types'

const formatter = new Intl.NumberFormat()

const timeframeOptions: Array<{ value: Timeframe; label: string }> = [
  { value: 'today', label: appCopy.leaderboardPage.timeframes.today },
  { value: 'week', label: appCopy.leaderboardPage.timeframes.week },
  { value: 'all', label: appCopy.leaderboardPage.timeframes.all },
]

export default function LeaderboardPage() {
  const { session } = useAuth()
  const [timeframe, setTimeframe] = useState<Timeframe>('today')
  const [rows, setRows] = useState<LeaderboardRow[]>(
    () => getLeaderboardSnapshot('today') ?? [],
  )
  const [loading, setLoading] = useState(
    () => getLeaderboardSnapshot('today') === null,
  )
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (options?: { force?: boolean }) => {
    if (getLeaderboardSnapshot(timeframe) === null) {
      setLoading(true)
    }

    try {
      const data = await fetchLeaderboard(timeframe, options)
      setRows(data)
      setError(null)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : appCopy.leaderboardPage.loadError,
      )
    } finally {
      setLoading(false)
    }
  }, [timeframe])

  const handleTimeframeChange = (nextTimeframe: Timeframe) => {
    setTimeframe(nextTimeframe)

    const cachedRows = getLeaderboardSnapshot(nextTimeframe)

    if (cachedRows !== null) {
      setRows(cachedRows)
      setLoading(false)
      return
    }

    setRows([])
    setLoading(true)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  useEffect(() => {
    const unsubscribe = subscribeToDataUpdates((event) => {
      if (event.resource === 'entries') {
        void refresh({ force: true })
      }
    })

    return unsubscribe
  }, [refresh])

  const currentUserId = session?.user.id
  const currentRank = useMemo(() => {
    if (!currentUserId) return null
    const index = rows.findIndex((row) => row.userId === currentUserId)
    return index >= 0 ? index + 1 : null
  }, [rows, currentUserId])

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-800 bg-slate-900/60 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">{appCopy.leaderboardPage.title}</h2>
            <p className="text-sm text-slate-400">
              {appCopy.leaderboardPage.subtitle}
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
            {appCopy.leaderboardPage.emptyState}
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {rows.map((row, index) => {
              const isCurrent = row.userId === currentUserId
              return (
                <div
                  key={row.userId}
                  className={[
                    'flex items-center justify-between px-6 py-4',
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
                </div>
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
    </div>
  )
}
