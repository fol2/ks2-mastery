---
title: Spelling Word Bank Facet Count Hotfix
status: active
date: 2026-06-05
execution: code
origin: user report, 2026-06-05
---

# Spelling Word Bank Facet Count Hotfix

## Problem Frame

The Spelling Word Bank currently mixes two different concepts:

- the paged rows that are loaded for display, capped at 250 rows per server request
- the facet counts shown in the category, status, and Guardian filter chips

The previous Extra-pool fix made the selected Extra tab load all 52 Extra rows from the server, but it left the UI deriving chip counts from the currently loaded `wordGroups`. That means:

- when `All` is selected, the first 250 rows only include 37 Extra words, so the Extra chip incorrectly shows 37 instead of the published 52
- when `Extra` is selected, the server correctly returns only Extra rows, but the UI then recomputes category counts from that Extra-only slice, so Years 3-4, Years 5-6, and Secure vocabulary collapse to 0

The correct contract is that Word Bank facets must describe the full authorised matching word universe, while rows describe only the current display page or selected facet result.

## Scope

In scope:

- Preserve the server-side page and filter loading introduced for the Extra pool.
- Add or expose authoritative facet counts from the Worker Word Bank read model.
- Refactor the React Word Bank scene so filter chip counts and the lede use authoritative facet totals instead of loaded rows.
- Keep row rendering, detail modal lookup, drill submission, and TTS behaviour unchanged.
- Add regression coverage for both reported states: `All` showing Extra as 52, and `Extra` selected without zeroing sibling category chips.
- Deploy the corrected production Worker and verify the live Word Bank API/UI contract.

Out of scope:

- Changing spelling content, seed data, or generated word content.
- Changing Guardian eligibility or post-Mega scheduling semantics.
- Changing the Word Bank detail modal, audio prompt token contract, or spelling drill command contract.

## Requirements Trace

- User report: `All` currently shows Extra as 37, despite the database/source containing 52 Extra words.
- User report: selecting `Extra` changes Extra to 52 but changes other category counts to 0, which is not how the filter should behave.
- Production-sensitive constraint: do not regress English Spelling parity or remote sync paths.
- Existing server contract: `/api/subjects/spelling/word-bank` already supports `year`, `status`, `q`, `page`, and `pageSize`; it must remain the single remote entry point for this view.

## Design Decisions

### D1. Separate Facets From Rows

`wordGroups` remain the current page/result rows. They must no longer be treated as the full Word Bank universe for chip counts when remote paging is active.

Facet counts should come from the Worker response, with enough shape to represent:

- global category totals for `all`, `y3-4`, `y5-6`, `secure-extension`, and `extra`
- status totals for the currently selected category/search scope
- Guardian totals for the currently selected category/search scope when Guardian filters are visible

Rationale: category chips should not collapse when one category is selected, while status chips should still explain the current category/search scope the learner is filtering inside.

### D2. Keep Display Rows Server-Filtered

The client should keep asking the Worker for the selected `year`, supported `status`, search query, and page. This avoids trying to load more than the Worker page cap just to compute local counts.

Rationale: loading all rows into the browser to repair counts would reintroduce the page-size coupling and would become fragile as the word bank grows.

### D3. Make Fallbacks Explicit and Conservative

If a legacy or stale Worker response lacks the new facet shape, the scene may fall back to the old loaded-row counts for compatibility. Tests for the new Worker path must assert that the authoritative shape is present and used.

Rationale: avoids blank or broken UI during partial cache transitions, while the production target still proves the new contract.

## Implementation Units

### U1. Worker Facet Contract

Files:

- `worker/src/content/spelling-read-models.js`
- `tests/spelling-content-api.test.js`

Approach:

- Build facet rows from the full published Word Bank rows, not from `pageRows`.
- Preserve `wordBank.totalRows`, `filteredRows`, `returnedRows`, and `hasNextPage`.
- Add a dedicated facet object that exposes category counts across the full query/status scope and status counts across the selected category/query scope.
- Keep existing `analytics.pools` for backwards compatibility.

Test scenarios:

- `year=all&pageSize=250` returns `returnedRows=250`, `filteredRows` greater than 250 when content has more rows, and facet category `extra=52`.
- `year=extra&pageSize=250` returns 52 display rows, while facet category counts still report the non-Extra category totals.
- Status facet counts for `year=extra` add up to 52 and match the visible Extra rows.

### U2. Client Facet Consumption

Files:

- `src/subjects/spelling/components/SpellingWordBankScene.jsx`
- `tests/spelling-remote-actions.test.js`
- `tests/spelling-view-model.test.js` if helper extraction is useful

Approach:

- Read authoritative facet counts from `analytics.wordBank.facets` or an equivalent Worker field.
- Use category facets for `YearChips`.
- Use current-scope status facets for `FilterChips` and `GuardianFilterChips`.
- Use `wordBank.totalRows`/facet totals for the lede and empty-state decision, not `allWords.length` when authoritative metadata is present.
- Keep `visibleGroups` derived from loaded rows so the rendered list remains page/result based.

Test scenarios:

- Remote action loading `All` with a 250-row page leaves the Extra chip at 52, not 37.
- Remote action selecting `Extra` leaves Years 3-4 and Years 5-6 counts at their global totals, not 0.
- Extra selected lede says 52 Extra words selected out of the full Word Bank total, not 52 of 52.
- Existing legacy response fallback still renders without crashing.

### U3. Verification and Deployment

Files:

- `docs/plans/spelling-word-bank-facet-counts-hotfix-2026-06-05.md`
- production evidence generated only if needed by the verification scripts

Approach:

- Run targeted Word Bank tests first.
- Run `npm test`.
- Run `npm run check`.
- Deploy with `npm run deploy`.
- Smoke the live production Word Bank API with same-origin demo session headers and verify:
  - deployed `/api/version` build hash matches the local commit
  - `All` metadata reports Extra facet count 52 while the first page may return 250 rows
  - `Extra` metadata reports 52 display rows and non-zero sibling category facets

## Risks

- The UI currently recomputes Guardian aggregates from loaded rows for orphan sanitisation. If the Worker facet contract includes Guardian counts, it must use the same eligibility rules or the client should keep Guardian count fallback local until server parity is proven.
- Legacy cache windows may briefly return the old response shape. Client fallbacks must keep the page functional but tests must pin the new production path.
- Existing generated report files may be dirtied by test/deploy scripts. Only intentional source, test, and plan changes should be staged.

## Acceptance Criteria

- `All` Word Bank category chips show Extra as 52 on production.
- Selecting `Extra` shows Extra as 52 and keeps sibling category counts at their full published totals instead of 0.
- Display rows stay correct: Extra selected shows the 52 Extra rows without requiring a client-side full Word Bank fetch.
- Targeted Word Bank tests pass.
- Full `npm test` and `npm run check` pass.
- Production deploy succeeds and live smoke proves the corrected facet contract.
