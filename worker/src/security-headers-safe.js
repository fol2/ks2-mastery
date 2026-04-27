/**
 * Defensive security-header wrapper — extracted from index.js so the
 * Worker entry point exports only the workerd-required surface.
 *
 * Exported so tests can drive the throw path with a stubbed wrapper
 * (review reliability-1).
 */

import { applySecurityHeaders } from './security-headers.js';

/**
 * Apply the security wrapper defensively. If `wrap` (by default
 * `applySecurityHeaders`) throws, return the underlying response unchanged
 * so the Worker never emits a 1101 just because header composition failed.
 *
 * @param {Response} response
 * @param {{ path?: string }} options
 * @param {(response: Response, options: { path?: string }) => Response} [wrap]
 * @returns {Response}
 */
export function applySecurityHeadersSafely(response, options, wrap = applySecurityHeaders) {
  try {
    return wrap(response, options);
  } catch (error) {
    console.error('[ks2-security-headers] wrapper failed', error?.message);
    return response;
  }
}
