# Limitations

1. Production is not proven. No live check was performed against `https://ks2.eugnel.uk`.
2. The uploaded ZIP is a review bundle, not a complete production artefact. It omits docs, reports, assets, output, and worktrees by manifest profile.
3. The patch is authoritative only against ZIP SHA-256 `2eadb98eca14a740a7a67cf54b00f14ef5acca1a8cb9509bb774a7d0c8db00c2`.
4. GitHub was checked for repository metadata only. If GitHub `main` has drifted, the local agent must port behaviour and tests rather than force-applying blindly.
5. Full repository tests, build, Wrangler dry-run, deployment, and browser hard-refresh production checks remain for the local agent/CI.
6. The ZIP `wrangler.jsonc` defaults Hero Mode flags to `false`. Even after this patch, learners will not earn coins on production unless production flags/rollout/overrides enable shadow, launch, child UI, progress, economy, and any required camp surfaces for the target cohort.
