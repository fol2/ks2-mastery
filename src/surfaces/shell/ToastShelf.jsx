import React from 'react';
import { useMonsterVisualConfig } from '../../platform/game/MonsterVisualConfigContext.jsx';
import { resolveMonsterVisual } from '../../platform/game/monster-visual-config.js';

function imageVisual(monsterId, stage, branch, config) {
  return resolveMonsterVisual({
    monsterId,
    branch,
    stage,
    context: 'toastPortrait',
    config,
    preferredSize: 320,
  });
}

function portraitStyle(visual) {
  return {
    transform: `translate(${Number(visual.offsetX) || 0}px, ${Number(visual.offsetY) || 0}px) scaleX(${Number(visual.faceSign) || 1}) scale(${Number(visual.scale) || 1})`,
    opacity: Number.isFinite(Number(visual.opacity)) ? Math.max(0, Math.min(1, Number(visual.opacity))) : 1,
    filter: visual.filter && visual.filter !== 'none' ? visual.filter : undefined,
  };
}

function toastTitle(toast) {
  if (toast?.type === 'reward.monster') {
    if (toast.kind === 'caught') return `${toast.monster?.name || 'Monster'} joined your Codex`;
    if (toast.kind === 'evolve') return `${toast.monster?.name || 'Monster'} evolved`;
    if (toast.kind === 'mega') return `${toast.monster?.name || 'Monster'} reached its final form`;
  }
  return toast?.title || 'Notification';
}

function toastBody(toast) {
  if (toast?.type === 'reward.monster') {
    if (toast.kind === 'caught') return 'You caught a new friend!';
    if (toast.kind === 'evolve') return `${toast.monster?.name || 'A monster'} grew stronger after that mastery milestone.`;
    if (toast.kind === 'mega') return `${toast.monster?.name || 'A monster'} reached its mega form.`;
  }
  return toast?.body || toast?.message || '';
}

function ToastContent({ toast }) {
  const monsterVisualConfig = useMonsterVisualConfig();
  if (toast?.type === 'reward.monster' && toast.monster?.id) {
    const stage = Math.max(0, Math.min(4, Number(toast.next?.stage) || 0));
    const branch = toast.next?.branch || toast.previous?.branch;
    const visual = imageVisual(toast.monster.id, stage, branch, monsterVisualConfig?.config);
    return (
      <>
        <div className="cm-port" aria-hidden="true">
          <img
            alt={`${toast.monster.name || 'Monster'} portrait`}
            src={visual.src}
            srcSet={visual.srcSet}
            sizes="56px"
            style={portraitStyle(visual)}
          />
        </div>
        <div className="cm-copy">
          <div className="cm-title">{toastTitle(toast)}</div>
          <div className="cm-body">{toastBody(toast)}</div>
        </div>
      </>
    );
  }
  return (
    <div className="cm-copy">
      <div className="cm-title">{toastTitle(toast)}</div>
      <div className="cm-body">{toastBody(toast)}</div>
    </div>
  );
}

export function ToastShelf({ toasts = [], onDismiss }) {
  if (!toasts.length) return null;
  // U10 (sys-hardening p1): `data-testid="toast-shelf"` anchors the
  // accessibility Playwright scene so keyboard-only round-trips can
  // assert the `aria-live="polite"` container is announced. Existing
  // `role="status"` on each toast and `aria-live` on the container
  // are the WCAG 2.2 contract under test.
  return (
    <div className="toast-shelf" role="status" aria-live="polite" aria-label="Notifications" data-testid="toast-shelf">
      {toasts.map((toast, index) => {
        const kind = toast?.type === 'reward.monster' && toast?.kind === 'caught' ? 'catch' : 'info';
        return (
          <aside className={`toast ${kind}`} role="status" data-toast-id={toast?.id || undefined} key={toast?.id || index}>
            <ToastContent toast={toast} />
            <button
              className="cm-close"
              type="button"
              aria-label="Dismiss notification"
              onClick={() => onDismiss?.(index)}
            >
              ×
            </button>
          </aside>
        );
      })}
    </div>
  );
}
