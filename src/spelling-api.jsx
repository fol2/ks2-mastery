const KS2Spelling = (() => {
  async function dashboard() {
    const payload = await window.KS2App.requestJson('/api/spelling/dashboard');
    window.KS2App.setSpellingData({ spelling: payload.spelling });
    return payload.spelling;
  }

  async function savePrefs(prefs) {
    const payload = await window.KS2App.saveSpellingPrefs(prefs);
    return payload.spelling;
  }

  async function startSession(options) {
    const payload = await window.KS2App.requestJson('/api/spelling/sessions', {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
    return payload.session;
  }

  async function submit(sessionId, typed) {
    const payload = await window.KS2App.requestJson(`/api/spelling/sessions/${encodeURIComponent(sessionId)}/submit`, {
      method: 'POST',
      body: JSON.stringify({ typed }),
    });
    if (payload.monsters) window.KS2App.setSpellingData({ monsters: payload.monsters });
    return payload;
  }

  async function skip(sessionId) {
    return window.KS2App.requestJson(`/api/spelling/sessions/${encodeURIComponent(sessionId)}/skip`, {
      method: 'POST',
      body: '{}',
    });
  }

  async function advance(sessionId) {
    const payload = await window.KS2App.requestJson(`/api/spelling/sessions/${encodeURIComponent(sessionId)}/advance`, {
      method: 'POST',
      body: '{}',
    });
    if (payload.monsters || payload.spelling) {
      window.KS2App.setSpellingData({
        monsters: payload.monsters,
        spelling: payload.spelling,
      });
    }
    return payload;
  }

  function stageLabel(stage) {
    if (stage >= 4) return 'Secure';
    if (stage <= 0) return 'New / due today';
    const intervals = [0, 1, 3, 7, 14, 30, 60];
    const interval = intervals[Math.min(stage, intervals.length - 1)];
    return `Next review in ${interval} day${interval === 1 ? '' : 's'}`;
  }

  function progressForSlug(slug) {
    const selectedChild = window.KS2App.getState().selectedChild;
    const progress = window.KS2App.getState().spelling?.stats?.all;
    if (!selectedChild || !progress || !slug) return { stage: 0 };
    return { stage: 0 };
  }

  return {
    dashboard,
    savePrefs,
    startSession,
    submit,
    skip,
    advance,
    stageLabel,
    progressForSlug,
    MODES: {
      SMART: 'smart',
      TROUBLE: 'trouble',
      TEST: 'test',
      SINGLE: 'single',
    },
  };
})();

window.KS2Spelling = KS2Spelling;
