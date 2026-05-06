# Reading P3 validation and delegated question-session UX contract

Status: ready-to-apply patch contract
Scope: Reading subject session UX, draft persistence, list-view correctness, safe read-model enrichment
Source boundary: GitHub `main` is the source authority for the implementation the user says is live; the uploaded `ks2-mastery-lean-05061443.zip` is the local validation and patch-base snapshot.

## 1. Audit verdict

Reading is already integrated as a real subject. The audit found no regression in the Reading content bank, Reading Worker runtime, subject registry, Hero readiness, or monster reward thresholds under the local ZIP snapshot.

The important remaining defect is in the delegated question-session interface. The setup exposes a `Full question list` view, but the React surface only renders the current question. That makes the control misleading, weakens SATs-style delayed-feedback practice, and prevents the child from using Reading in the more intrusive passage-and-questions workflow that the subject needs.

A second defect is draft loss risk. In one-question mode, moving by `Next`, `Previous`, section navigation, or question chips can navigate before the browser answer has been persisted to the Worker. In list mode, section marking also needs to carry the whole visible form into the Worker before deterministic marking.

## 2. Product contract

Reading remains delegated to its own subject surface. The shared webapp frame owns route, app shell, subject selection and command dispatch. The Reading surface is allowed to use a richer subject-specific question interface inside that frame because Reading has a passage-first, evidence-heavy workflow that is materially different from Spelling, Grammar and Punctuation.

The UI must keep the learner inside one clear routine:

1. Read the passage.
2. Answer from the text without answer leakage.
3. Save drafts safely while moving around.
4. Mark only when the current mode allows feedback.
5. Review model answers and evidence only after marking.

The question session must support two legitimate workflows.

One-question mode is for guided daily practice. It should show a sticky question card, a question-status rail, a clear next action, and buttons that save before navigating.

Full-list mode is for SATs-style sections and stamina. It should render every question in the current text, with a quick question shortcut rail, per-question saved/marked status, and a section-level save/mark action.

## 3. Safety and learning contract

The read model may expose question stems, options, marks, status, learner responses and marked results. It must not expose model answers, explanations, evidence snippets or skill labels before the engine has produced a result for that question.

Draft saving is not marking. `save-response` may persist visible answers and move the cursor, but it must not mutate progress, emit answer-submitted events, grant rewards, or expose feedback.

Marking may merge the current visible form payload first, then mark deterministically. Strict paper sessions still block `mark-section`; they may only be marked as a whole paper.

Stale session and stale section guards remain required. A save or mark request must reject a mismatched `expectedSessionId` or `expectedSectionIndex`.

## 4. Engineering contract

Worker-owned Reading commands remain the only mutation authority. The browser component may collect form data and dispatch subject commands, but it may not mark locally or update Reading progress directly.

The Reading read model must include a safe current-section question list for list mode. Each entry should include:

- safe question render data;
- question index;
- saved response;
- status: `blank`, `saved`, `correct`, `partial`, or `wrong`;
- result only if already marked.

The command-action layer must serialise both single-question forms and prefixed list-mode forms into the existing `save-response`, `mark-section`, and `mark-session` Worker commands.

No bespoke app-shell route or global frame fork is introduced. Styling is scoped to Reading classes and reuses existing cards, chips, stats, buttons, callouts and grid primitives.

## 5. Acceptance tests

The patch is accepted when these local checks pass from the ZIP snapshot:

```bash
node --test \
  tests/reading-content-contract.test.js \
  tests/worker-reading-runtime.test.js \
  tests/reading-subject-registry.test.js \
  tests/reading-session-interface.test.js
```

The broader non-React subject/reward regression set should also pass:

```bash
node --test \
  tests/monster-system.test.js \
  tests/grammar-monster-roster.test.js \
  tests/punctuation-monster-migration.test.js \
  tests/hero-pool-registry.test.js \
  tests/hero-providers.test.js \
  tests/hero-launch-adapters.test.js \
  tests/worker-hero-read-model.test.js \
  tests/worker-reading-runtime.test.js \
  tests/reading-content-contract.test.js \
  tests/reading-subject-registry.test.js \
  tests/reading-session-interface.test.js
```

Final CI still needs a dependency-complete install before build certification:

```bash
npm install
npm run build
```

The lean ZIP used for this audit does not include `node_modules`, so build certification is not proven from this local environment.

## 6. Non-goals

This patch does not change the Reading content bank, paper bank, deterministic marking rubrics, monster thresholds, Hero ownership model, or subject registry readiness. Those passed the targeted audit and should not be churned in a UI/draft-persistence patch.
