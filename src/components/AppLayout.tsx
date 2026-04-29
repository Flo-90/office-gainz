import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/useAuth'
import { appCopy } from '../lib/copy'

const navItems = [
  { to: '/', label: appCopy.navigation.log },
  { to: '/leaderboard', label: appCopy.navigation.leaderboard },
  { to: '/exercises', label: appCopy.navigation.exercises },
]

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export default function AppLayout() {
  const { profile, signOut, error } = useAuth()
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement | null>(null)

  const displayName =
    profile?.name ?? profile?.email ?? appCopy.common.userFallbackName

  useEffect(() => {
    if (!isProfileMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setIsProfileMenuOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsProfileMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isProfileMenuOpen])

  const closeProfileMenu = () => {
    setIsProfileMenuOpen(false)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              {appCopy.common.appName}
            </p>
            <p className="text-lg font-semibold">{appCopy.layout.tagline}</p>
          </div>
          <div className="relative" ref={profileMenuRef}>
            <button
              type="button"
              onClick={() => setIsProfileMenuOpen((current) => !current)}
              className="flex items-center gap-3 rounded-full border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-left transition hover:border-slate-700 hover:bg-slate-900"
              aria-haspopup="menu"
              aria-expanded={isProfileMenuOpen}
              aria-label={appCopy.layout.profileMenuButtonLabel}
            >
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={displayName}
                  className="h-9 w-9 rounded-full border border-slate-800"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-xs font-semibold">
                  {initials(displayName)}
                </div>
              )}
              <div className="hidden min-w-0 sm:block">
                <p className="truncate text-sm font-semibold">{displayName}</p>
              </div>
            </button>

            {isProfileMenuOpen ? (
              <div
                className="absolute right-0 top-[calc(100%+0.75rem)] z-40 w-56 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/95 shadow-2xl shadow-black/40 backdrop-blur"
                role="menu"
              >
                <div className="border-b border-slate-800 px-4 py-3">
                  <p className="truncate text-sm font-semibold text-slate-100">
                    {displayName}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {appCopy.layout.profileMenuTitle}
                  </p>
                </div>
                <div className="p-2">
                  <NavLink
                    to="/settings"
                    onClick={closeProfileMenu}
                    className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
                    role="menuitem"
                  >
                    {appCopy.navigation.settings}
                  </NavLink>
                  <button
                    type="button"
                    onClick={() => {
                      closeProfileMenu()
                      void signOut()
                    }}
                    className="mt-1 block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
                    role="menuitem"
                  >
                    {appCopy.common.signOut}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        {error ? (
          <div className="border-t border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
            {appCopy.layout.authWarningPrefix} {error}
          </div>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                [
                  'rounded-full px-3 py-2 text-sm font-semibold transition',
                  isActive
                    ? 'bg-emerald-400/15 text-emerald-200'
                    : 'text-slate-400 hover:text-slate-200',
                ].join(' ')
              }
              end={item.to === '/'}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
