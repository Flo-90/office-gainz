export const appCopy = {
  common: {
    appName: 'OfficeGainz',
    userFallbackName: 'OfficeGainz Athlete',
    signOut: 'Sign out',
    close: 'Close',
    repsLabel: 'reps',
    youLabel: 'You',
    unexpectedError: 'Something went wrong.',
  },
  navigation: {
    log: 'Log',
    leaderboard: 'Leaderboard',
    exercises: 'Exercises',
    settings: 'Settings',
  },
  layout: {
    tagline: 'DER KESSEL MUSS BRENNEN!',
    authWarningPrefix: 'Auth warning:',
    profileMenuButtonLabel: 'Open profile menu',
    profileMenuHint: 'Settings and sign out',
    profileMenuTitle: 'Account',
  },
  protectedRoute: {
    loading: 'Loading OfficeGainz...',
  },
  login: {
    eyebrow: 'OfficeGainz',
    title: 'Team fitness, zero fuss.',
    subtitle:
      'Log reps, climb the leaderboard, and keep your remote crew moving.',
    continueWithGoogle: 'Continue with Google',
    openingGoogle: 'Opening Google…',
  },
  installPrompt: {
    eyebrow: 'Install App',
    promptDescription:
      'Save OfficeGainz to your home screen for quick launches like a real app.',
    iosDescription:
      'On iPhone, tap Share and then Add to Home Screen to save OfficeGainz as a web app.',
    installButton: 'Install',
    safariHint:
      'Safari only. The icon appears after adding it from the Share menu.',
  },
  appUpdate: {
    eyebrow: 'Update Ready',
    title: 'A new version of OfficeGainz is available.',
    description:
      'Refresh once to pull the latest changes into the installed app.',
    refreshButton: 'Refresh app',
    laterButton: 'Later',
  },
  logPage: {
    todayLabel: 'Today',
    summaryDescription: 'Disziplin schlägt Talent, jeden verdammten Tag.',
    quickLogTitle: 'Quick log',
    quickLogHint: 'Tap • Spin • Save',
    loadingExercises: 'Loading your exercises…',
    noExercises: 'No exercises yet. Head to Exercises to add your first one.',
    logAction: 'Log',
    repsFieldLabel: 'Reps',
    wheelHint: 'Swipe the wheel or tap a preset to lock in your reps fast.',
    saveButton: 'Save reps',
    savingButton: 'Saving…',
    invalidRepsError: 'Reps need to be a positive number.',
    loadError: 'Failed to load log data.',
    saveError: 'Failed to log reps.',
    buildLogHint(exerciseName: string) {
      return `Log ${exerciseName}`
    },
    buildSaveButton(reps: number) {
      return `Log ${reps} reps`
    },
  },
  settingsPage: {
    eyebrow: 'Control Center',
    title: 'Settings',
    subtitle:
      'Manage push alerts here without cluttering the quick logging flow.',
  },
  exercisesPage: {
    title: 'Exercises',
    subtitle: 'Add anything your team loves, from squats to stretch breaks.',
    inputPlaceholder: 'New exercise name',
    addButton: 'Add exercise',
    addingButton: 'Adding…',
    loadingList: 'Loading the exercise list…',
    emptyState: 'No exercises yet. Add the first one above.',
    emptyNameError: 'Exercise name cannot be empty.',
    loadError: 'Failed to load exercises.',
    addError: 'Failed to add exercise.',
  },
  leaderboardPage: {
    title: 'Leaderboard',
    subtitle: 'Wer will, findet Wege zum Platz 1. Wer nicht will, findet Termine.',
    timeframes: {
      today: 'Today',
      week: 'This Week',
      all: 'All Time',
    },
    modes: {
      total: 'Total',
      exercise: 'By Exercise',
    },
    exerciseFilterLabel: 'Exercise',
    tapUserHint: 'Tap a row to inspect where the reps come from.',
    loading: 'Calculating the latest reps…',
    loadingExercises: 'Loading exercises…',
    emptyState: 'No reps logged yet for this timeframe.',
    loadError: 'Failed to load leaderboard.',
    exerciseLoadError: 'Failed to load exercises for the leaderboard.',
    breakdownLoadError: 'Failed to load the exercise mix.',
    currentRank(rank: number) {
      return `Dein Zündkerzen Rank ist: #${rank}.`
    },
    exerciseEmptyState(exerciseName: string) {
      return `No reps logged for ${exerciseName} in this timeframe yet.`
    },
    noExercisesAvailable: 'No exercises yet. Add one first.',
    userSheet: {
      title: 'Rep breakdown',
      currentSliceLabel: 'Current view',
      rankLabel: 'Rank',
      exerciseMixTitle: 'Exercise mix',
      loading: 'Loading exercise mix…',
      emptyState: 'No reps logged for this timeframe yet.',
      buildSliceLabel(exerciseName: string | null) {
        return exerciseName ? `${exerciseName} reps` : 'Total reps'
      },
      buildSubtitle(timeframeLabel: string) {
        return `Where the reps come from in ${timeframeLabel.toLowerCase()}.`
      },
      buildContributionLabel(share: number) {
        return `${share}% of reps`
      },
    },
  },
  notifications: {
    eyebrow: 'Notifications',
    title: 'Stay in the office race',
    subtitle:
      'Turn on challenge nudges and overtaken alerts for the installable app.',
    pushToggleLabel: 'Push',
    browserLabel: 'Browser',
    accountLabel: 'Account',
    scopeLabel: 'Scope',
    scopeValue: 'Challenge only',
    scopeDescription:
      'Daily 15:00 nudges and same-day overtaken alerts. No personal milestone spam.',
    supportedBrowserDescription:
      'Use the deployed app to register the current browser for push.',
    unsupportedBrowserDescription:
      'This browser or context cannot receive push notifications.',
    permissionStatus: {
      unsupported: 'Unsupported',
      granted: 'Permission granted',
      denied: 'Permission blocked',
      default: 'Permission not decided',
    },
    accountStatus: {
      loading: 'Loading…',
      enabled: 'Push enabled',
      disabled: 'Push disabled',
      syncing: 'Syncing your notification state.',
    },
    subscriptionCount(count: number) {
      if (count <= 0) {
        return 'No active browser subscription yet.'
      }

      if (count === 1) {
        return 'Active on 1 browser.'
      }

      return `Active on ${count} browsers.`
    },
    dailyNudge: {
      title: '15:00 daily nudge',
      description:
        'Only when others have logged today and you are slipping into a short inactivity streak.',
    },
    overtakenToday: {
      title: 'Overtaken today',
      description:
        'Fires when somebody passes you on the today leaderboard and the cooldown allows it.',
    },
    errors: {
      unsupportedPush:
        'This browser does not support web push notifications.',
      missingServerConfig:
        'Push delivery is not configured on the server yet.',
      permissionRequired:
        'Browser permission is required before OfficeGainz can send push notifications.',
    },
  },
} as const