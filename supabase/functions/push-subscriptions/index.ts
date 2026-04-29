import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import {
  authenticateRequest,
  createAdminClient,
  ensureNotificationPreferences,
  ensurePushDeliveryConfig,
  getStatusCode,
  json,
  toErrorMessage,
  validateSubscriptionPayload,
} from '../_shared/push.ts'

type ClientPreferences = {
  pushEnabled: boolean
  dailyNudge15h: boolean
  leaderboardOvertakenToday: boolean
}

type ActionBody =
  | { action: 'state' }
  | {
      action: 'subscribe'
      subscription: unknown
      preferences?: Partial<ClientPreferences>
    }
  | { action: 'unsubscribe'; endpoint?: string | null }
  | {
      action: 'update_preferences'
      preferences: Partial<ClientPreferences>
    }

function buildCorsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function jsonWithCors(
  origin: string | null,
  body: unknown,
  init: ResponseInit = {},
) {
  const response = json(body, init)
  const corsHeaders = buildCorsHeaders(origin)

  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value)
  })

  return response
}

async function savePreferences(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  preferences: Partial<ClientPreferences>,
) {
  const current = await ensureNotificationPreferences(admin, userId)
  const payload = {
    user_id: userId,
    push_enabled: preferences.pushEnabled ?? current.push_enabled,
    daily_nudge_15h: preferences.dailyNudge15h ?? current.daily_nudge_15h,
    leaderboard_overtaken_today:
      preferences.leaderboardOvertakenToday ??
      current.leaderboard_overtaken_today,
  }

  const { error } = await admin
    .from('notification_preferences')
    .upsert(payload, { onConflict: 'user_id' })

  if (error) {
    throw new Error(`Failed to save notification preferences: ${error.message}`)
  }
}

async function buildState(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  const [config, preferences, subscriptionResult] = await Promise.all([
    ensurePushDeliveryConfig(admin),
    ensureNotificationPreferences(admin, userId),
    admin
      .from('push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('disabled_at', null),
  ])

  if (subscriptionResult.error) {
    throw new Error(
      `Failed to load push subscriptions: ${subscriptionResult.error.message}`,
    )
  }

  const activeCount = subscriptionResult.count ?? 0

  return {
    publicKey: config.vapid_public_key,
    preferences: {
      pushEnabled: preferences.push_enabled,
      dailyNudge15h: preferences.daily_nudge_15h,
      leaderboardOvertakenToday: preferences.leaderboard_overtaken_today,
    },
    hasActiveSubscription: activeCount > 0,
    subscriptionCount: activeCount,
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: buildCorsHeaders(origin),
    })
  }

  if (req.method !== 'POST') {
    return jsonWithCors(
      origin,
      { error: 'Method not allowed.' },
      { status: 405 },
    )
  }

  try {
    const admin = createAdminClient()
    const user = await authenticateRequest(req, admin)
    const body = (await req.json()) as ActionBody

    switch (body.action) {
      case 'state': {
        const state = await buildState(admin, user.id)
        return jsonWithCors(origin, state)
      }

      case 'subscribe': {
        const subscription = validateSubscriptionPayload(body.subscription)

        await admin.from('push_subscriptions').upsert(
          {
            user_id: user.id,
            endpoint: subscription.endpoint,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
            expiration_time: subscription.expirationTime ?? null,
            user_agent: req.headers.get('user-agent'),
            disabled_at: null,
            last_error: null,
          },
          { onConflict: 'endpoint' },
        )

        await savePreferences(admin, user.id, {
          pushEnabled: true,
          ...body.preferences,
        })

        const state = await buildState(admin, user.id)
        return jsonWithCors(origin, state)
      }

      case 'unsubscribe': {
        const endpoint = body.endpoint?.trim()
        let query = admin
          .from('push_subscriptions')
          .update({
            disabled_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)

        if (endpoint) {
          query = query.eq('endpoint', endpoint)
        }

        const { error } = await query

        if (error) {
          throw new Error(`Failed to disable push subscription: ${error.message}`)
        }

        await savePreferences(admin, user.id, {
          pushEnabled: false,
        })

        const state = await buildState(admin, user.id)
        return jsonWithCors(origin, state)
      }

      case 'update_preferences': {
        await savePreferences(admin, user.id, body.preferences)
        const state = await buildState(admin, user.id)
        return jsonWithCors(origin, state)
      }

      default:
        return jsonWithCors(
          origin,
          { error: 'Unknown push action.' },
          { status: 400 },
        )
    }
  } catch (error) {
    console.error('push-subscriptions failed', error)

    return jsonWithCors(
      origin,
      { error: toErrorMessage(error) },
      { status: getStatusCode(error) },
    )
  }
})