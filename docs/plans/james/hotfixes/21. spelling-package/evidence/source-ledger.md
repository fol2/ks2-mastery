# Source Ledger

| Evidence layer | Item | Status | Notes |
|---|---|---:|---|
| ZIP | `ks2-mastery-lean-05161145.zip` | inspected | Primary supplied snapshot. SHA-256 `2eadb98eca14a740a7a67cf54b00f14ef5acca1a8cb9509bb774a7d0c8db00c2`. |
| ZIP manifest | `LEAN_ZIP_MANIFEST.txt` | inspected | Lean review profile; copied 1544 files; omitted 3594 outside-profile files; assets/reports/output omitted. |
| ZIP local run | `npm run content:validate` | passed | Proves only local ZIP/patch snapshot. Runtime words 246, sentences 2213, warnings 6. |
| ZIP local run | patch dry-run/apply | passed | Proves patch applies to fresh ZIP extraction. |
| ZIP local run | Worker endpoint probe | not runnable here | Node 18 lacks `node:sqlite`; must run under Node 22. |
| GitHub main | `fol2/ks2-mastery`, `worker/src/repository.js` | fetched | Blob SHA `a20215b8519c99fca4c05922ba1bc0c47c17108f`, matching ZIP local blob SHA. |
| Production | `https://ks2.eugnel.uk` | shell reachable only | Does not prove patch/expansion/live spelling journey. |
