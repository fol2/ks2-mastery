# Punctuation QG P2 — Depth, Release Safety, and Production Gate

Date: 28 April 2026  
Subject: Punctuation  
Previous phase: `punctuation-qg-p1`  
Next phase status: Ready to start  
Runtime policy: Deterministic generation only; no runtime AI question generation.

---

## 1. 粵語 Review Comments

### 1.1 總評

P1 嘅方向係正確，而且唔係只係「報告寫得靚」。以 repo `main` 現時狀態睇，Punctuation question generator 第一輪已經真係由淺層 runtime bank，升級到一個比較安全嘅 deterministic generated practice system。

最重要嘅幾樣已經落咗 code：production runtime 由每個 generator family 1 題升到 4 題；default service stats 有 test 釘住 171 runtime items 同 14 published reward units；generated items 有 `templateId` 同 `variantSignature`；audit 可以檢查 generated coverage、duplicate signatures、validator coverage、model answer marking；scheduler 會用 recent variant signatures 避免「唔同 item id 但其實同一題型表面」嘅重覆；Star evidence 亦有 signature-based dedupe。呢啲係實質 guardrails，不係純文檔聲稱。

所以我會接受：**P1 near-term scope 完成，可以進入 P2。**

但我唔會接受：**Punctuation QG 已經完成到可以唔再理。** P1 解決咗「安全地由 96 上 171」呢件事，未解決「長期 mastery practice 夠唔夠深」呢件事。

### 1.2 而家階段

而家我會叫呢個狀態做：

**Stage: P1 complete / P2-ready deterministic generated bank.**

意思係：

- 已經過咗「可唔可以安全加 generated items」呢一關。
- 已經有基本 audit / signature / marking / scheduler / Star evidence guardrails。
- 已經可以支撐 near-term 150–200 runtime item target。
- 但未去到 long-term 280–420 item target。
- 未有足夠 fixed anchor depth。
- 未做 production smoke gate。
- 未將 punctuation content audit 變成清晰 PR release gate。
- release-id hardening 仍然係值得做嘅 risk closure。

### 1.3 已驗證係真嘅 claim

以下 P1 report 嘅 claim，我認為 source-level validation 係成立：

- Runtime generation 已經係 4 generated variants per family。
- Runtime item count 已經有 service test 釘住 171。
- Published reward units 保持 14，冇因為加 generated items 而加 reward denominator。
- Generated item 有 `templateId` 同 `variantSignature`。
- Audit 會列出 per-skill / per-family generated signatures。
- Audit test 證明 generated-per-family 4 pass，而 generated-per-family 5 會因 duplicate signatures fail。
- Oxford comma policy 已經變成：default accept final comma；如果 validator `allowFinalComma: false` 先 reject。
- Dash clause transfer / exact fixed item 已經 accept spaced hyphen、en dash、em dash。
- GPS delayed review rows 已經冇直接 expose `variantSignature`。
- Attempts 仍會內部 carry `variantSignature`，呢點係 reward/scheduler evidence 需要。

### 1.4 仍然有 gap 或要 P2 收口嘅地方

第一，**fixed anchor depth 仲係薄**。好多 skill 仍然得 4–5 fixed items。Generated items 可以幫 practice volume，但 fixed items 係人手把關嘅 anchor，對 skill boundary、misconception coverage、transfer evidence 好重要。P2 應該先補 fixed anchors，而唔係即刻再提高 `generatedPerFamily`。

第二，**long-term template variety 未到位**。P1 做到每 family 4 個 distinct generated signatures，呢個係 near-term 安全擴容。下一步應該係每個 family 做到 8–12 個真正不同嘅 template / slot combinations。唔應該只靠調高 `generatedPerFamily` 追數。

