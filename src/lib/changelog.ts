export type ChangelogEntry = {
  version: string
  title: string
  bullets: string[]
}

const STORAGE_KEY = 'officegainz-last-seen-changelog'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

let cached: ChangelogEntry[] | null = null
let inflight: Promise<ChangelogEntry[]> | null = null

function parseChangelog(raw: string): ChangelogEntry[] {
  const sections = raw.split(/^## /m).slice(1)
  const entries: ChangelogEntry[] = []

  for (const section of sections) {
    const lines = section.split('\n')
    const headline = lines[0]?.trim() ?? ''
    const [versionPart, ...titleParts] = headline.split(/\s+[—-]\s+/)
    const version = versionPart?.trim() ?? ''

    if (!ISO_DATE.test(version)) {
      continue
    }

    const title = titleParts.join(' — ').trim()
    const bullets = lines
      .slice(1)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).trim())

    entries.push({ version, title, bullets })
  }

  return entries.sort((left, right) => right.version.localeCompare(left.version))
}

export async function fetchChangelog(): Promise<ChangelogEntry[]> {
  if (cached) return cached
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const response = await fetch('/CHANGELOG.md', { cache: 'no-cache' })
      if (!response.ok) {
        cached = []
        return cached
      }

      const text = await response.text()
      cached = parseChangelog(text)
      return cached
    } catch {
      cached = []
      return cached
    } finally {
      inflight = null
    }
  })()

  return inflight
}

function getLastSeenVersion(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function setLastSeenVersion(version: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, version)
  } catch {
    // localStorage may be unavailable (private mode, quota exceeded).
  }
}

export async function getUnseenChangelogEntries(): Promise<ChangelogEntry[]> {
  const entries = await fetchChangelog()
  if (entries.length === 0) return []

  const lastSeen = getLastSeenVersion()

  if (lastSeen === null) {
    setLastSeenVersion(entries[0].version)
    return []
  }

  return entries.filter((entry) => entry.version > lastSeen)
}

export async function markAllChangelogSeen(): Promise<void> {
  const entries = await fetchChangelog()
  if (entries.length > 0) {
    setLastSeenVersion(entries[0].version)
  }
}
