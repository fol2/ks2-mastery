import React from 'react';
import { monsterAsset, monsterAssetSrcSet } from '../../platform/game/monsters.js';

function imageSources(monsterId, stage, branch) {
  return {
    src: monsterAsset(monsterId, stage, 320, branch),
    srcSet: monsterAssetSrcSet(monsterId, stage, branch),
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
  if (toast?.type === 'reward.monster' && toast.monster?.id) {
    const stage = Math.max(0, Math.min(4, Number(toast.next?.stage) || 0));
    const branch = toast.next?.branch || toast.previous?.branch;
    const sources = imageSources(toast.monster.id, stage, branch);
    return (
      <>
        <div className="cm-port" aria-hidden="true">
          <img alt={`${toast.monster.name || 'Monster'} portrait`} {...sources} sizes="56px" />
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
  return (
    <div className="toast-shelf" aria-live="polite" aria-label="Notifications">
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
