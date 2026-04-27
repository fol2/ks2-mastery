// U7 hardening-residuals: detect chunk-load failures from React.lazy()
// dynamic imports. These surface as TypeError or ChunkLoadError when the
// browser cannot fetch a code-split chunk (offline, deploy-during-session,
// cache eviction). The detection covers webpack's ChunkLoadError name,
// esbuild/Vite "Failed to fetch dynamically imported module", and the
// generic "Loading chunk" pattern.
//
// This lives in a plain `.js` file (not `.jsx`) so Node test runners can
// import it directly without a JSX loader.

/**
 * @param {Error|null|undefined} error
 * @returns {boolean}
 */
export function isChunkLoadError(error) {
  if (!error) return false;
  if (error.name === 'ChunkLoadError') return true;
  const msg = error.message || '';
  return msg.includes('Loading chunk')
    || msg.includes('Failed to fetch dynamically imported module');
}
