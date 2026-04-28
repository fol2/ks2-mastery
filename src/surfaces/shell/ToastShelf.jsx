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
  return toast?.title || 'Notification';
}

function toastBody(toast) {
  return toast?.body || '';
}

function toastMonster(toast) {
  if (toast?.monster?.id) return toast.monster;
  const monsterId = toast?.assetRef?.family === 'monster' ? toast.assetRef.monsterId : '';
  return monsterId ? { id: monsterId, name: toast.title || 'Monster' } : null;
}

function ToastContent({ toast }) {
  const monsterVisualConfig = useMonsterVisualConfig();
  const monster = toastMonster(toast);
  if (monster?.id) {
    const stage = Math.max(0, Math.min(4, Number(toast.assetRef?.stage ?? toast.next?.stage) || 0));
    const branch = toast.assetRef?.branch || toast.next?.branch || toast.previous?.branch;
    const visual = imageVisual(monster.id, stage, branch, monsterVisualConfig?.config);
    return (
      <>
        <div className="cm-port" aria-hidden="true">
          {/* SH2-U10 CLS: toast portrait has a fixed 56 px CSS slot
              (`sizes="56px"`); declaring `width`/`height` at the same
              value reserves the box so the toast does not jump while
              the .webp decodes. */}
          <img
            alt={`${monster.name || 'Monster'} portrait`}
            src={visual.src}
            srcSet={visual.srcSet}
            sizes="56px"
            width={56}
            height={56}
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

function toastKindClass(toast) {
  if (toast?.rewardType === 'reward.monster' && toast?.kind === 'caught') return 'catch';
  if (toast?.tone === 'achievement' || toast?.kind === 'reward.achievement') return 'achievement';
  return 'info';
}

export function ToastShelf({ toasts = [], onDismiss }) {
  const toastRows = Array.isArray(toasts) ? toasts : [];
  if (!toastRows.length) return null;
  // U10 (sys-hardening p1): the container is the single live region.
  // `role="status"` + `aria-live="polite"` announce new toast inserts
  // once. The inner `<aside>` elements are plain containers — nesting
  // `role="status"` inside a live region has undefined AT behaviour
  // (WAI-ARIA does not define nested-live-region semantics; NVDA and
  // VoiceOver can double-announce or skip). U10 review adversarial
  // review finding #6 prompted flattening to a single live region.
  //
  // P2 U12: achievement toasts reuse this SAME container (F3 adversarial
  // finding). No new `role="status"` region. The `.toast.achievement` kind
  // class is the only styling hook — DOM structure is identical to info
  // and catch toasts so AT announcement remains a single emit per new toast.
  //
  // `data-testid="toast-shelf"` anchors the accessibility scene.
  return (
    <div className="toast-shelf" role="status" aria-live="polite" aria-label="Notifications" data-testid="toast-shelf">
      {toastRows.map((toast, index) => {
        const kind = toastKindClass(toast);
        return (
          <aside
            className={`toast ${kind}`}
            data-toast-id={toast?.id || undefined}
            data-toast-kind={toast?.kind || undefined}
            key={toast?.id || index}
          >
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
