import { useState } from 'react';
import { HeroCampMonsterCard } from './HeroCampMonsterCard.jsx';
import { HeroCampConfirmation } from './HeroCampConfirmation.jsx';
import {
  buildHeroCampModel,
  buildInviteConfirmation,
  buildGrowConfirmation,
  buildInviteSuccess,
  buildGrowSuccess,
  buildInsufficientMessage,
} from '../../platform/hero/hero-camp-model.js';

/**
 * HeroCampPanel — calm child-led spending surface for Hero Camp.
 *
 * Renders as a secondary section below the Hero Quest card. Shows the
 * Hero Coins balance (prominent but not pressure-y), a grid of monster
 * cards, and a confirmation dialog on action. Calm, welcoming tone.
 *
 * States:
 *   1. Camp disabled → null
 *   2. Loading → non-blocking placeholder
 *   3. Normal → shows balance + 6 monster cards
 *   4. Confirming invite → overlay with cost and balance-after
 *   5. Confirming grow → overlay with cost and target stage
 *   6. Success → acknowledgement message
 *   7. Insufficient → calm save-more message
 *   8. Error/stale → gentle refresh prompt
 *
 * Props:
 *   readModel   — the v6 Hero read model (parent passes this)
 *   heroClient  — hero client instance { unlockMonster, evolveMonster }
 *   learnerId   — current learner ID
 *   onRefresh   — callback to refetch read model after action
 */
