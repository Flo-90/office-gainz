import { useEffect, useState } from 'react'
import {
  disablePushSubscription,
  fetchPushState,
  getNotificationPermission,
  isPushSupported,
  requestPushPermission,
  savePushSubscription,
  subscribeBrowserPush,
  unsubscribeBrowserPush,
  updatePushPreferences,
} from '../lib/push'
import { appCopy } from '../lib/copy'
import type { NotificationPreferences, PushState } from '../lib/types'

function formatError(error: unknown) {
  return error instanceof Error ? error.message : appCopy.common.unexpectedError
}

type PreferenceKey = keyof NotificationPreferences

export default function NotificationSettingsCard() {
  const [pushState, setPushState] = useState<PushState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof window === 'undefined' ? 'unsupported' : getNotificationPermission(),
  )

  useEffect(() => {
    const loadState = async () => {
      setLoading(true)
      try {
        const state = await fetchPushState()
        setPushState(state)
        setError(null)
      } catch (loadError) {
        setError(formatError(loadError))
      } finally {
        setPermission(getNotificationPermission())
        setLoading(false)
      }
    }

    void loadState()
  }, [])

  const handlePushToggle = async (nextEnabled: boolean) => {
    if (!pushState) return

    setSaving(true)
    try {
      if (!nextEnabled) {
        const endpoint = await unsubscribeBrowserPush().catch(() => null)
        const updated = await disablePushSubscription(endpoint)
        setPushState(updated)
        setError(null)
        return
      }

      if (!isPushSupported()) {
        throw new Error(appCopy.notifications.errors.unsupportedPush)
      }

      if (!pushState.publicKey) {
        throw new Error(appCopy.notifications.errors.missingServerConfig)
      }

      let nextPermission = getNotificationPermission()
      if (nextPermission === 'default') {
        nextPermission = await requestPushPermission()
      }

      setPermission(nextPermission)

      if (nextPermission !== 'granted') {
        throw new Error(appCopy.notifications.errors.permissionRequired)
      }

      const subscription = await subscribeBrowserPush(pushState.publicKey)
      const updated = await savePushSubscription(subscription, {
        pushEnabled: true,
      })
      setPushState(updated)
      setError(null)
    } catch (toggleError) {
      setError(formatError(toggleError))
    } finally {
      setSaving(false)
    }
  }

  const handlePreferenceToggle = async (
    key: PreferenceKey,
    value: boolean,
  ) => {
    if (!pushState) return

    setSaving(true)
    try {
      const updated = await updatePushPreferences({
        [key]: value,
      })
      setPushState(updated)
      setError(null)
    } catch (toggleError) {
      setError(formatError(toggleError))
    } finally {
      setSaving(false)
    }
  }

  const overallEnabled = pushState?.preferences.pushEnabled ?? false
  const pushSupported = isPushSupported()

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/50 px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
            {appCopy.notifications.eyebrow}
          </p>
          <h3 className="mt-2 text-xl font-semibold">{appCopy.notifications.title}</h3>
          <p className="mt-2 max-w-xl text-sm text-slate-400">
            {appCopy.notifications.subtitle}
          </p>
        </div>
        <label className="flex items-center gap-3 rounded-full border border-slate-800 bg-slate-950 px-4 py-2 text-sm font-semibold">
          <span className="text-slate-300">{appCopy.notifications.pushToggleLabel}</span>
          <input
            type="checkbox"
            checked={overallEnabled}
            disabled={loading || saving || !pushSupported}
            onChange={(event) => void handlePushToggle(event.target.checked)}
            className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-400 focus:ring-emerald-400"
          />
        </label>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            {appCopy.notifications.browserLabel}
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-100">
            {appCopy.notifications.permissionStatus[permission]}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {pushSupported
              ? appCopy.notifications.supportedBrowserDescription
              : appCopy.notifications.unsupportedBrowserDescription}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            {appCopy.notifications.accountLabel}
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-100">
            {loading || !pushState
              ? appCopy.notifications.accountStatus.loading
              : overallEnabled
                ? appCopy.notifications.accountStatus.enabled
                : appCopy.notifications.accountStatus.disabled}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {pushState
              ? appCopy.notifications.subscriptionCount(
                  pushState.subscriptionCount,
                )
              : appCopy.notifications.accountStatus.syncing}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            {appCopy.notifications.scopeLabel}
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-100">
            {appCopy.notifications.scopeValue}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {appCopy.notifications.scopeDescription}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4 text-sm">
          <div>
            <p className="font-semibold text-slate-100">{appCopy.notifications.dailyNudge.title}</p>
            <p className="mt-1 text-slate-400">
              {appCopy.notifications.dailyNudge.description}
            </p>
          </div>
          <input
            type="checkbox"
            checked={pushState?.preferences.dailyNudge15h ?? false}
            disabled={loading || saving || !pushState}
            onChange={(event) =>
              void handlePreferenceToggle('dailyNudge15h', event.target.checked)
            }
            className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-400 focus:ring-emerald-400"
          />
        </label>

        <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4 text-sm">
          <div>
            <p className="font-semibold text-slate-100">{appCopy.notifications.overtakenToday.title}</p>
            <p className="mt-1 text-slate-400">
              {appCopy.notifications.overtakenToday.description}
            </p>
          </div>
          <input
            type="checkbox"
            checked={pushState?.preferences.leaderboardOvertakenToday ?? false}
            disabled={loading || saving || !pushState}
            onChange={(event) =>
              void handlePreferenceToggle(
                'leaderboardOvertakenToday',
                event.target.checked,
              )
            }
            className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-400 focus:ring-emerald-400"
          />
        </label>

        <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4 text-sm">
          <div>
            <p className="font-semibold text-slate-100">{appCopy.notifications.streakAtRisk.title}</p>
            <p className="mt-1 text-slate-400">
              {appCopy.notifications.streakAtRisk.description}
            </p>
          </div>
          <input
            type="checkbox"
            checked={pushState?.preferences.streakAtRisk15h ?? false}
            disabled={loading || saving || !pushState}
            onChange={(event) =>
              void handlePreferenceToggle('streakAtRisk15h', event.target.checked)
            }
            className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-400 focus:ring-emerald-400"
          />
        </label>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
    </section>
  )
}