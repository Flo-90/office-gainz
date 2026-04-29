import { appCopy } from '../lib/copy'
import type { UserExerciseBreakdownRow } from '../lib/types'

type LeaderboardUserSheetProps = {
  user: {
    userId: string
    name: string
    avatarUrl: string | null
  } | null
  timeframeLabel: string
  currentSliceLabel: string
  currentSliceReps: number
  currentRank: number | null
  breakdownRows: UserExerciseBreakdownRow[]
  loading: boolean
  error: string | null
  highlightedExerciseId?: string | null
  onClose: () => void
}

const formatter = new Intl.NumberFormat()

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export default function LeaderboardUserSheet({
  user,
  timeframeLabel,
  currentSliceLabel,
  currentSliceReps,
  currentRank,
  breakdownRows,
  loading,
  error,
  highlightedExerciseId = null,
  onClose,
}: LeaderboardUserSheetProps) {
  if (!user) {
    return null
  }

  const totalBreakdownReps = breakdownRows.reduce(
    (sum, row) => sum + row.totalReps,
    0,
  )
  const maxReps = Math.max(...breakdownRows.map((row) => row.totalReps), 1)

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/80 sm:items-center sm:px-4 sm:pb-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-[2rem] border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-black/40 sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-slate-700 sm:hidden" />

        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="h-12 w-12 rounded-full border border-slate-800"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-800 bg-slate-950 text-sm font-semibold text-slate-200">
                {initials(user.name)}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
                {appCopy.leaderboardPage.userSheet.title}
              </p>
              <h3 className="mt-1 text-xl font-semibold text-slate-100">
                {user.name}
              </h3>
              <p className="mt-1 text-sm text-slate-400">
                {appCopy.leaderboardPage.userSheet.buildSubtitle(timeframeLabel)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            {appCopy.common.close}
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {appCopy.leaderboardPage.userSheet.currentSliceLabel}
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-300">
              {currentSliceLabel}
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-100">
              {formatter.format(currentSliceReps)} {appCopy.common.repsLabel}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {appCopy.leaderboardPage.userSheet.rankLabel}
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-300">
              {timeframeLabel}
            </p>
            <p className="mt-1 text-2xl font-semibold text-slate-100">
              {currentRank ? `#${currentRank}` : '--'}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between gap-4">
            <h4 className="text-lg font-semibold text-slate-100">
              {appCopy.leaderboardPage.userSheet.exerciseMixTitle}
            </h4>
            <p className="text-sm text-slate-400">
              {formatter.format(totalBreakdownReps)} {appCopy.common.repsLabel}
            </p>
          </div>

          {loading ? (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-6 text-sm text-slate-400">
              {appCopy.leaderboardPage.userSheet.loading}
            </div>
          ) : breakdownRows.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-6 text-sm text-slate-400">
              {appCopy.leaderboardPage.userSheet.emptyState}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {breakdownRows.map((row) => {
                const share = totalBreakdownReps
                  ? Math.round((row.totalReps / totalBreakdownReps) * 100)
                  : 0
                const isHighlighted = highlightedExerciseId === row.exerciseId

                return (
                  <div
                    key={row.exerciseId}
                    className={[
                      'rounded-2xl border px-4 py-4',
                      isHighlighted
                        ? 'border-emerald-400/40 bg-emerald-400/10'
                        : 'border-slate-800 bg-slate-950/60',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">
                          {row.exerciseName}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {appCopy.leaderboardPage.userSheet.buildContributionLabel(
                            share,
                          )}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-slate-100">
                        {formatter.format(row.totalReps)} {appCopy.common.repsLabel}
                      </p>
                    </div>

                    <div className="mt-3 h-2 rounded-full bg-slate-800">
                      <div
                        className={[
                          'h-full rounded-full',
                          isHighlighted ? 'bg-emerald-300' : 'bg-emerald-400/70',
                        ].join(' ')}
                        style={{
                          width: `${Math.max((row.totalReps / maxReps) * 100, 6)}%`,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  )
}