第三，**audit script 已經強，但 release gate 未夠硬**。Repo 有 `npm test` PR gate，同 client bundle audit gate，但我未見到 `npm run audit:punctuation-content -- --strict --generated-per-family 4` 已經係獨立 CI gate。P2 要將呢個變成明確 gate，否則之後 content change 有機會繞過。

第四，**audit 應該加 per-family required count gate**。現時 test 有驗證每個 published family 喺 generated-per-family 4 時有 4 個 template IDs / signatures，但 audit threshold 本身更偏 per-skill。P2 應該將「每個 published generator family 必須產生 N 個 distinct signatures」變成 audit script 嘅正式 option，而唔只係 test behaviour。

第五，**release-id hardening 仲要做**。P1 report 自己都有講呢個係 residual risk。現在 secure reward-unit entry 有 `releaseId`，projection function 亦收 `releaseId`，但 P2 應該加 targeted regression tests，證明 old-release reward unit evidence 唔會 inflate current release secure/grand stars。

第六，**browser-facing metadata policy 要講清楚**。GPS review rows 已經 redacted，呢點 OK。但 active `currentItem` read model 仍然帶 `variantSignature`。呢個未必係 bug，因為 submit/attempt evidence 可能要靠佢；但如果產品原則係「所有 hidden generated metadata 都唔畀 browser 見」，咁就要改成 server-side lookup 或 opaque session-scoped token。P2 起碼要明文決定：`variantSignature` 係 allowed client transport metadata，定係 internal-only metadata。

第七，**dash display policy 可以再乾淨啲**。Marking 已經接受 spaced hyphen、en dash、em dash。好事。但 canonical model answer 如果仍然顯示 spaced hyphen，教學上會有少少混淆。P2 可以改成 model 顯示 en dash or em dash，marking 繼續接受三種 input。

第八，**production smoke 未做**。P1 report 無 claim 已做 live production smoke，呢個誠實。P2 如果要 release confidence，就要加 deployment smoke checklist：Smart Review、GPS delayed review、Admin/Parent redaction、runtime stats。

---

## 2. Phase 2 Plan (UK English)

### 2.1 Phase 2 goal

P2 should turn the P1-safe 171-item runtime bank into a deeper, release-gated, mastery-ready Punctuation practice portfolio.

The goal is not to chase a bigger headline number. The goal is to add depth where the current bank is thin, harden release safety, and make future deterministic expansion safer.

### 2.2 Product position after P2

After P2, Punctuation should be in this state:

```text
Runtime model: deterministic, teacher-authored templates only
Runtime AI generation: no
Production generatedPerFamily: still 4 unless explicitly approved
Expected runtime size: approximately 190–215 items, mostly from new fixed anchors
Published reward units: still 14
Audit gate: explicit and CI-backed
Release-id safety: regression-tested
Production smoke: documented and completed for deployment
```

P2 should not increase reward denominators. Extra content volume must provide more practice opportunities, not easier Stars.

### 2.3 Scope A — Add fixed anchor depth

Add fixed, human-authored anchor items before raising generated volume again.

Priority skills:

```text
sentence_endings
apostrophe_contractions
comma_clarity
semicolon_list
hyphen
dash_clause
```

Recommended additions:

| Skill | Current issue | P2 target |
|---|---|---:|
| sentence_endings | too few fixed anchors | +3 to +4 fixed items |
| apostrophe_contractions | too few fixed anchors | +3 fixed items |
| comma_clarity | too few fixed anchors | +4 fixed items |
| semicolon_list | too few fixed anchors | +4 fixed items |
| hyphen | low generated-family depth and limited anchor spread | +3 fixed items |
| dash_clause | low fixed depth and dash policy sensitivity | +3 fixed items |

Each added fixed item must include:

```js
{
  id,
  prompt,
  mode,
  inputKind,
  skillIds,
  clusterId,
  rewardUnitId,
  stem,
  model,
  explanation,
  misconceptionTags,
  readiness,
  source: 'fixed',
  validator or rubric where free text needs flexible marking
}
```

