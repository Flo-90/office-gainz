import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import webpush from 'npm:web-push@3.6.7'

import { pushCopy } from '../_shared/copy.ts'
import {
  createAdminClient,
  ensurePushDeliveryConfig,
  getBerlinDateKey,
  getBerlinDayDifference,
  getBerlinParts,
  getStatusCode,
  json,
  toErrorMessage,
  type NotificationPreferencesRow,
  type StoredSubscriptionRow,
} from '../_shared/push.ts'

type DispatchRequest =
  | { type: 'daily_nudge_scan' }
  | { type: 'entry_logged'; entryId: string }

type EntryQueryRow = {
  user_id: string
  reps: number
  created_at: string
  user:
    | { id: string; name: string | null }
    | Array<{ id: string; name: string | null }>
    | null
}

type LeaderboardRow = {
  userId: string
  name: string
  totalReps: number
}

type PushPayload = {
  title: string
  body: string
  tag: string
  url: string
  icon: string
  badge: string
}

const DAILY_NUDGE_COOLDOWN_MINUTES = 24 * 60
const OVERTAKEN_COOLDOWN_MINUTES = 90

function normalizeUser(row: EntryQueryRow) {
  return Array.isArray(row.user) ? row.user[0] ?? null : row.user
}

function buildLeaderboardRows(
  totals: Map<string, LeaderboardRow>,
): LeaderboardRow[] {
  return Array.from(totals.values()).sort((left, right) => {
    if (right.totalReps !== left.totalReps) {
      return right.totalReps - left.totalReps
    }

    return left.name.localeCompare(right.name)
  })
}

function aggregateTotals(entries: EntryQueryRow[]) {
  const totals = new Map<string, LeaderboardRow>()

  entries.forEach((row) => {
    const user = normalizeUser(row)
    if (!user) {
      return
    }

    const current = totals.get(user.id)
    if (current) {
      current.totalReps += row.reps
      return
    }

    totals.set(user.id, {
      userId: user.id,
      name: user.name ?? 'OfficeGainz Athlete',
      totalReps: row.reps,
    })
  })

  return totals
}

