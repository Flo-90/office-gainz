import { supabase, supabaseAnonKey, supabaseUrl } from './supabaseClient'
import type { NotificationPreferences, PushState } from './types'

type PushStateAction = {
  action: 'state'
}

type PushSubscribeAction = {
  action: 'subscribe'
  subscription: PushSubscriptionJSON
  preferences?: Partial<NotificationPreferences>
}

type PushUpdatePreferencesAction = {
  action: 'update_preferences'
  preferences: Partial<NotificationPreferences>
}

type PushUnsubscribeAction = {
  action: 'unsubscribe'
  endpoint?: string | null
}

type PushAction =
  | PushStateAction
  | PushSubscribeAction
  | PushUpdatePreferencesAction
  | PushUnsubscribeAction

function functionUrl(name: string) {
  return `${supabaseUrl}/functions/v1/${name}`
}

function errorMessageFromPayload(payload: unknown) {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    typeof payload.error === 'string'
  ) {
    return payload.error
  }

  return null
}

async function invokePushAction<T>(body: PushAction): Promise<T> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()

  if (error) {
    throw new Error(error.message)
  }

  if (!session) {
    throw new Error('You need to be signed in to manage push notifications.')
  }

  const response = await fetch(functionUrl('push-subscriptions'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  })

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new Error(
      errorMessageFromPayload(payload) ?? 'Push request failed unexpectedly.',
    )
  }

  return payload as T
}

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index)
  }

  return output
}

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

async function getPushRegistration() {
  const registration = await navigator.serviceWorker.getRegistration()

  if (!registration) {
    throw new Error(
      'Push needs the deployed app with an active service worker. Open the production app and try again.',
    )
  }

  return registration
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) {
    return 'unsupported'
  }

  return Notification.permission
}

export async function requestPushPermission() {
  if (!('Notification' in window)) {
    throw new Error('This browser does not support notifications.')
  }

  return Notification.requestPermission()
}

export async function getExistingPushSubscription() {
  if (!isPushSupported()) {
    return null
  }

  const registration = await getPushRegistration()
  return registration.pushManager.getSubscription()
}

export async function subscribeBrowserPush(publicKey: string) {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported in this browser.')
  }

  const registration = await getPushRegistration()
  const existing = await registration.pushManager.getSubscription()
  if (existing) {
    return existing.toJSON()
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })

  return subscription.toJSON()
}

export async function unsubscribeBrowserPush() {
  const existing = await getExistingPushSubscription()
  if (!existing) {
    return null
  }

  const endpoint = existing.endpoint
  await existing.unsubscribe()
  return endpoint
}

export function fetchPushState() {
  return invokePushAction<PushState>({ action: 'state' })
}

export function savePushSubscription(
  subscription: PushSubscriptionJSON,
  preferences?: Partial<NotificationPreferences>,
) {
  return invokePushAction<PushState>({
    action: 'subscribe',
    subscription,
    preferences,
  })
}

export function updatePushPreferences(
  preferences: Partial<NotificationPreferences>,
) {
  return invokePushAction<PushState>({
    action: 'update_preferences',
    preferences,
  })
}

export function disablePushSubscription(endpoint?: string | null) {
  return invokePushAction<PushState>({
    action: 'unsubscribe',
    endpoint,
  })
}