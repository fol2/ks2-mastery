# Reasoning post-hardening review

## Overall verdict

The post-hardening Reasoning implementation is materially stronger than the first live implementation. The baseline targeted tests already passed, and the subject remains isolated behind Reasoning-specific shared content, Worker engine/commands/read models, and thin client command/UI surfaces.

The review found no evidence that other subject engines needed to be touched. The useful improvements were Reasoning-specific: leakage control, retry durability, support/evidence fairness, response-state correctness, working capture, and unit-tolerant deterministic marking.

## Findings fixed by this patch

### 1. Early domain/skill hint leakage

Before the patch, `safeReasoningQuestion()` exposed `domain` even when `includeSkill` was false. That meant strict SATs or independent attempts could still leak broad question category before the learner had attempted/marked the item. The patch hides `domain`, `skillIds`, and `skillNames` until marking/support states explicitly include skill information.

### 2. Due retry consumed too early

Before the patch, `takeDueRetry()` removed a due retry as soon as a session started. If a learner opened a due retry and abandoned or refreshed before finalising, the exact retry could disappear. The patch peeks at the due retry and removes it only when finalisation occurs.

### 3. Stale feedback after navigation

Before the patch, a first-wrong feedback object could remain attached after moving to another question, causing a stale nudge/headline to appear for the wrong item. The patch clears feedback on question movement and refuses to build feedback if it does not match the current question reference.

### 4. List/SATs answers could not be cleared

Before the patch, save-all/mark-session ignored blank submitted responses because it checked for “has value”. That left stale saved answers behind when a learner intentionally cleared an answer. The patch stores response objects when the item key is present, even if the answer itself is blank.

### 5. Working/method was not consistently captured

The single-question UI had a working concept, but the command action did not carry `working`, and the list/SATs question rendering did not provide a working textarea. The patch carries optional working in command payloads and adds a per-question working field in list/SATs flows.

### 6. Supported success could still award monster/star evidence

Before the patch, supported or worked/faded success could emit `reasoning.evidence-earned` if the result was correct enough. The patch requires fully independent high-quality success (`quality >= 4.8` and `supportLevel === 0`) for Reasoning evidence-earned events. Supported success still updates normal practice/progress, but does not inflate monster evidence.

### 7. Common KS2 unit suffixes were rejected

Before the patch, numerically correct entries such as `85°` or `24 cm²` could be rejected by numeric marking. The patch strips common suffixes such as degrees, cm², kg, ml, cm, m, packs, boxes, minutes, and hours before numeric parsing. It deliberately does not strip `p`, so money answers in pence are not silently treated as pounds.

## Enrichment value

These changes are not cosmetic. They move Reasoning closer to a world-class preparation loop by making the engine fairer, less leaky, more durable under real learner behaviour, and stricter about what counts as independent mastery evidence. They also improve SATs mini-set usefulness by preserving working, which is central to reasoning feedback and adult review.
