import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  readonly platforms: string[]
  prompt: () => Promise<void>
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
}

const DISMISS_KEY = 'officegainz-install-dismissed'

function isIosSafari(): boolean {
  const userAgent = window.navigator.userAgent
  const isIos = /iphone|ipad|ipod/i.test(userAgent)
  const isSafari = /safari/i.test(userAgent) && !/crios|fxios|edgios|chrome|android/i.test(userAgent)
  return isIos && isSafari
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [standalone, setStandalone] = useState(false)
  const [iosHint, setIosHint] = useState(() => {
    if (typeof window === 'undefined') return false
    return isIosSafari()
  })
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return true
    return window.localStorage.getItem(DISMISS_KEY) === '1'
  })

  useEffect(() => {
    const mediaQuery = window.matchMedia('(display-mode: standalone)')

    const syncStandalone = () => {
      const navigatorWithStandalone = window.navigator as Navigator & {
        standalone?: boolean
      }
      setStandalone(
        mediaQuery.matches || navigatorWithStandalone.standalone === true,
      )
    }

    syncStandalone()

    const handleDisplayModeChange = () => syncStandalone()

    mediaQuery.addEventListener('change', handleDisplayModeChange)

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
      setIosHint(false)
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1')
    }

    const handleInstalled = () => {
      setStandalone(true)
      setDeferredPrompt(null)
      window.localStorage.removeItem(DISMISS_KEY)
    }

    window.addEventListener(
      'beforeinstallprompt',
      handleBeforeInstallPrompt as EventListener,
    )
    window.addEventListener('appinstalled', handleInstalled)

    return () => {
      mediaQuery.removeEventListener('change', handleDisplayModeChange)
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt as EventListener,
      )
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  const dismiss = () => {
    setDismissed(true)
    window.localStorage.setItem(DISMISS_KEY, '1')
  }

  const install = async () => {
    if (!deferredPrompt) return

    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'dismissed') {
      dismiss()
    }

    setDeferredPrompt(null)
  }

  if (standalone || dismissed) return null

  const showPrompt = Boolean(deferredPrompt)
  if (!showPrompt && !iosHint) return null

  return (
    <div className="fixed inset-x-0 bottom-20 z-40 px-4 sm:bottom-6">
      <div className="mx-auto max-w-md rounded-3xl border border-slate-800 bg-slate-900/95 p-4 shadow-xl shadow-black/40 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Install App
            </p>
            {showPrompt ? (
              <p className="mt-2 text-sm text-slate-300">
                Save OfficeGainz to your home screen for quick launches like a real app.
              </p>
            ) : (
              <p className="mt-2 text-sm text-slate-300">
                On iPhone, tap Share and then Add to Home Screen to save OfficeGainz as a web app.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="text-sm text-slate-500 hover:text-slate-200"
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          {showPrompt ? (
            <button
              type="button"
              onClick={() => void install()}
              className="rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
            >
              Install
            </button>
          ) : null}
          {iosHint ? (
            <p className="text-xs text-slate-400">
              Safari only. The icon appears after adding it from the Share menu.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}