// Hero Camp UI model — derives view state from read model v6.
// Client-only module. Does NOT import shared/ or worker/ code.

export function buildHeroCampModel(readModel) {
  if (!readModel) return emptyCampModel();

  const camp = readModel.camp;
  if (!camp || !camp.enabled) {
    return emptyCampModel();
  }

  const balance = camp.balance ?? 0;
  const monsters = (camp.monsters || []).map(m => ({
    ...m,
    // Add UI-derived fields
    actionLabel: deriveActionLabel(m),
    costLabel: deriveCostLabel(m),
    statusLabel: deriveStatusLabel(m),
  }));

  return {
    campEnabled: true,
    balance,
    balanceLabel: `${balance} Hero Coins`,
    monsters,
    selectedMonsterId: camp.selectedMonsterId,
    rosterVersion: camp.rosterVersion,
    recentActions: camp.recentActions || [],
    lastAction: (camp.recentActions || []).slice(-1)[0] || null,
    hasAffordableAction: monsters.some(m => m.canAffordInvite || m.canAffordGrow),
    insufficientBalanceMessage: 'Save more Hero Coins by completing Hero Quests.',
  };
}

function emptyCampModel() {
  return {
    campEnabled: false,
    balance: 0,
    balanceLabel: '0 Hero Coins',
    monsters: [],
    selectedMonsterId: null,
    rosterVersion: null,
    recentActions: [],
    lastAction: null,
    hasAffordableAction: false,
    insufficientBalanceMessage: null,
  };
}

function deriveActionLabel(monster) {
  if (monster.fullyGrown) return 'Fully grown';
  if (!monster.owned) return `Use ${monster.inviteCost} Hero Coins to invite`;
  return `Use ${monster.nextGrowCost} Hero Coins to grow`;
}

function deriveCostLabel(monster) {
  if (monster.fullyGrown) return null;
  if (!monster.owned) return `${monster.inviteCost} Hero Coins`;
  return `${monster.nextGrowCost} Hero Coins`;
}

function deriveStatusLabel(monster) {
  if (!monster.owned) return 'Not yet invited';
  if (monster.fullyGrown) return 'Fully grown';
  return `Stage ${monster.stage}`;
}

// Confirmation copy builders
export function buildInviteConfirmation(monster, balance) {
  const balanceAfter = balance - monster.inviteCost;
  return {
    heading: `Use ${monster.inviteCost} Hero Coins to invite ${monster.displayName} to Hero Camp?`,
    balanceAfter: `Your balance will be ${balanceAfter} Hero Coins.`,
    canConfirm: balance >= monster.inviteCost,
  };
}

export function buildGrowConfirmation(monster, balance) {
  const balanceAfter = balance - monster.nextGrowCost;
  return {
    heading: `Use ${monster.nextGrowCost} Hero Coins to grow ${monster.displayName} to stage ${monster.nextStage}?`,
    balanceAfter: `Your balance will be ${balanceAfter} Hero Coins.`,
    canConfirm: balance >= monster.nextGrowCost,
  };
}

// Success copy builders
export function buildInviteSuccess(monsterName) {
  return `${monsterName} joined your Hero Camp.`;
}

export function buildGrowSuccess(monsterName) {
  return `${monsterName} grew stronger.`;
}

// Insufficient balance copy
export function buildInsufficientMessage(deficit) {
  return `You need ${deficit} more Hero Coins. Complete Hero Quests to add more Hero Coins.`;
}
