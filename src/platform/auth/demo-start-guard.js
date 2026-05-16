export function createDemoSessionStarter({
  credentialFetch,
  clearAdminReturn = () => {},
  location = globalThis.location,
} = {}) {
  if (typeof credentialFetch !== 'function') {
    throw new TypeError('createDemoSessionStarter requires credentialFetch.');
  }

  let demoStartInFlight = null;

  return function startDemoSession() {
    if (demoStartInFlight) return demoStartInFlight;

    clearAdminReturn();
    demoStartInFlight = (async () => {
      const response = await credentialFetch('/api/demo/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.session?.accountId) {
        throw new Error(payload.message || 'Could not start the demo.');
      }
      location.href = '/';
    })().catch((error) => {
      demoStartInFlight = null;
      throw error;
    });

    return demoStartInFlight;
  };
}
