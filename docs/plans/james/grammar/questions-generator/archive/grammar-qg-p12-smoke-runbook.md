# Grammar QG P12 — Production Smoke Runbook

## Prerequisites
- Grammar QG content deployed to https://ks2.eugnel.uk
- Worker serving `grammar-qg-p11-2026-04-30` release

## Command
```bash
npm run smoke:production:grammar -- --json --evidence-origin post-deploy --release-id=grammar-qg-p11-2026-04-30 --out=reports/grammar/grammar-production-smoke-grammar-qg-p11-2026-04-30.json
```

## CLI arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `--json` | Emit structured JSON evidence | (no output file) |
| `--evidence-origin <value>` | Tag the evidence origin (e.g. `post-deploy`, `repository`) | `repository` |
| `--release-id=<id>` | Override release ID in evidence output | `GRAMMAR_CONTENT_RELEASE_ID` from code |
| `--out=<path>` | Override evidence output file path (relative to project root) | `reports/grammar/grammar-production-smoke-<releaseId>.json` |

## Post-run
1. Commit the evidence file
2. Update report from CERTIFIED_PRE_DEPLOY to CERTIFIED_POST_DEPLOY
3. Run `npm run verify:grammar-qg-production-release` to validate
