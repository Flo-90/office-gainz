type AppUpdateSnapshot = {
  updateAvailable: boolean
}

const listeners = new Set<(snapshot: AppUpdateSnapshot) => void>()

const state: AppUpdateSnapshot = {
  updateAvailable: false,
}

let registration: ServiceWorkerRegistration | null = null
let initialized = false
let lifecycleBound = false
let controllerChangeBound = false
let shouldReloadOnControllerChange = false

function emit() {
  const snapshot = { ...state }

  listeners.forEach((listener) => {
    listener(snapshot)
  })
}

function setUpdateAvailable(nextValue: boolean) {
  if (state.updateAvailable === nextValue) {
    return
  }

  state.updateAvailable = nextValue
  emit()
}

function extractBuildId(html: string) {
  const match = html.match(
    /<meta\s+name=["']officegainz-build["']\s+content=["']([^"']+)["']/i,
  )

  return match?.[1] ?? null
}

async function checkForLatestBuild() {
  try {
    const response = await fetch(`/?build-check=${Date.now()}`, {
      cache: 'no-store',
    })

    if (!response.ok) {
      return
    }

    const html = await response.text()
    const latestBuildId = extractBuildId(html)

    if (latestBuildId && latestBuildId !== __APP_BUILD_ID__) {
      setUpdateAvailable(true)
      void registration?.update().catch(() => undefined)
    }
  } catch {
    // Ignore update checks when offline or when the app shell is unreachable.
  }
}

function scheduleUpdateCheck() {
  void checkForLatestBuild()
  void registration?.update().catch(() => undefined)
}

function bindLifecycleChecks() {
  if (lifecycleBound) {
    return
  }

  lifecycleBound = true

  window.addEventListener('focus', scheduleUpdateCheck)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      scheduleUpdateCheck()
    }
  })
}

function bindControllerChangeReload() {
  if (controllerChangeBound) {
    return
  }

  controllerChangeBound = true

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (shouldReloadOnControllerChange) {
      window.location.reload()
    }
  })
}

function watchRegistration(nextRegistration: ServiceWorkerRegistration) {
  registration = nextRegistration

  if (nextRegistration.waiting) {
    setUpdateAvailable(true)
  }

  nextRegistration.addEventListener('updatefound', () => {
    const worker = nextRegistration.installing

    if (!worker) {
      return
    }

    worker.addEventListener('statechange', () => {
      if (
        worker.state === 'installed' &&
        navigator.serviceWorker.controller
      ) {
        setUpdateAvailable(true)
      }
    })
  })
}

export function subscribeToAppUpdates(
  listener: (snapshot: AppUpdateSnapshot) => void,
) {
  listeners.add(listener)
  listener({ ...state })

  return () => {
    listeners.delete(listener)
  }
}

export function applyAppUpdate() {
  if (registration?.waiting) {
    shouldReloadOnControllerChange = true
    registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    return
  }

  window.location.reload()
}

export function registerAppServiceWorker() {
  if (initialized || !import.meta.env.PROD || !('serviceWorker' in navigator)) {
    return
  }

  initialized = true
  bindControllerChangeReload()
  bindLifecycleChecks()

  window.addEventListener(
    'load',
    () => {
      void navigator.serviceWorker
        .register(`/sw.js?build=${encodeURIComponent(__APP_BUILD_ID__)}`, {
          scope: '/',
        })
        .then((nextRegistration) => {
          watchRegistration(nextRegistration)
          scheduleUpdateCheck()
        })
        .catch(() => undefined)
    },
    { once: true },
  )
}