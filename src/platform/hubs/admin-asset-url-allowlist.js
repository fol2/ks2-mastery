// P7 U11: Asset preview URL allowlist.
//
// Validates that preview URLs are safe to render as clickable links.
// Rejects dangerous protocols (javascript:, data:), protocol-relative URLs,
// non-HTTPS, and unapproved origins.
//
// Pure function — no side effects, no fetch, no storage.

/**
 * Default domain allowlist. In production, the app's own Pages domain is the
 * primary source of preview assets. Extend as new CDN origins are approved.
 */
const DEFAULT_ALLOWED_DOMAINS = Object.freeze([
  'ks2-mastery.pages.dev',
]);

/**
 * Validate whether a preview URL is safe to render as a clickable link.
 *
 * @param {string|null|undefined} url — the URL to validate
 * @param {object} [options]
 * @param {string[]} [options.allowedDomains] — override the domain allowlist
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function isAllowedPreviewUrl(url, options) {
  if (url == null || url === '') {
    return { allowed: false, reason: 'URL is empty or missing.' };
  }

  if (typeof url !== 'string') {
    return { allowed: false, reason: 'URL is not a string.' };
  }

  const trimmed = url.trim();

  // Reject javascript: protocol (case-insensitive, whitespace-tolerant)
  if (/^\s*javascript\s*:/i.test(trimmed)) {
    return { allowed: false, reason: 'javascript: protocol is forbidden.' };
  }

  // Reject data: protocol
  if (/^\s*data\s*:/i.test(trimmed)) {
    return { allowed: false, reason: 'data: protocol is forbidden.' };
  }

  // Reject protocol-relative URLs (//example.com/...)
  if (/^\/\//.test(trimmed)) {
    return { allowed: false, reason: 'Protocol-relative URLs are forbidden.' };
  }

  // Parse as URL — reject if unparseable
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { allowed: false, reason: 'URL is malformed.' };
  }

  // Reject non-HTTPS
  if (parsed.protocol !== 'https:') {
    return { allowed: false, reason: 'Only HTTPS URLs are permitted.' };
  }

  // Domain allowlist check
  const domains = (options && Array.isArray(options.allowedDomains))
    ? options.allowedDomains
    : DEFAULT_ALLOWED_DOMAINS;

  const hostname = parsed.hostname.toLowerCase();
  const domainAllowed = domains.some((d) => {
    const lower = d.toLowerCase();
    return hostname === lower || hostname.endsWith('.' + lower);
  });

  if (!domainAllowed) {
    return { allowed: false, reason: `Origin "${parsed.hostname}" is not in the allowlist.` };
  }

  return { allowed: true };
}

/**
 * Given a raw preview URL, return either the validated URL string (safe to
 * render) or null (meaning the UI should show a placeholder instead of a link).
 *
 * @param {string|null|undefined} url
 * @param {object} [options]
 * @returns {string|null}
 */
export function getSafePreviewUrl(url, options) {
  const result = isAllowedPreviewUrl(url, options);
  return result.allowed ? url : null;
}

/**
 * Return a user-facing reason why a preview URL was rejected.
 * Returns null when the URL is allowed or absent.
 *
 * @param {string|null|undefined} url
 * @param {object} [options]
 * @returns {string|null}
 */
export function getPreviewBlockedReason(url, options) {
  if (url == null || url === '') return null;
  const result = isAllowedPreviewUrl(url, options);
  return result.allowed ? null : (result.reason || 'Preview unavailable (unsafe URL)');
}

export { DEFAULT_ALLOWED_DOMAINS };