async function hasDedupeKey(
  admin: ReturnType<typeof createAdminClient>,
  dedupeKey: string,
) {
  const { data, error } = await admin
    .from('notification_log')
    .select('id')
    .eq('dedupe_key', dedupeKey)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to check notification dedupe: ${error.message}`)
  }

  return Boolean(data)
}

async function hasRecentNotification(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  notificationType: 'daily_nudge_15h' | 'leaderboard_overtaken_today',
  minutes: number,
) {
  const cutoff = new Date(Date.now() - minutes * 60_000).toISOString()
  const { data, error } = await admin
    .from('notification_log')
    .select('id')
    .eq('user_id', userId)
    .eq('notification_type', notificationType)
    .gte('sent_at', cutoff)
    .limit(1)

  if (error) {
    throw new Error(`Failed to check notification cooldown: ${error.message}`)
  }

  return (data ?? []).length > 0
}

async function loadSubscriptionsByUser(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
) {
  if (userIds.length === 0) {
    return new Map<string, StoredSubscriptionRow[]>()
  }

  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth, expiration_time, disabled_at')
    .in('user_id', userIds)
    .is('disabled_at', null)

  if (error) {
    throw new Error(`Failed to load push subscriptions: ${error.message}`)
  }

  const grouped = new Map<string, StoredSubscriptionRow[]>()
  ;(data as StoredSubscriptionRow[] | null)?.forEach((subscription) => {
    const current = grouped.get(subscription.user_id) ?? []
    current.push(subscription)
    grouped.set(subscription.user_id, current)
  })

  return grouped
}

async function loadPreferencesByUser(
  admin: ReturnType<typeof createAdminClient>,
  userIds: string[],
) {
  if (userIds.length === 0) {
    return new Map<string, NotificationPreferencesRow>()
  }

  const { data, error } = await admin
    .from('notification_preferences')
    .select('*')
    .in('user_id', userIds)

  if (error) {
    throw new Error(`Failed to load notification preferences: ${error.message}`)
  }

  return new Map(
    ((data as NotificationPreferencesRow[] | null) ?? []).map((row) => [
      row.user_id,
      row,
    ]),
  )
}

async function updateSubscriptionResult(
  admin: ReturnType<typeof createAdminClient>,
  subscriptionId: string,
  updates: Record<string, string | null>,
) {
  const { error } = await admin
    .from('push_subscriptions')
    .update(updates)
    .eq('id', subscriptionId)

  if (error) {
    console.error('Failed to update push subscription state', error)
  }
}

async function deliverNotification(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  notificationType: 'daily_nudge_15h' | 'leaderboard_overtaken_today',
  dedupeKey: string,
  subscriptions: StoredSubscriptionRow[],
  payload: PushPayload,
  logPayload: Record<string, unknown>,
) {
  if (subscriptions.length === 0) {
    return false
  }

  if (await hasDedupeKey(admin, dedupeKey)) {
    return false
  }

  let deliveredCount = 0

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          expirationTime: subscription.expiration_time,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        JSON.stringify(payload),
      )

      deliveredCount += 1
      await updateSubscriptionResult(admin, subscription.id, {
        disabled_at: null,
        last_success_at: new Date().toISOString(),
        last_error: null,
      })
    } catch (error) {
      const statusCode =
        typeof error === 'object' && error !== null && 'statusCode' in error
          ? Number((error as { statusCode?: number }).statusCode)
          : null
      const errorMessage = toErrorMessage(error)

      await updateSubscriptionResult(admin, subscription.id, {
        disabled_at:
          statusCode === 404 || statusCode === 410
            ? new Date().toISOString()
            : null,
        last_error: errorMessage,
      })
    }
  }

  if (deliveredCount === 0) {
    return false
  }

  const { error } = await admin.from('notification_log').insert({
    user_id: userId,
    notification_type: notificationType,
    dedupe_key: dedupeKey,
    payload: logPayload,
  })

  if (error && error.code !== '23505') {
    throw new Error(`Failed to write notification log: ${error.message}`)
  }

  return true
}

function buildDailyNudgePayload(otherActiveCount: number, dayKey: string): PushPayload {
  return {
    title: pushCopy.dailyNudge.title,
    body: pushCopy.dailyNudge.body(otherActiveCount),
    tag: `daily-nudge-${dayKey}`,
    url: '/',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
  }
}

function buildOvertakenPayload(
  actorName: string,
  actorTotal: number,
  recipientTotal: number,
  dayKey: string,
): PushPayload {
  return {
    title: pushCopy.overtaken.title,
    body: pushCopy.overtaken.body(actorName, actorTotal, recipientTotal),
    tag: `leaderboard-overtaken-${dayKey}`,
    url: '/leaderboard',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
  }
}

async function handleDailyNudgeScan(
  admin: ReturnType<typeof createAdminClient>,
) {
  const now = new Date()
  const berlinNow = getBerlinParts(now)

  if (berlinNow.hour !== 15) {
    return {
      status: 'skipped',
      reason: 'outside_berlin_15h',
      berlinHour: berlinNow.hour,
    }
  }

  const todayKey = getBerlinDateKey(now)
  const cutoff = new Date(now.getTime() - 8 * 86_400_000).toISOString()
  const [preferencesResult, entriesResult] = await Promise.all([
    admin
      .from('notification_preferences')
      .select('*')
      .eq('push_enabled', true)
      .eq('daily_nudge_15h', true),
    admin
      .from('entries')
      .select('user_id, created_at')
      .gte('created_at', cutoff),
  ])

  if (preferencesResult.error) {
    throw new Error(
      `Failed to load daily-nudge preferences: ${preferencesResult.error.message}`,
    )
  }

  if (entriesResult.error) {
    throw new Error(
      `Failed to load recent entries for daily nudges: ${entriesResult.error.message}`,
    )
  }

  const preferences =
    (preferencesResult.data as NotificationPreferencesRow[] | null) ?? []

  if (preferences.length === 0) {
    return {
      status: 'ok',
      reason: 'no_opt_ins',
      sent: 0,
    }
  }

  const lastEntryAtByUser = new Map<string, string>()
  const todayUsers = new Set<string>()

  ;((entriesResult.data as Array<{ user_id: string; created_at: string }> | null) ?? []).forEach(
    (entry) => {
      const current = lastEntryAtByUser.get(entry.user_id)
      if (!current || current < entry.created_at) {
        lastEntryAtByUser.set(entry.user_id, entry.created_at)
      }

      if (getBerlinDateKey(new Date(entry.created_at)) === todayKey) {
        todayUsers.add(entry.user_id)
      }
    },
  )

  const subscriptionsByUser = await loadSubscriptionsByUser(
    admin,
    preferences.map((row) => row.user_id),
  )

  let sent = 0
  let considered = 0

  for (const preference of preferences) {
    const lastEntryAt = lastEntryAtByUser.get(preference.user_id)
    if (!lastEntryAt) {
      continue
    }

    if (todayUsers.has(preference.user_id)) {
      continue
    }

    const inactivityDays = getBerlinDayDifference(new Date(lastEntryAt), now)
    if (inactivityDays < 1 || inactivityDays > 3) {
      continue
    }

    const otherPeopleToday = Array.from(todayUsers).filter(
      (userId) => userId !== preference.user_id,
    )

    if (otherPeopleToday.length === 0) {
      continue
    }

    const subscriptions = subscriptionsByUser.get(preference.user_id) ?? []
    if (subscriptions.length === 0) {
      continue
    }

    const dedupeKey = `daily_nudge_15h:${todayKey}:${preference.user_id}`
    if (
      (await hasDedupeKey(admin, dedupeKey)) ||
      (await hasRecentNotification(
        admin,
        preference.user_id,
        'daily_nudge_15h',
        DAILY_NUDGE_COOLDOWN_MINUTES,
      ))
    ) {
      continue
    }

    considered += 1

    const delivered = await deliverNotification(
      admin,
      preference.user_id,
      'daily_nudge_15h',
      dedupeKey,
      subscriptions,
      buildDailyNudgePayload(otherPeopleToday.length, todayKey),
      {
        inactivityDays,
        otherPeopleToday,
        todayKey,
      },
    )

    if (delivered) {
      sent += 1
    }
  }

  return {
    status: 'ok',
    considered,
    sent,
  }
}

async function handleEntryLogged(
  admin: ReturnType<typeof createAdminClient>,
  entryId: string,
) {
  const { data: entryData, error: entryError } = await admin
    .from('entries')
    .select(
      'user_id, reps, created_at, user:users!entries_user_id_fkey ( id, name )',
    )
    .eq('id', entryId)
    .maybeSingle()

  if (entryError) {
    throw new Error(`Failed to load inserted entry: ${entryError.message}`)
  }

  if (!entryData) {
    return {
      status: 'skipped',
      reason: 'entry_not_found',
    }
  }

  const newEntry = entryData as EntryQueryRow
  const todayKey = getBerlinDateKey(new Date(newEntry.created_at))
  const cutoff = new Date(
    new Date(newEntry.created_at).getTime() - 2 * 86_400_000,
  ).toISOString()

  const { data, error } = await admin
    .from('entries')
    .select(
      'user_id, reps, created_at, user:users!entries_user_id_fkey ( id, name )',
    )
    .gte('created_at', cutoff)

  if (error) {
    throw new Error(`Failed to load today leaderboard entries: ${error.message}`)
  }

  const todayEntries = ((data as EntryQueryRow[] | null) ?? []).filter(
    (row) => getBerlinDateKey(new Date(row.created_at)) === todayKey,
  )

  if (todayEntries.length === 0) {
    return {
      status: 'ok',
      sent: 0,
      reason: 'no_today_entries',
    }
  }

  const totalsAfter = aggregateTotals(todayEntries)
  const actorAfter = totalsAfter.get(newEntry.user_id)

  if (!actorAfter) {
    return {
      status: 'ok',
      sent: 0,
      reason: 'actor_not_ranked',
    }
  }

  const totalsBefore = new Map(
    Array.from(totalsAfter.entries()).map(([userId, row]) => [userId, { ...row }]),
  )
  const actorBefore = totalsBefore.get(newEntry.user_id)
  if (actorBefore) {
    actorBefore.totalReps -= newEntry.reps
    if (actorBefore.totalReps <= 0) {
      totalsBefore.delete(newEntry.user_id)
    }
  }

  const beforeRows = buildLeaderboardRows(totalsBefore)
  const afterRows = buildLeaderboardRows(totalsAfter)
  const beforeRanks = new Map(
    beforeRows.map((row, index) => [row.userId, index + 1]),
  )
  const afterRanks = new Map(afterRows.map((row, index) => [row.userId, index + 1]))
  const actorBeforeRank = beforeRanks.get(newEntry.user_id) ?? Number.POSITIVE_INFINITY
  const actorAfterRank = afterRanks.get(newEntry.user_id) ?? Number.POSITIVE_INFINITY

  if (!(actorAfterRank < actorBeforeRank)) {
    return {
      status: 'ok',
      sent: 0,
      reason: 'actor_did_not_improve_rank',
    }
  }

  const overtakenRows = afterRows.filter((row) => {
    if (row.userId === newEntry.user_id) {
      return false
    }

    const previousRank = beforeRanks.get(row.userId) ?? Number.POSITIVE_INFINITY
    const nextRank = afterRanks.get(row.userId) ?? Number.POSITIVE_INFINITY

    return previousRank < actorBeforeRank && nextRank > actorAfterRank
  })

  if (overtakenRows.length === 0) {
    return {
      status: 'ok',
      sent: 0,
      reason: 'no_overtakes',
    }
  }

  const preferenceMap = await loadPreferencesByUser(
    admin,
    overtakenRows.map((row) => row.userId),
  )
  const subscriptionsByUser = await loadSubscriptionsByUser(
    admin,
    overtakenRows.map((row) => row.userId),
  )
  const actorName = actorAfter.name
  let sent = 0

  for (const overtakenRow of overtakenRows) {
    const preferences = preferenceMap.get(overtakenRow.userId)
    if (!preferences?.push_enabled || !preferences.leaderboard_overtaken_today) {
      continue
    }

    const subscriptions = subscriptionsByUser.get(overtakenRow.userId) ?? []
    if (subscriptions.length === 0) {
      continue
    }

    const dedupeKey = [
      'leaderboard_overtaken_today',
      todayKey,
      overtakenRow.userId,
      'by',
      newEntry.user_id,
    ].join(':')

    if (
      (await hasDedupeKey(admin, dedupeKey)) ||
      (await hasRecentNotification(
        admin,
        overtakenRow.userId,
        'leaderboard_overtaken_today',
        OVERTAKEN_COOLDOWN_MINUTES,
      ))
    ) {
      continue
    }

    const delivered = await deliverNotification(
      admin,
      overtakenRow.userId,
      'leaderboard_overtaken_today',
      dedupeKey,
      subscriptions,
      buildOvertakenPayload(
        actorName,
        actorAfter.totalReps,
        overtakenRow.totalReps,
        todayKey,
      ),
      {
        actorId: newEntry.user_id,
        actorName,
        actorTotalReps: actorAfter.totalReps,
        recipientTotalReps: overtakenRow.totalReps,
        todayKey,
      },
    )

    if (delivered) {
      sent += 1
    }
  }

  return {
    status: 'ok',
    overtakenCount: overtakenRows.length,
    sent,
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, { status: 405 })
  }

  try {
    const admin = createAdminClient()
    await ensurePushDeliveryConfig(admin)

    const body = (await req.json()) as DispatchRequest

    if (body.type === 'daily_nudge_scan') {
      return json(await handleDailyNudgeScan(admin))
    }

    if (body.type === 'entry_logged' && typeof body.entryId === 'string') {
      return json(await handleEntryLogged(admin, body.entryId))
    }

    return json({ error: 'Invalid push dispatch payload.' }, { status: 400 })
  } catch (error) {
    console.error('push-dispatch failed', error)

    return json(
      { error: toErrorMessage(error) },
      { status: getStatusCode(error) },
    )
  }
})