Do not add paragraph or multi-skill items just to increase counts. A paragraph item is only useful if it genuinely tests transfer and repair. It must not become a shortcut to deep secure evidence across multiple skills.

### 2.4 Scope B — Expand deterministic template variety, but do not raise production volume yet

P2 should add deeper template capacity, but production should stay at 4 generated items per family until the new bank passes stronger gates.

Target authoring depth:

```text
8–12 genuinely distinct templates or slot combinations per published generator family
```

A “genuinely distinct” variant must differ in learner-visible cognitive demand, not only in a noun swap. For example:

```text
Good distinction:
- insert missing punctuation in an unpunctuated sentence
- fix a sentence with one wrong boundary mark
- combine two clauses with the target mark
- repair a paragraph with target misconception present

Weak distinction:
- The gate was stuck - we waited.
- The door was stuck - we waited.
```

P2 should add template capacity in the priority skills first. It should not change `GENERATED_ITEMS_PER_FAMILY` from 4 unless a separate review approves the move.

### 2.5 Scope C — Strengthen audit as a release gate

Add audit options that check per-family capacity explicitly.

Proposed command:

```bash
npm run audit:punctuation-content -- \
  --strict \
  --generated-per-family 4 \
  --require-generated-family-count \
  --require-template-signatures-per-family \
  --fail-on-duplicate-generated-signatures \
  --fail-on-generated-model-marking
```

Required audit behaviour:

```text
For every published generator family:
- generatedItemCount must equal generatedPerFamily
- templateIds.length must equal generatedPerFamily
- variantSignatures.length must equal generatedPerFamily
- no duplicate variant signatures
- generated model answers must pass marking

For every published skill:
- minimum fixed anchor count must pass the P2 threshold
- validator-covered runtime item count must pass the P2 threshold
- mode coverage must include at least one transfer/fix/combine/paragraph-style evidence path where appropriate
```

Add this to CI as a hard PR gate, separate from the existing client-bundle audit.

Suggested workflow:

```yaml
name: Punctuation Content Audit (PR)

on:
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  punctuation-content-audit:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci --no-audit --no-fund
      - run: npm run audit:punctuation-content -- --strict --generated-per-family 4 --require-generated-family-count --require-template-signatures-per-family
```

### 2.6 Scope D — Release-id hardening

Add targeted tests to prove old-release evidence cannot inflate current-release Stars.

Required test cases:

```text
1. Old-release secured reward unit does not count towards current secure Stars.
2. Mixed old-release and current-release reward units only count current-release entries.
3. Grand Stars do not count old-release reward units towards current release completion.
4. Generated item attempts with valid current signatures still count normally.
5. Legacy unsigned attempts still coalesce safely with signed attempts for the same generated surface.
```

Implementation target:

```text
src/subjects/punctuation/star-projection.js
tests/punctuation-star-projection.test.js
```

Do not remove legacy compatibility unless there is a migration plan. The aim is to scope release evidence correctly, not to discard older learner history unnecessarily.

### 2.7 Scope E — Clarify browser-facing generated metadata policy

P2 must decide and document one of these positions.

Option 1 — allow opaque client transport:

```text
variantSignature may appear on active currentItem because it is opaque, non-answer-bearing, and needed to bind submission evidence to generated surfaces.
GPS delayed review rows and Parent/Admin review rows must not expose it.
```

Option 2 — internal-only metadata:

```text
variantSignature must never be sent to the browser.
The service must recover it server-side from itemId/session context during submission.
```

I recommend Option 1 for now because it is pragmatic and already close to the current implementation. But the contract must be explicit, and tests should enforce whichever choice is made.

Required tests:

```text
- active currentItem metadata policy test
- GPS delayed review redaction test
- Parent/Admin review redaction test, if that surface exists for Punctuation evidence
```

### 2.8 Scope F — Canonical punctuation display policy

