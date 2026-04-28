import { type Session } from '@supabase/supabase-js'
import { createContext } from 'react'
import type { UserProfile } from '../lib/types'

export type AuthContextValue = {
  session: Session | null
  profile: UserProfile | null
  loading: boolean
  error: string | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
)
