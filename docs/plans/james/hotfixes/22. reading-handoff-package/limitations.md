# Limitations

- This package validates the uploaded ZIP snapshot and a fresh patched extraction of that ZIP. It does not prove the GitHub target branch is identical.
- GitHub `main` differs from the uploaded ZIP for at least `worker/src/subjects/reading/engine.js`. Apply the patch to the actual target branch only after checking drift.
- Full UI/bundle tests requiring installed dependencies were not all runnable in this lean ZIP environment. In particular, `tests/reading-session-interface.test.js` failed because `esbuild` was not installed.
- No live authenticated Reading journey was completed on `https://ks2.eugnel.uk`.
- The patch does not expand the Reading pool. The bank is already at `7112` questions in the ZIP, but the contract still requires staged expansion toward `10K+` only after answer acceptance and review quality gates are hardened.
- The patch does not touch reward/mastery, Stars, Hero Mode, monsters, subject progression, deployment config, or production routing.
- The adversarial probe is not a substitute for human Reading question review. It only catches a class of false-positive marking defects.

## Target checkout update

- The GitHub/local target checkout was verified separately from the lean ZIP snapshot at `24ba39c05d34be365447763eacd8801995b2b2c2`.
- `tests/reading-session-interface.test.js` passed in the dependency-complete target checkout; the earlier `esbuild` limitation applies only to the lean ZIP review environment.
- Production was deployed and live-smoked against `https://ks2.eugnel.uk` from commit `7833139303bf04a6ec50a862b7950d22ffb7190a`.
- The work does not expand the Reading bank beyond the current version `7` content. Expansion toward `10K+` remains a separate staged task.
