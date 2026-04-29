import NotificationSettingsCard from '../components/NotificationSettingsCard'
import { appCopy } from '../lib/copy'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-800 bg-slate-900/60 px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-200">
          {appCopy.settingsPage.eyebrow}
        </p>
        <h2 className="mt-3 text-2xl font-semibold">
          {appCopy.settingsPage.title}
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          {appCopy.settingsPage.subtitle}
        </p>
      </section>

      <NotificationSettingsCard />
    </div>
  )
}