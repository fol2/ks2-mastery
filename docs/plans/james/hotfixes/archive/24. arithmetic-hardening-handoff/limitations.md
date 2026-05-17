# Limitations

1. Production Arithmetic was not live-verified. The homepage at `https://ks2.eugnel.uk` was reachable, but the demo route timed out and no Arithmetic learner journey was proven.

2. The uploaded ZIP and GitHub `main` are divergent for the core Arithmetic source files. The patch is against the uploaded ZIP snapshot and must be reconciled before applying to a different target ref.

3. The local environment used for this review had Node `v18.20.4`, while `.nvmrc` expects Node `22`. Targeted `node --test` checks passed, but full project validation must be rerun in Node 22.

4. `npm test` could not run in this lean ZIP environment because `node_modules` was missing. This is an environment/dependency limitation, not proof of a product failure.

5. Lean ZIP review does not prove full visual asset completeness, Cloudflare/D1 behaviour, CI status, or deployed production state.

6. The patch hardens current features only. It does not solve broader Arithmetic evidence semantics such as whether one clean answer should secure a reward unit for production-grade mastery. That should be explicitly reviewed before public rollout.
