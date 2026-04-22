function emptyHubState() {
  return {
    status: 'idle',
    learnerId: '',
    payload: null,
    error: '',
    requestToken: 0,
  };
}

export function createDefaultControllerUiState() {
  return {
    auth: {
      required: false,
      mode: 'login',
      error: '',
    },
    tts: {
      playingKind: null,
    },
    adultSurface: {
      selectedLearnerId: '',
      notice: '',
      parentHub: emptyHubState(),
      adminHub: emptyHubState(),
    },
    adminAccountDirectory: {
      status: 'idle',
      accounts: [],
      currentAccount: null,
      error: '',
      savingAccountId: '',
    },
    spellingContentMutation: {
      status: 'idle',
      error: '',
    },
    toastTimers: {
      scheduledIds: [],
    },
  };
}

export function buildControllerSnapshot({
  store,
  repositories,
  services,
  subjects,
  session,
  runtimeBoundary,
  uiState,
} = {}) {
  return {
    appState: store.getState(),
    repositories,
    services,
    subjects,
    session: session || { signedIn: false, mode: 'local-only' },
    runtimeBoundary,
    ui: uiState || createDefaultControllerUiState(),
  };
}
