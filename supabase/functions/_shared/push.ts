import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

export type NotificationPreferencesRow = {
  user_id: string
  push_enabled: boolean
  daily_nudge_15h: boolean
  leaderboard_overtaken_today: boolean
  streak_at_risk_15h: boolean
}

export type PushDeliveryConfigRow = {
  id: boolean
  project_url: string
  function_auth: string
  vapid_public_key: string | null
  vapid_private_key: string | null
  vapid_subject: string
}

export type StoredSubscriptionRow = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  expiration_time: number | null
  disabled_at: string | null
}

export type WebPushSubscriptionPayload = {
  endpoint: string
  expirationTime?: number | null
  keys: {
    p256dh: string
    auth: string
  }
}

export class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

const berlinFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) {
    throw new HttpError(500, `Missing required environment variable: ${name}`)
  }

  return value
}

export function createAdminClient() {
  return createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}

export async function authenticateRequest(
  req: Request,
  admin = createAdminClient(),
) {
  const authHeader =
    req.headers.get('authorization') ?? req.headers.get('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Missing authorization header.')
  }

  const token = authHeader.slice('Bearer '.length)
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token)

  if (error || !user) {
    throw new HttpError(401, 'Invalid or expired authorization token.')
  }

  return user
}

export async function ensureNotificationPreferences(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<NotificationPreferencesRow> {
  const { data, error } = await admin
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new HttpError(500, `Failed to load notification preferences: ${error.message}`)
  }

  if (data) {
    return data as NotificationPreferencesRow
  }

  const { data: inserted, error: insertError } = await admin
    .from('notification_preferences')
    .insert({ user_id: userId })
    .select('*')
    .single()

  if (insertError) {
    throw new HttpError(
      500,
      `Failed to create notification preferences: ${insertError.message}`,
    )
  }

  return inserted as NotificationPreferencesRow
}

export async function ensurePushDeliveryConfig(
  admin: ReturnType<typeof createAdminClient>,
): Promise<PushDeliveryConfigRow> {
  const { data, error } = await admin
    .from('push_delivery_config')
    .select('*')
    .eq('id', true)
    .maybeSingle()

  if (error) {
    throw new HttpError(500, `Failed to load push configuration: ${error.message}`)
  }

  if (!data) {
    throw new HttpError(
      503,
      'Push delivery is not configured yet. Run public.configure_push_delivery first.',
    )
  }

  let config = data as PushDeliveryConfigRow

  if (!config.vapid_public_key || !config.vapid_private_key) {
    const vapidKeys = webpush.generateVAPIDKeys()
    const { data: updated, error: updateError } = await admin
      .from('push_delivery_config')
      .update({
        vapid_public_key: vapidKeys.publicKey,
        vapid_private_key: vapidKeys.privateKey,
      })
      .eq('id', true)
      .select('*')
      .single()

    if (updateError) {
      throw new HttpError(
        500,
        `Failed to persist VAPID keys: ${updateError.message}`,
      )
    }

    config = updated as PushDeliveryConfigRow
  }

  webpush.setVapidDetails(
    config.vapid_subject,
    config.vapid_public_key,
    config.vapid_private_key,
  )

  return config
}

export function validateSubscriptionPayload(
  value: unknown,
): WebPushSubscriptionPayload {
  const subscription = value as Partial<WebPushSubscriptionPayload> | null
  const endpoint = subscription?.endpoint
  const p256dh = subscription?.keys?.p256dh
  const auth = subscription?.keys?.auth

  if (
    typeof endpoint !== 'string' ||
    typeof p256dh !== 'string' ||
    typeof auth !== 'string'
  ) {
    throw new HttpError(400, 'Invalid push subscription payload.')
  }

  return {
    endpoint,
    expirationTime:
      typeof subscription.expirationTime === 'number'
        ? subscription.expirationTime
        : null,
    keys: {
      p256dh,
      auth,
    },
  }
}

export function json(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  })
}

export function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unexpected error'
}

export function getStatusCode(error: unknown) {
  if (error instanceof HttpError) {
    return error.status
  }

  return 500
}

export function getBerlinParts(date = new Date()) {
  const rawParts = berlinFormatter.formatToParts(date)
  const parts = rawParts.reduce<Record<string, string>>((accumulator, part) => {
    if (part.type !== 'literal') {
      accumulator[part.type] = part.value
    }

    return accumulator
  }, {})

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

export function getBerlinDateKey(date = new Date()) {
  const parts = getBerlinParts(date)
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function getBerlinDayDifference(from: Date, to: Date) {
  const fromParts = getBerlinParts(from)
  const toParts = getBerlinParts(to)
  const fromValue = Date.UTC(
    Number(fromParts.year),
    Number(fromParts.month) - 1,
    Number(fromParts.day),
  )
  const toValue = Date.UTC(
    Number(toParts.year),
    Number(toParts.month) - 1,
    Number(toParts.day),
  )

  return Math.round((toValue - fromValue) / 86_400_000)
}