Keep accepting sensible variants, but make display models consistent.

Dash policy:

```text
Accepted learner answers:
- spaced hyphen:  - 
- en dash:        –
- em dash:        —

Preferred model display:
- use en dash or em dash consistently for dash-clause teaching examples
- do not teach the spaced hyphen as the canonical dash form unless this is a deliberate product decision
```

Oxford comma policy:

```text
Default free-text list validators should accept the final comma.
A final comma should only be marked wrong when validator.allowFinalComma === false.
If allowFinalComma is false, the prompt/explanation must make the house-style constraint clear.
```

Add tests for both exact-answer and validator-backed paths whenever a punctuation policy changes.

### 2.9 Scope G — Context-pack expansion, carefully

Context packs are useful, but P2 should not use runtime AI. Context packs must remain constrained, teacher-authored, and audit-backed.

P2 target:

```text
- identify which of the 25 published generator families do not yet benefit from context-pack variation
- add safe context-pack atoms where they improve variety
- ensure generated model answers still come from deterministic builders or fixed templates
- ensure every context-pack-generated variant gets a stable signature
- ensure generated model answers pass marking in the audit
```

Context packs must not introduce hidden answer drift. If a context pack changes stem wording, the validator and model must be rebuilt deterministically from the same slots.

### 2.10 Scope H — Production smoke gate

P2 must add a deployment smoke checklist and attach the result to the completion report.

Minimum smoke:

```text
1. Confirm deployed build includes the P2 commit.
2. Start one Worker-backed Punctuation Smart Review session.
3. Complete at least one generated item.
4. Complete one GPS delayed-review session.
5. Confirm GPS delayed review rows do not expose hidden generated metadata.
6. Confirm runtime stats show the expected total and 14 published reward units.
7. Confirm one incorrect generated answer produces the expected misconception tag.
8. Confirm one dash-clause answer accepts en dash and em dash.
9. Confirm one list-comma free-text answer accepts Oxford comma unless allowFinalComma is false.
```

This is not a Playwright redesign requirement. It is a production correctness smoke.

### 2.11 Non-goals for P2

Do not do these in P2:

```text
- no runtime AI question generation
- no Punctuation UI redesign
- no reward denominator increase
- no production increase above generatedPerFamily = 4 unless separately approved
- no new Star model
- no Hero Mode coupling
- no generated item without marking/audit coverage
- no paragraph item added only to inflate multi-skill evidence
```

### 2.12 Implementation sequence

Recommended PR sequence:

#### PR P2-A — Audit release gate

Files likely touched:

```text
scripts/audit-punctuation-content.mjs
tests/punctuation-content-audit.test.js
.github/workflows/punctuation-content-audit.yml
package.json, only if script shape needs changing
```

Acceptance:

```text
npm run audit:punctuation-content -- --strict --generated-per-family 4 passes
CI runs the same audit on PR
per-family signature count is enforced by the audit, not only by unit tests
```

#### PR P2-B — Release-id Star hardening

Files likely touched:

```text
src/subjects/punctuation/star-projection.js
tests/punctuation-star-projection.test.js
```

Acceptance:

```text
old-release reward-unit evidence cannot inflate current release secure/grand Stars
current-release evidence still counts
legacy signed/unsigned generated attempt coalescing still works
```

#### PR P2-C — Fixed anchor expansion

Files likely touched:

```text
shared/punctuation/content.js
tests/punctuation-marking.test.js
tests/punctuation-content-audit.test.js
```

Acceptance:

```text
priority skills gain fixed anchors
new free-text items have validators or rubrics where needed
new model answers pass marking
runtime total increases through fixed anchors, not generatedPerFamily
```

#### PR P2-D — Template/context capacity expansion

Files likely touched:

```text
shared/punctuation/generators.js
shared/punctuation/context-packs.js
tests/punctuation-generators.test.js
tests/punctuation-content-audit.test.js
```

