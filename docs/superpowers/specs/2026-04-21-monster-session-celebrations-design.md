# Monster Session Celebrations Design

## Goal

Restore the previous monster caught / evolve / mega celebration layer without interrupting a live spelling round.

## Behaviour

- `reward.monster` events are still produced when spelling progress makes a monster milestone true.
- `levelup` stays a lightweight toast.
- `caught`, `evolve`, and `mega` are queued while a spelling session is live.
- The full-screen celebration queue is released only when the spelling session reaches the summary screen or the learner explicitly ends the session.
- Imported or repaired historical progress does not replay celebrations; only events from the current runtime path are eligible.

## UI

- The full-screen layer uses the old transformation rhythm: before form, flash, after form.
- Mega events use a stronger treatment than caught / evolve events.
- Multiple queued events play one at a time in event order.
- The learner dismisses each celebration with a single Continue button.
- Runtime artwork uses the restored 640px WebP monster assets for crisp retina display without reintroducing the older 2048px PNG payloads. The PNGs remain available in git history as source-quality art.

## Implementation Notes

- Keep the queue in transient app state, separate from durable subject state and repository data.
- Publish reward events immediately so codex state and event logs remain correct.
- Delay only the full-screen surface, not the underlying data mutation.
- Clear pending celebrations when switching learners, resetting progress, or reloading repository state.