export function HeroCampPanel({ readModel, heroClient, learnerId, onRefresh }) {
  const [confirmation, setConfirmation] = useState(null);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Build camp model from read model
  const campModel = readModel ? buildHeroCampModel(readModel) : null;

  // State 1: Camp disabled
  if (!campModel || !campModel.campEnabled) return null;

  const balance = campModel.balance;
  const monsters = campModel.monsters || [];
  const allFullyGrown = monsters.length > 0 && monsters.every(m => m.fullyGrown);
  const hasAnyOwned = monsters.some(m => m.owned);

  // State 8: Error/stale — gentle refresh prompt
  if (error) {
    return (
      <section className="hero-camp-panel hero-camp-panel--error" aria-label="Hero Camp" data-hero-camp-panel>
        <h2 className="hero-camp-panel__title">Hero Camp</h2>
        <p className="hero-camp-panel__error" aria-live="polite">
          Something went wrong. Try refreshing.
        </p>
        <button
          type="button"
          className="btn ghost hero-camp-panel__refresh"
          onClick={() => { setError(null); onRefresh?.(); }}
          aria-label="Refresh Hero Camp"
        >
          Refresh
        </button>
      </section>
    );
  }

  // State 2: Loading (busy after action)
  if (busy) {
    return (
      <section className="hero-camp-panel hero-camp-panel--loading" aria-label="Hero Camp" data-hero-camp-panel>
        <h2 className="hero-camp-panel__title">Hero Camp</h2>
        <p className="hero-camp-panel__loading">Loading Hero Camp…</p>
      </section>
    );
  }

  // Handlers that open confirmation dialog
  function handleInvite(monsterId, branch) {
    const monster = monsters.find(m => m.monsterId === monsterId);
    if (!monster) return;
    if (balance < monster.inviteCost) {
      const deficit = monster.inviteCost - balance;
      setSuccess(null);
      setConfirmation({ type: 'insufficient', message: buildInsufficientMessage(deficit) });
      return;
    }
    const conf = buildInviteConfirmation(monster, balance);
    setConfirmation({
      type: 'invite',
      monsterId,
      branch,
      monsterName: monster.displayName,
      cost: monster.inviteCost,
      heading: conf.heading,
      balanceAfterText: conf.balanceAfter,
    });
  }

  function handleGrow(monsterId, targetStage) {
    const monster = monsters.find(m => m.monsterId === monsterId);
    if (!monster) return;
    if (balance < monster.nextGrowCost) {
      const deficit = monster.nextGrowCost - balance;
      setSuccess(null);
      setConfirmation({ type: 'insufficient', message: buildInsufficientMessage(deficit) });
      return;
    }
    const conf = buildGrowConfirmation(monster, balance);
    setConfirmation({
      type: 'grow',
      monsterId,
      targetStage,
      monsterName: monster.displayName,
      cost: monster.nextGrowCost,
      heading: conf.heading,
      balanceAfterText: conf.balanceAfter,
    });
  }

  async function handleConfirm() {
    if (!confirmation || confirmation.type === 'insufficient') return;
    setBusy(true);
    setConfirmation(null);
    try {
      const requestId = `camp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (confirmation.type === 'invite') {
        await heroClient.unlockMonster({
          learnerId,
          monsterId: confirmation.monsterId,
          branch: confirmation.branch,
          requestId,
        });
        setSuccess(buildInviteSuccess(confirmation.monsterName));
      } else {
        await heroClient.evolveMonster({
          learnerId,
          monsterId: confirmation.monsterId,
          targetStage: confirmation.targetStage,
          requestId,
        });
        setSuccess(buildGrowSuccess(confirmation.monsterName));
      }
      onRefresh?.();
    } catch (err) {
      setError(err?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  function handleCancel() {
    setConfirmation(null);
  }

  function dismissSuccess() {
    setSuccess(null);
  }

  // Confirmation dialog props
  const confirmationVisible = confirmation !== null && confirmation.type !== 'insufficient';
  const confirmationHeading = confirmation?.heading || '';
  const confirmationBalanceAfter = confirmation?.balanceAfterText || '';
  const confirmationActionLabel = confirmation?.type === 'invite' ? 'invite' : 'grow';

  return (
    <section className="hero-camp-panel" aria-label="Hero Camp" data-hero-camp-panel>
      <div className="hero-camp-panel__header">
        <h2 className="hero-camp-panel__title">Hero Camp</h2>
        <div className="hero-camp-panel__balance" aria-label={`${balance} Hero Coins`}>
          <span className="hero-camp-panel__balance-value">{balance}</span>
          <span className="hero-camp-panel__balance-label">Hero Coins</span>
        </div>
      </div>

      {/* State 6: Success acknowledgement */}
      {success && (
        <div className="hero-camp-panel__success" aria-live="polite" data-hero-camp-success>
          <p className="hero-camp-panel__success-message">{success}</p>
          <button
            type="button"
            className="btn ghost hero-camp-panel__success-dismiss"
            onClick={dismissSuccess}
            aria-label="Done"
          >
            Done
          </button>
        </div>
      )}

      {/* State 7: Insufficient balance */}
      {confirmation?.type === 'insufficient' && (
        <div className="hero-camp-panel__insufficient" aria-live="polite" data-hero-camp-insufficient>
          <p className="hero-camp-panel__insufficient-message">{confirmation.message}</p>
          <p className="hero-camp-panel__insufficient-help">
            Complete Hero Quests to add more Hero Coins.
          </p>
          <button
            type="button"
            className="btn ghost hero-camp-panel__insufficient-dismiss"
            onClick={handleCancel}
            aria-label="Done"
          >
            Done
          </button>
        </div>
      )}

      {/* All fully grown celebration */}
      {allFullyGrown && (
        <p className="hero-camp-panel__all-grown" aria-live="polite">
          All your Hero Camp monsters are fully grown. Well done!
        </p>
      )}

      {/* No monsters owned — invite prompt */}
      {!allFullyGrown && !hasAnyOwned && monsters.length > 0 && (
        <p className="hero-camp-panel__invite-prompt">
          Choose a Hero monster to invite.
        </p>
      )}

      {/* Monster grid */}
      <div className="hero-camp-panel__grid" role="list">
        {monsters.map(monster => (
          <div key={monster.monsterId} role="listitem">
            <HeroCampMonsterCard
              monster={monster}
              balance={balance}
              onInvite={handleInvite}
              onGrow={handleGrow}
            />
          </div>
        ))}
      </div>

      {/* Confirmation dialog */}
      <HeroCampConfirmation
        visible={confirmationVisible}
        heading={confirmationHeading}
        balanceAfter={confirmationBalanceAfter}
        actionLabel={confirmationActionLabel}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </section>
  );
}
