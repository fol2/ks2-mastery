# Production check note

Final status: `DONE — LIVE VERIFIED`.

Checked origin: `https://ks2.eugnel.uk`

Deployment timestamp: `2026-05-16T20:52:48.172Z`

Live verification timestamp: `2026-05-16T20:54:37.495Z`

Deployment command:

```bash
npm run deploy
```

Observed:

- Worker Version ID: `161bb803-8dbe-4d27-8117-4c71a47fca27`
- Build hash before and after hard refresh: `8f32b996`
- Production bundle audit passed for `https://ks2.eugnel.uk/`.
- Grammar production smoke passed against `https://ks2.eugnel.uk`, including P20d prompt-leak cases for `qg_p18_p16_tense_aspect_fix_wrong_form`.
- Browser hard-refresh journey passed on `/demo`.
- The hard-refresh smoke opened Grammar, started a round, reloaded while the active item was visible, submitted after reload, and observed feedback.
- Console errors, page errors, request failures, and HTTP failures were all empty in the hard-refresh evidence.

Evidence:

- `../validation/production-deploy-2026-05-16.log`
- `../validation/production-grammar-smoke-2026-05-16.json`
- `../validation/production-grammar-smoke-2026-05-16.log`
- `../validation/production-grammar-hard-refresh-2026-05-16.json`
- `../validation/production-grammar-hard-refresh-2026-05-16.log`
- `../validation/production-grammar-hard-refresh-2026-05-16.png`
