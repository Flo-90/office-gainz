import { type Session } from '@supabase/supabase-js'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AuthContext } from './AuthContext'
import { supabase } from '../lib/supabaseClient'
import { formatSupabaseErrorMessage } from '../lib/supabaseErrors'
import type { UserProfile } from '../lib/types'

function isTransientAuthLoadError(error: unknown) {
  const message = formatSupabaseErrorMessage(error as { message?: string })

  return /load failed|failed to fetch|networkerror|network request failed/i.test(
    message,
  )
}

async function buildProfile(session: Session): Promise<UserProfile> {
  const user = session.user
  if (!user.email) {
    throw new Error('Authenticated user missing email address.')
  }

  const name =
    (user.user_metadata.full_name as string | undefined) ??
    (user.user_metadata.name as string | undefined) ??
    user.email.split('@')[0]

  const avatarUrl = (user.user_metadata.avatar_url as string | undefined) ?? null

  return {
    id: user.id,
    email: user.email,
    name,
    avatar_url: avatarUrl,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const sessionRef = useRef<Session | null>(null)
  const profileRef = useRef<UserProfile | null>(null)
  const lastForegroundSessionRefreshAtRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    profileRef.current = profile
  }, [profile])

  const handleAuthError = useCallback((authError: unknown) => {
    if (!mountedRef.current) {
      return
    }

    const message = formatSupabaseErrorMessage(authError as { message?: string })

    if (
      isTransientAuthLoadError(authError) &&
      (sessionRef.current !== null || profileRef.current !== null)
    ) {
      setError(null)
      return
    }

    setError(message)
  }, [])

  const syncProfile = useCallback(async (activeSession: Session) => {
    const payload = await buildProfile(activeSession)
    const { data, error: upsertError } = await supabase
      .from('users')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single()

    if (!mountedRef.current) {
      return
    }

    if (upsertError) {
      setError(formatSupabaseErrorMessage(upsertError))
      setProfile(payload)
      return
    }

    setError(null)
    setProfile(data as UserProfile)
  }, [])

  const applySession = useCallback(async (activeSession: Session | null) => {
    if (!mountedRef.current) {
      return
    }

    setSession(activeSession)

    if (!activeSession) {
      setError(null)
      setProfile(null)
      return
    }

    try {
      await syncProfile(activeSession)
    } catch (syncError) {
      handleAuthError(syncError)
    }
  }, [handleAuthError, syncProfile])

  const refreshSession = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const { data, error: sessionError } = await supabase.auth.getSession()

      if (sessionError) {
        handleAuthError(sessionError)
        return
      }

      await applySession(data.session)
    } catch (sessionLoadError) {
      handleAuthError(sessionLoadError)
    } finally {
      if (!options?.silent) {
        setLoading(false)
      }
    }
  }, [applySession, handleAuthError])

  const retrySessionSync = useCallback(() => {
    if (document.visibilityState === 'hidden') {
      return
    }

    const now = Date.now()
    if (now - lastForegroundSessionRefreshAtRef.current < 1500) {
      return
    }

    lastForegroundSessionRefreshAtRef.current = now
    void refreshSession({ silent: true })
  }, [refreshSession])

  useEffect(() => {
    let mounted = true

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        retrySessionSync()
      }
    }

    const handleFocus = () => {
      retrySessionSync()
    }

    const handleOnline = () => {
      retrySessionSync()
    }

    const handlePageShow = () => {
      retrySessionSync()
    }

    const initialRefreshTimer = window.setTimeout(() => {
      if (mounted) {
        void refreshSession()
      }
    }, 0)

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      window.setTimeout(() => {
        if (!mounted) return

        void applySession(newSession).finally(() => {
          if (mounted) {
            setLoading(false)
          }
        })
      }, 0)
    })

    window.addEventListener('focus', handleFocus)
    window.addEventListener('online', handleOnline)
    window.addEventListener('pageshow', handlePageShow)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      mounted = false
      window.clearTimeout(initialRefreshTimer)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('pageshow', handlePageShow)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      listener.subscription.unsubscribe()
    }
  }, [applySession, refreshSession, retrySessionSync])

  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      error,
      signInWithGoogle: async () => {
        setError(null)
        const { error: signInError } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin,
          },
        })
        if (signInError) {
          setError(formatSupabaseErrorMessage(signInError))
          throw signInError
        }
      },
      signOut: async () => {
        setError(null)
        const { error: signOutError } = await supabase.auth.signOut()
        if (signOutError) {
          setError(formatSupabaseErrorMessage(signOutError))
          throw signOutError
        }
      },
    }),
    [session, profile, loading, error],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
