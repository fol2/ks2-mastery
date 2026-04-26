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
  // P2 U12: reward.achievement surfaces the toast.title directly — the
  // subscriber (event-hooks.js) already pre-composes from the achievement
  // definition. Keeping the title verbatim avoids double-wrapping the
  // "Achievement unlocked:" phrasing.
  if (toast?.type === 'reward.toast' && toast?.kind === 'reward.achievement') {
    return toast.toast?.title || toast.title || 'Achievement unlocked';
  }
  return toast?.toast?.title || toast?.title || 'Notification';
}

function toastBody(toast) {
  if (toast?.type === 'reward.monster') {
    if (toast.kind === 'caught') return 'You caught a new friend!';
    if (toast.kind === 'evolve') return `${toast.monster?.name || 'A monster'} grew stronger after that mastery milestone.`;
    if (toast.kind === 'mega') return `${toast.monster?.name || 'A monster'} reached its mega form.`;
  }
  if (toast?.type === 'reward.toast' && toast?.kind === 'reward.achievement') {
    // Body comes pre-composed from the subscriber. MVP copy: "Achievement
    // unlocked: <title>". No SVG badge art per F3; text-only styling.
    return toast.toast?.body || toast.body || '';
  }
  return toast?.toast?.body || toast?.body || toast?.message || '';
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

// P2 U12: kind class mapping. `catch` for monster caught (existing), new
// `achievement` for reward.achievement kind (distinct CSS hook without
// changing the DOM structure — still the same single-live-region container).
function toastKindClass(toast) {
  if (toast?.type === 'reward.monster' && toast?.kind === 'caught') return 'catch';
  if (toast?.type === 'reward.toast' && toast?.kind === 'reward.achievement') return 'achievement';
  return 'info';
}

export function ToastShelf({ toasts = [], onDismiss }) {
  if (!toasts.length) return null;
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
      {toasts.map((toast, index) => {
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
