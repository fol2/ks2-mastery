# Source boundary

- Primary source: uploaded ZIP `/mnt/data/ks2-mastery-lean-05102302.zip`
- Source ZIP SHA-256: `58b5ad91e1aac120f83c49fd0c198d763ffedfdb1b3bc72cfc1fa928c78783c6`
- Extraction shape: rootless lean ZIP; no `.git` metadata in the extraction
- Runtime: `.nvmrc` expects Node `22`; local runtime was Node `v22.16.0`
- GitHub supplement: recent Reading commits and current-main Reading engine inspected through the GitHub connector
- Production: not certified by this package; no live deployment smoke was run here

The lean ZIP had enough source for Reading engine/content/provider tests. It did not contain `node_modules`, so `tests/reading-session-interface.test.js` failed at import time on missing `esbuild`; that is recorded as an environment limit, not a product pass/fail.
