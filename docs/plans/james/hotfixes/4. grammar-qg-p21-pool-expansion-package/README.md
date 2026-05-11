# Grammar QG P21 Pool Expansion Production Package

Contents:

- `contract/grammar-qg-p21-pool-expansion-contract.md`
- `patches/001-grammar-qg-p21-pool-expansion-and-local-repetition.patch`
- `validation-summary.md`
- `validation/` logs and JSON outputs
- `notes/apply-instructions.md`

This package is Grammar-only. The local production gates are complete for the
P21 release candidate:

- release id: `grammar-qg-p21-2026-05-11`
- live template inventory: `546`
- P21 templates added: `36`
- P21 curated selected-response cases added: `288`
- P21 concept coverage: `18/18`
- local repetition audit: `0` violations, `0` warnings
- full local suite after CRLF verifier fix: `111437` pass, `0` fail, `12` skipped
- Cloudflare dry-run check: pass
- production deploy: pass, final Cloudflare version `5018852c-ebc9-4dc9-873d-cc0255662a67`
- production smoke: pass on `https://ks2.eugnel.uk`
- production-release verifier: pass, `0` failures, `0` advisories

The production deployment, live smoke evidence, production-release verifier,
and independent review closure are recorded in the completion report in this
folder.
