import { type Session } from '@supabase/supabase-js'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext } from './AuthContext'
import { supabase } from '../lib/supabaseClient'
import { formatSupabaseErrorMessage } from '../lib/supabaseErrors'
import type { UserProfile } from '../lib/types'

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

  const syncProfile = useCallback(async (activeSession: Session) => {
    const payload = await buildProfile(activeSession)
    const { data, error: upsertError } = await supabase
      .from('users')
      .upsert(payload, { onConflict: 'id' })
      .select()
      .single()

    if (upsertError) {
      setError(formatSupabaseErrorMessage(upsertError))
      setProfile(payload)
      return
    }

    setError(null)
    setProfile(data as UserProfile)
  }, [])

  const applySession = useCallback(async (activeSession: Session | null) => {
    setSession(activeSession)

    if (!activeSession) {
      setProfile(null)
      return
    }

    try {
      await syncProfile(activeSession)
    } catch (syncError) {
      setError(formatSupabaseErrorMessage(syncError as { message?: string }))
    }
  }, [syncProfile])

  useEffect(() => {
    let mounted = true

    const loadSession = async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (!mounted) return
        if (sessionError) {
          setError(formatSupabaseErrorMessage(sessionError))
          return
        }

        await applySession(data.session)
      } catch (sessionLoadError) {
        if (!mounted) return
        setError(
          formatSupabaseErrorMessage(sessionLoadError as { message?: string }),
        )
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void loadSession()

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

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [applySession])

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
