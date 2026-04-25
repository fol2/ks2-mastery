# Event runtime and reward decoupling

## Why this exists

The learning engine decides outcomes first.
The reward layer reacts afterwards.

That means the important flow is:

```txt
subject service -> domain events -> platform event runtime -> subscribers -> reward / toast / event-log side effects
```

## Current domain events

### Emitted by the Spelling service

- `spelling.retry-cleared`
- `spelling.word-secured`
- `spelling.mastery-milestone`
- `spelling.session-completed`
- `spelling.guardian.renewed`
- `spelling.guardian.wobbled`
- `spelling.guardian.recovered`
- `spelling.guardian.mission-completed`

The `spelling.guardian.*` family is emitted from the post-Mega "Spelling Guardian" maintenance layer (see `docs/spelling-service.md` for the schedule contract).
No reward subscriber consumes these events yet; the MVP treats Guardian as a pedagogy-only surface. A future reward subscriber may react to `renewed`/`recovered` toasts without touching the spelling service, consistent with the "subject decides, reward reacts" rule.

### Derived by the platform runtime

- `platform.practice-streak-hit`

## Current reward reactions

The spelling reward subscriber listens for `spelling.word-secured` and updates the monster codex.
Secure-word events include `spellingPool`, so reward routing does not have to infer Extra content from a statutory year band.
That can emit reward events such as:

- `reward.monster` with `kind = caught`
- `reward.monster` with `kind = evolve`
- `reward.monster` with `kind = levelup`
- `reward.monster` with `kind = mega`

The visible Codex progress is not sourced from this event log. It is projected from the current spelling analytics secure rows so legacy imports, cache repairs and remote restores stay locked to the same secure-word counts shown in Spelling analytics.
Direct spelling monsters are caught into Stage 0 at 1 secure word, then evolve at 10, 30, 60 and 100 secure words.
Current routing is:

- core Years 3-4 -> Inklet
- core Years 5-6 -> Glimmerbug
- Extra -> Vellhorn

Phaeton is caught into Stage 0 at 3 combined core secure words, then evolves from combined Inklet and Glimmerbug secure words at 25, 95, 145 and 213, without requiring both core bands to cross a separate gate.
Vellhorn and Extra progress do not emit Phaeton reward events.

Reward events can carry toast metadata for the shared overlay UI, but they do not mutate subject learning state.

## Runtime guarantees

- Subject services do not call reward systems directly.
- Subject modules do not translate their own mastery events into reward writes.
- Reward subscribers can be disabled without changing pedagogy or spelling outcomes.
- Subscriber failures are contained so learning can continue.
- The event log stores both domain events and reward reactions for auditability.

## Extension points

Future quest, badge, cosmetic or seasonal systems should subscribe here rather than touching subject engines.
That keeps new game systems additive instead of pedagogically entangling them.