Acceptance:

```text
priority families move towards 8–12 distinct templates/slot combinations
generatedPerFamily remains 4 in production
audits can demonstrate deeper spare capacity without changing runtime volume
```

#### PR P2-E — Marking/display policy and production smoke report

Files likely touched:

```text
shared/punctuation/content.js
shared/punctuation/generators.js
shared/punctuation/marking.js
tests/punctuation-marking.test.js
docs/plans/james/punctuation/questions-generator/punctuation-qg-p2-completion-report-2026-04-28.md
```

Acceptance:

```text
dash display policy is documented and tested
Oxford comma policy remains explicit and tested
production smoke checklist is completed or explicitly marked not done
```

### 2.13 P2 acceptance criteria

P2 is complete only when all of these are true:

```text
1. Punctuation content audit is a CI-backed PR gate.
2. Audit enforces per-family generated count/signature/template ID coverage.
3. Runtime production generatedPerFamily remains 4 unless separately approved.
4. Fixed anchor count improves materially for the six priority skills.
5. Runtime item total reaches approximately 190–215 items, mostly through fixed anchors.
6. 14 published reward units remain unchanged.
7. Old-release reward-unit evidence cannot inflate current-release Stars.
8. Active/currentItem generated metadata policy is explicit and tested.
9. GPS delayed-review redaction remains clean.
10. Dash and Oxford-comma policies are tested across exact and validator paths.
11. Production smoke is completed and attached to the P2 completion report.
12. No runtime AI-generated learner questions are introduced.
```

---

## 3. Expected roadmap after P2

After P2, I expect three more phases for the Punctuation QG programme.

### P3 — Generator DSL and authoring tools

Purpose:

```text
Move from hand-expanded template arrays towards a cleaner teacher-authored template DSL.
```

Expected work:

```text
- slot-based template builders
- automatic model-answer construction
- validator construction from slots
- golden accept/reject tests per template family
- content-author preview tooling
- richer context-pack support across all 25 families
```

P3 should make future content authoring faster without making runtime generation less deterministic.

### P4 — Evidence and scheduler maturity

Purpose:

```text
Make the larger generated/fixed bank produce better learning evidence, not just more practice.
```

Expected work:

```text
- spaced-return requirements by skill
- varied-evidence requirement before deep secure
- sibling-template retry after misconception
- per-signature exposure limits
- post-secure retention checks
- analytics for weak-skill recovery and generated-repeat rate
```

P4 should answer: “Are children actually transferring punctuation skill, or just repeating familiar surfaces?”

### P5 — Mature content portfolio and monitoring

Purpose:

```text
Reach the long-term production target safely.
```

Expected work:

```text
- 280–420 practical runtime items
- 8–12 distinct templates/slot combinations per generator family
- 8–10 fixed anchors per reward unit where sensible
- production dashboards for audit, repeat rate, marking failures, and Star inflation risk
- admin QA view for content authors
- final go/no-go checklist for larger generatedPerFamily values
```

P5 is the phase where increasing `generatedPerFamily` above 4 becomes reasonable, but only if the spare template capacity and evidence safety are proven.

### Total expected phase shape

```text
P0/P1: Safe first expansion and guardrails — effectively complete
P2: Depth, release safety, and production gate — next
P3: Generator DSL and authoring tools
P4: Evidence and scheduler maturity
P5: Mature content portfolio and monitoring
```

So after the next round, I expect **three further phases: P3, P4, and P5**.

---

## 4. Blunt recommendation

Do not raise `GENERATED_ITEMS_PER_FAMILY` again in P2.

The right P2 move is:

```text
fixed anchors up
per-family audit stricter
release-id evidence safer
metadata policy clearer
production smoke added
template spare capacity deeper
runtime AI still zero
```

That gives the team a stronger base for a future P3/P4/P5 expansion without turning Punctuation into a larger but repetitive question bank.
