import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { appCopy } from '../lib/copy'

export default function LoginPage() {
  const { session, signInWithGoogle, error } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (session) {
      navigate('/', { replace: true })
    }
  }, [session, navigate])

  const handleSignIn = async () => {
    setLoading(true)
    try {
      await signInWithGoogle()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-slate-800 bg-slate-900/40 p-8 shadow-xl shadow-black/30">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300">
            {appCopy.login.eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-semibold">{appCopy.login.title}</h1>
          <p className="mt-2 text-sm text-slate-400">
            {appCopy.login.subtitle}
          </p>
        </div>

        <button
          type="button"
          onClick={handleSignIn}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={loading}
        >
          {loading
            ? appCopy.login.openingGoogle
            : appCopy.login.continueWithGoogle}
        </button>

        {error ? (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  )
}
