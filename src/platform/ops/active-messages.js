// U12: Client-runtime active message delivery.
//
// Fetches active marketing messages from the Worker-authoritative
// `GET /api/ops/active-messages` endpoint and renders them as React
// banner elements. Content-free leaf — all message content comes from
// the server; this module never generates its own copy.
//
// Design:
//   - On app boot (after auth), fetch active messages. Poll every 5 min.
//   - Announcement: info-toned, dismissible per-session (sessionStorage).
//   - Maintenance: warning-toned, non-dismissible.
//   - body_text rendered as restricted markdown -> React elements.
//     NO dangerouslySetInnerHTML. Only **bold**, *italic*, [link](url).
//   - Severity tokens map to CSS classes: info, warning.
//   - Fail-open: fetch failure -> no banner (silent).

import React, { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_STORAGE_PREFIX = 'ks2_msg_dismissed_';

// ---------------------------------------------------------------------------
// Dismissed state (sessionStorage, keyed by message ID)
// ---------------------------------------------------------------------------

function isDismissed(messageId) {
  try {
    return globalThis.sessionStorage?.getItem(`${SESSION_STORAGE_PREFIX}${messageId}`) === '1';
  } catch {
    return false;
  }
}

function setDismissed(messageId) {
  try {
    globalThis.sessionStorage?.setItem(`${SESSION_STORAGE_PREFIX}${messageId}`, '1');
  } catch {
    // sessionStorage unavailable — dismiss is memory-only this session.
  }
}

// ---------------------------------------------------------------------------
// Restricted Markdown -> React elements
//
// Supported tokens: **bold**, *italic*, [text](https://url)
// No raw HTML. No dangerouslySetInnerHTML.
// ---------------------------------------------------------------------------

// Match **bold**, *italic*, and [text](url) in that priority order.
// The alternation is ordered so ** is tried before *.
const MD_TOKEN_RE = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(\[([^\]]+)\]\((https?:\/\/[^)]+)\))/g;

export function renderRestrictedMarkdown(text) {
  if (typeof text !== 'string' || text.length === 0) return null;

  const parts = [];
  let lastIndex = 0;
  let match;
  let keyCounter = 0;

  MD_TOKEN_RE.lastIndex = 0;
  while ((match = MD_TOKEN_RE.exec(text)) !== null) {
    // Push any plain text before this match.
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // **bold**
      parts.push(React.createElement('strong', { key: `md-${keyCounter++}` }, match[2]));
    } else if (match[3]) {
      // *italic*
      parts.push(React.createElement('em', { key: `md-${keyCounter++}` }, match[4]));
    } else if (match[5]) {
      // [text](url) — only https: links (server already validates, but
      // defence in depth on the client).
      const href = match[7];
      if (href && /^https:\/\//i.test(href)) {
        parts.push(
          React.createElement(
            'a',
            {
              key: `md-${keyCounter++}`,
              href,
              target: '_blank',
              rel: 'noopener noreferrer',
            },
            match[6],
          ),
        );
      } else {
        // Non-https link — render as plain text, do not create an anchor.
        parts.push(match[6]);
      }
    }

    lastIndex = match.index + match[0].length;
  }

  // Trailing plain text.
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : null;
}

// ---------------------------------------------------------------------------
// Severity -> CSS class mapping
// ---------------------------------------------------------------------------

function severityClass(token) {
  if (token === 'warning') return 'active-message-banner--warning';
  return 'active-message-banner--info';
}

// ---------------------------------------------------------------------------
// Single message banner component
// ---------------------------------------------------------------------------

export function ActiveMessageBanner({ message, onDismiss }) {
  if (!message) return null;

  const isDismissible = message.message_type === 'announcement';
  const sevClass = severityClass(message.severity_token);

  return React.createElement(
    'div',
    {
      className: `active-message-banner ${sevClass}`,
      role: 'status',
      'aria-live': 'polite',
      'data-message-type': message.message_type,
      'data-severity': message.severity_token || 'info',
    },
    React.createElement(
      'div',
      { className: 'active-message-banner__content' },
      message.title
        ? React.createElement('strong', { className: 'active-message-banner__title' }, message.title)
        : null,
      message.body_text
        ? React.createElement(
          'p',
          { className: 'active-message-banner__body' },
          renderRestrictedMarkdown(message.body_text),
        )
        : null,
    ),
    isDismissible
      ? React.createElement(
        'button',
        {
          type: 'button',
          className: 'active-message-banner__dismiss',
          'aria-label': 'Dismiss announcement',
          onClick: onDismiss,
        },
        '×', // multiplication sign (visually identical to X)
      )
      : null,
  );
}

// ---------------------------------------------------------------------------
// Banner stack component (renders all active, non-dismissed messages)
// ---------------------------------------------------------------------------

export function ActiveMessageStack({ messages }) {
  const [dismissedIds, setDismissedIds] = useState(() => {
    const set = new Set();
    for (const msg of messages || []) {
      if (msg.id && isDismissed(msg.id)) set.add(msg.id);
    }
    return set;
  });

  const handleDismiss = useCallback((messageId) => {
    setDismissed(messageId);
    setDismissedIds((prev) => new Set([...prev, messageId]));
  }, []);

  // Re-check dismissed state when messages change (new poll result).
  useEffect(() => {
    if (!messages || messages.length === 0) return;
    const newDismissed = new Set();
    for (const msg of messages) {
      if (msg.id && isDismissed(msg.id)) newDismissed.add(msg.id);
    }
    setDismissedIds(newDismissed);
  }, [messages]);

  if (!messages || messages.length === 0) return null;

  const visible = messages.filter(
    (msg) => !(msg.id && dismissedIds.has(msg.id)),
  );

  if (visible.length === 0) return null;

  return React.createElement(
    'div',
    { className: 'active-message-stack', 'data-testid': 'active-message-stack' },
    visible.map((msg, index) =>
      React.createElement(ActiveMessageBanner, {
        key: msg.id || `msg-${index}`,
        message: msg,
        onDismiss: () => handleDismiss(msg.id),
      }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Hook: useActiveMessages
//
// Fetches active messages on mount and polls every POLL_INTERVAL_MS.
// Fail-open: any error -> empty array, no banner.
// ---------------------------------------------------------------------------

export function useActiveMessages(fetchActiveMessages) {
  const [messages, setMessages] = useState([]);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);

  const doFetch = useCallback(async () => {
    if (typeof fetchActiveMessages !== 'function') return;
    try {
      const result = await fetchActiveMessages();
      if (mountedRef.current && Array.isArray(result?.messages)) {
        setMessages(result.messages);
      }
    } catch {
      // Fail-open: fetch failure -> no banner.
      if (mountedRef.current) setMessages([]);
    }
  }, [fetchActiveMessages]);

  useEffect(() => {
    mountedRef.current = true;
    doFetch();

    timerRef.current = setInterval(doFetch, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [doFetch]);

  return messages;
}

// ---------------------------------------------------------------------------
// Connected component: fetches + renders the full stack.
// `fetchActiveMessages` is the API function from hub api.
// ---------------------------------------------------------------------------

export function ActiveMessagesBar({ fetchActiveMessages }) {
  const messages = useActiveMessages(fetchActiveMessages);
  return React.createElement(ActiveMessageStack, { messages });
}
