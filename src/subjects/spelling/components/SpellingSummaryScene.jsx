import { SessionSummaryFrame } from '../../../platform/ui/SessionSummaryFrame.jsx';
import { useSubmitLock } from '../../../platform/react/use-submit-lock.js';
import { ArrowRightIcon } from './spelling-icons.jsx';
import { AnimatedPromptCard, PathProgress } from './SpellingCommon.jsx';
import { SpellingHeroBackdrop } from './SpellingHeroBackdrop.jsx';
import {
  guardianPracticeActionLabel,
  guardianSummaryCards,
  guardianSummaryCopy,
  heroBgForSession,
  heroBgStyle,
  normalisePostMegaBranch,
  renderAction,
  summaryHeadline,
  summaryRibbonSub,
} from './spelling-view-model.js';
import { isPostMasteryMode } from '../service-contract.js';

const SPELLING_GRAND_MASTER_MONSTER_ID = 'phaeton';
const MONSTER_CODEX_SYSTEM_ID = 'monster-codex';

function postMegaBranchFromRepositories(repositories, learnerId) {
  if (!learnerId || !repositories?.gameState?.read) return normalisePostMegaBranch();
  try {
    const state = repositories.gameState.read(learnerId, MONSTER_CODEX_SYSTEM_ID);
    return normalisePostMegaBranch(state?.[SPELLING_GRAND_MASTER_MONSTER_ID]?.branch);
  } catch (_error) {
    return normalisePostMegaBranch();
  }
}

function SummaryStatGrid({ cards = [] }) {
  return (
    <div className="summary-stats">
      {cards.map((card) => (
        <div className="summary-stat" key={`${card.label}-${card.value}`}>
          <div className="v">{card.value}</div>
          <div className="l">{card.label}</div>
        </div>
      ))}
    </div>
  );
}

