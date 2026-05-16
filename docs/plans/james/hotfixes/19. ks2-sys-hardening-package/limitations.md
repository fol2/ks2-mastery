# Limitations

- The uploaded ZIP is a lean review ZIP, not a full release-evidence package. Its manifest intentionally omits `reports/**`, `assets/**`, `output/**`, and planning packs.
- The ZIP has no `.git` metadata, so repository ancestry and exact commit identity are not proven from the ZIP.
- GitHub was used only as an exact-file supplement. Matching file blobs for two relevant paths do not prove the whole ZIP equals GitHub `main`.
- Production was not checked. No claim is made that this patch is live on `https://ks2.eugnel.uk`.
- The patch fixes the bootstrap 429 / Retry-After subset and adds regression tests. It does not implement the full update-without-hard-refresh UX, demo-start in-flight guard, or broad conversion of compatibility 400 rate-limit responses to 429.
- Full `tests/persistence.test.js` could not be certified from this lean ZIP because the ZIP intentionally omits a generated `reports/**` JSON file imported by an app-harness path. Focused bootstrap tests passed.
- Visual asset completeness cannot be certified from this ZIP because assets are omitted.