// Guardian-specific summary band. Rendered only when `summary.mode === 'guardian'`.
// Visually separated from the regular stat grid by a thin divider + a quiet
// eyebrow so the block reads as "here's the Vault status" rather than just
// "three more metrics". The shape mirrors `SummaryStatGrid` so the cards
// slot into the same responsive grid, but the wrapper class drives its own
// accent treatment without leaking into the legacy shell.
function SummaryGuardianBand({ cards = [] }) {
  if (!cards.length) return null;
  return (
    <section className="summary-guardian-band" aria-label="Vault status">
      <header className="summary-guardian-head">
        <span className="summary-guardian-eyebrow">Vault status</span>
        <span className="summary-guardian-sub" aria-hidden="true">Words you kept alive today</span>
      </header>
      <div className="summary-stats summary-stats--guardian">
        {cards.map((card) => (
          <div className={`summary-stat summary-stat--guardian summary-stat--${card.id}`} key={card.id}>
            <div className="v">{card.value}</div>
            <div className="l">{card.label}</div>
            {card.sub ? <div className="s">{card.sub}</div> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

// U10: Boss-specific summary score line. The plan's R13 spec nails this copy
// format exactly — "Boss score: N/M Mega words landed" — and we keep it in
// the scene so a product tweak is a single-file change. The band borrows
// Guardian's `summary-guardian-band` shape (eyebrow + score line) but swaps
// the Vault framing for Boss-specific copy that reinforces the
// Mega-never-revoked invariant the service already baked into
// `summary.message`.
function SummaryBossBand({ summary }) {
  if (!summary) return null;
  const totalWords = Math.max(1, Number(summary.totalWords) || 1);
  const correct = Math.max(0, Math.min(totalWords, Number(summary.correct) || 0));
  return (
    <section className="summary-guardian-band summary-boss-band" aria-label="Boss tally">
      <header className="summary-guardian-head">
        <span className="summary-guardian-eyebrow">Boss tally</span>
        <span className="summary-guardian-sub" aria-hidden="true">Your Mega words stayed Mega</span>
      </header>
      <p className="summary-boss-score">
        Boss score: {correct}/{totalWords} Mega words landed
      </p>
    </section>
  );
}

// U10: Read-only miss-list for Boss summaries. Boss is a test-mode round —
// no retry, no drill-all, no per-word practice. The scene surfaces the
// missed words as static chips so the child can see what slipped, paired
// with a short reassurance that Mega status stays intact. The rendered
// chips deliberately carry no `data-action` attribute, so a future bulk
// regex ("any button that dispatches drill-all") cannot accidentally
// re-introduce drill routing on a Boss summary. The negative regression
// assertions in `tests/spelling-boss.test.js` lock this in.
function SummaryBossMissList({ mistakes = [] }) {
  if (!mistakes.length) return null;
  return (
    <div className="summary-drill summary-drill--boss">
      <div className="summary-drill-head">
        <h4>Words that slipped today</h4>
        <span className="small muted">These stay Mega. Give them a quieter look another day.</span>
      </div>
      <div className="summary-drill-chips">
        {mistakes.map((word) => (
          <span className="fchip fchip--static" key={word.slug}>{word.word}</span>
        ))}
      </div>
    </div>
  );
}

// U11 Fix 1 (belt-and-braces): Read-only miss-list for Pattern Quest summaries.
// Pattern Quest is a Mega-safe mode — wrong answers wobble via
// `data.pattern.wobbling` and never touch `progress.stage`. But a
// Pattern-Quest summary previously rendered the default drill cluster
// (`spelling-drill-single` / `spelling-drill-all`) with the `originMode`
// check `=== 'guardian'`, which excluded Pattern Quest and sent the child
// into a Mega-demoting drill session. Fix 1 in the dispatcher swaps to
// `isMegaSafeMode` (covers Pattern Quest) and this scene branch removes the
// drill buttons at the JSX layer too so the drill-single CTA never renders
// on a Pattern Quest summary. Belt AND braces — a future dispatcher
// regression cannot leak through, and a future scene regression cannot
// either.
function SummaryPatternQuestMissList({ mistakes = [] }) {
  if (!mistakes.length) return null;
  return (
    <div className="summary-drill summary-drill--pattern-quest">
      <div className="summary-drill-head">
        <h4>Words that wobbled on this quest</h4>
        <span className="small muted">Mega stays. They will come back for a Guardian check tomorrow.</span>
      </div>
      <div className="summary-drill-chips">
        {mistakes.map((word) => (
          <span className="fchip fchip--static" key={word.slug}>{word.word}</span>
        ))}
      </div>
    </div>
  );
}

// P4 U4: Thin adapter mapping existing spelling summary view-model to
// SessionSummaryFrame props. The shared frame now owns the headline and
// next-step hierarchy; spelling keeps Guardian/Boss/Pattern Quest detail
// sections as subject-specific content.
function SpellingSummaryFrameAdapter({
  summary,
  actions,
  accent,
  pending,
  pendingCommand,
  runtimeReadOnly,
  submitLock,
  isGuardianSummary,
  isBossSummary,
  isPatternQuestSummary,
  children,
}) {
  if (!summary) return null;
  const toneGood = !summary.mistakes || !summary.mistakes.length;
  const outcome = toneGood ? 'secure' : 'needs-practice';
  const title = summaryHeadline(summary);
  const subtitle = summaryRibbonSub(summary);
  const disabled = Boolean(runtimeReadOnly || pending || submitLock.locked);
  const mistakeCount = Array.isArray(summary.mistakes) ? summary.mistakes.length : 0;
  const hasMistakes = mistakeCount > 0;
  const primaryStartAgain = {
    label: pendingCommand === 'start-session' ? 'Starting...' : 'Start another round',
    dataAction: 'spelling-start-again',
    style: { '--btn-accent': accent },
    endIcon: <ArrowRightIcon />,
    disabled,
    onClick: (event) => submitLock.run(async () => renderAction(actions, event, 'spelling-start-again')),
  };
  const primaryDrill = {
    label: isGuardianSummary ? guardianPracticeActionLabel() : `Drill all ${mistakeCount}`,
    dataAction: 'spelling-drill-all',
    size: 'sm',
    endIcon: <ArrowRightIcon />,
    disabled,
    onClick: (event) => submitLock.run(async () => renderAction(actions, event, 'spelling-drill-all')),
  };
  const primaryBack = {
    label: 'Back to dashboard',
    dataAction: 'spelling-back',
    style: { '--btn-accent': accent },
    endIcon: <ArrowRightIcon />,
    onClick: (event) => renderAction(actions, event, 'spelling-back'),
  };
  const nextPrimaryAction = isPatternQuestSummary
    ? primaryBack
    : isBossSummary
      ? primaryStartAgain
    : (hasMistakes ? primaryDrill : primaryStartAgain);
  const secondaryActions = [
    ...(isPatternQuestSummary ? [] : [{
      label: 'Back to dashboard',
      dataAction: 'spelling-back',
      variant: 'ghost',
      onClick: (event) => renderAction(actions, event, 'spelling-back'),
    }]),
    ...(hasMistakes && !isBossSummary && !isPatternQuestSummary ? [{
      label: pendingCommand === 'start-session' ? 'Starting...' : 'Start another round',
      dataAction: 'spelling-start-again',
      variant: 'secondary',
      disabled,
      onClick: (event) => submitLock.run(async () => renderAction(actions, event, 'spelling-start-again')),
    }] : []),
    {
      label: 'Open word bank',
      dataAction: 'spelling-open-word-bank',
      variant: 'ghost',
      onClick: (event) => renderAction(actions, event, 'spelling-open-word-bank'),
    },
  ];
  return (
    <SessionSummaryFrame
      subjectId="spelling"
      outcome={outcome}
      title={title}
      subtitle={subtitle}
      highlights={[]}
      misconceptions={[]}
      progressDelta={[]}
      nextPrimaryAction={nextPrimaryAction}
      secondaryActions={secondaryActions}
    >
      {children}
    </SessionSummaryFrame>
  );
}

export function SpellingSummaryScene({ learner, ui, accent, actions, postMastery = null, previousHeroBg = '', runtimeReadOnly = false, repositories = null }) {
  const summary = ui.summary;
  // SH2-U1: JSX-layer guard for non-destructive next-action buttons.
  // Drill/Start-again/Drill-all all route through the subject adapter
  // which already dedupes via `pendingCommand`; the hook absorbs the
  // window between the click and the round-trip so a double-click
  // cannot fire two flow transitions. `ui.summary` may be null while
  // the scene mounts without a settled summary (edge case guarded
  // below), but the hook is safe to instantiate unconditionally —
  // React hook-order constraints require it to sit at component top.
  const submitLock = useSubmitLock();
  if (!summary) return null;
  const pendingCommand = ui.pendingCommand || '';
  const pending = Boolean(pendingCommand);
  const progressTotal = Math.max(1, summary.totalWords || 1);
  // Post-Mega summary swap. The Worker stamps `summary.mode` from the
  // session that produced the summary, so guardian / boss / pattern-quest
  // results flow through the f-region vista. Pre-Mega summaries (smart /
  // trouble / test) keep the legacy region.
  const isPostMegaSummary = isPostMasteryMode(summary.mode);
  const summaryPostMegaBranch = isPostMegaSummary
    ? postMegaBranchFromRepositories(repositories, learner.id)
    : '';
  const heroBg = heroBgForSession(learner.id, {
    mode: summary.mode,
    progress: { done: progressTotal, total: progressTotal },
  }, {
    complete: true,
    postMega: isPostMegaSummary,
    postMegaBranch: summaryPostMegaBranch,
  });
  const isGuardianSummary = summary.mode === 'guardian';
  // U10: Boss rounds render a dedicated summary branch — no drill-all, no
  // per-word chips, no retry CTAs. The service already rewrites
  // `summary.message` and the "Needs more work" card sub for Boss mode so
  // the stat grid reads correctly; the scene-level branch adds the score
  // line band + read-only miss list alongside that.
  const isBossSummary = summary.mode === 'boss';
  // U11 Fix 1 + Fix 7: Pattern Quest summaries render static chips (no drill
  // CTA) and replace the Start-another-round button with Back-to-dashboard.
  // Rationale:
  //   - Drill CTA (Fix 1 belt): the `spelling-drill-single` and
  //     `spelling-drill-all` paths swap in `mode: 'single' / 'trouble'` which
  //     demotes Mega on wrong-then-correct (applyLearningOutcome). The
  //     dispatcher already fixes `practiceOnly` via isMegaSafeMode, but
  //     removing the CTA at the scene layer closes the loop so a future
  //     dispatcher regression cannot surface the bug.
  //   - Start-another-round (Fix 7): `spelling-start-again` fires the
  //     standard start path which needs `{ mode, patternId }`; the summary
  //     state does not thread the patternId today. Routing to
  //     "Back to dashboard" keeps the Pattern Quest chooser-first UX until a
  //     P2.5 iteration threads patternId through summary state.
  const isPatternQuestSummary = summary.mode === 'pattern-quest';
  const hasSummaryMistakes = Array.isArray(summary.mistakes) && summary.mistakes.length > 0;
  // When we exit a Guardian round the postMastery snapshot reflects the
  // post-advance state — so `nextGuardianDueDay` already tells us when the
  // learner should return. If postMastery is unavailable (e.g. SSR before
  // storage hydrates) we degrade to "—" rather than crashing.
  const guardianCards = isGuardianSummary
    ? guardianSummaryCards({
        summary,
        nextGuardianDueDay: postMastery?.nextGuardianDueDay ?? null,
        todayDay: postMastery?.todayDay ?? null,
      })
    : [];

  return (
    <div className="spelling-in-session summary-shell" style={{ gridColumn: '1/-1', ...heroBgStyle(heroBg) }}>
      <SpellingHeroBackdrop url={heroBg} previousUrl={previousHeroBg} />
      <div className="session summary">
        <header className="session-head">
          <PathProgress done={progressTotal} current={progressTotal} total={progressTotal} />
          <span className="path-count">
            {isGuardianSummary
              ? 'Guardian round complete'
              : isBossSummary
                ? 'Boss round complete'
                : isPatternQuestSummary
                  ? 'Pattern Quest complete'
                  : 'Round complete'}
          </span>
        </header>

        <AnimatedPromptCard
          className={`summary-card${isGuardianSummary ? ' summary-card--guardian' : ''}${isBossSummary ? ' summary-card--boss' : ''}${isPatternQuestSummary ? ' summary-card--pattern-quest' : ''}`}
          innerClassName="summary-card-inner"
        >
          <h3 className="summary-title sr-only">Session summary</h3>
          <SpellingSummaryFrameAdapter
            summary={summary}
            actions={actions}
            accent={accent}
            pending={pending}
            pendingCommand={pendingCommand}
            runtimeReadOnly={runtimeReadOnly}
            submitLock={submitLock}
            isGuardianSummary={isGuardianSummary}
            isBossSummary={isBossSummary}
            isPatternQuestSummary={isPatternQuestSummary}
          >
            <SummaryStatGrid cards={summary.cards} />

            {isGuardianSummary ? <SummaryGuardianBand cards={guardianCards} /> : null}
            {isBossSummary ? <SummaryBossBand summary={summary} /> : null}

            {isBossSummary ? (
              <SummaryBossMissList mistakes={summary.mistakes} />
            ) : isPatternQuestSummary ? (
              <SummaryPatternQuestMissList mistakes={summary.mistakes} />
            ) : hasSummaryMistakes ? (
              isGuardianSummary ? (
                // Guardian summaries now use SessionSummaryFrame's single
                // primary action for practice. This detail block stays
                // read-only so the recovery schedule copy remains visible
                // without rendering a second primary CTA.
                <div className="summary-drill summary-drill--guardian">
                  <div className="summary-drill-head">
                    <h4>Words that wobbled today</h4>
                    <span className="small muted">{guardianSummaryCopy()}</span>
                  </div>
                  <div className="summary-drill-chips">
                    {summary.mistakes.map((word) => (
                      <span className="fchip fchip--static" key={word.slug}>{word.word}</span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="summary-drill">
                  <div className="summary-drill-head">
                    <h4>Words that need another go</h4>
                    <span className="small muted">A quick drill cycles each of these again before you close the round.</span>
                  </div>
                  <div className="summary-drill-chips">
                    {summary.mistakes.map((word) => (
                      <button
                        type="button"
                        className="fchip"
                        data-action="spelling-drill-single"
                        data-slug={word.slug}
                        key={word.slug}
                        disabled={runtimeReadOnly || pending || submitLock.locked}
                        onClick={(event) => {
                          submitLock.run(async () => renderAction(actions, event, 'spelling-drill-single', { slug: word.slug }));
                        }}
                      >
                        {word.word}
                      </button>
                    ))}
                  </div>
                </div>
              )
            ) : null}
          </SpellingSummaryFrameAdapter>
        </AnimatedPromptCard>
      </div>
    </div>
  );
}
