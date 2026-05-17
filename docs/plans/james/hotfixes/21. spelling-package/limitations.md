# Limitations

- The uploaded ZIP is a lean review archive, not a full production artifact. Assets, reports, and output directories are omitted by manifest.
- The ZIP has no `.git` metadata, so branch ancestry and full repo equality cannot be proved from the extraction.
- GitHub was used only as a supplementary exact-file check for `worker/src/repository.js` on `main`; whole-repo comparison was not performed.
- Local Node in the ChatGPT container was `v18.20.4`; the repo expects Node `22` from `.nvmrc`.
- Worker/server tests that import `node:sqlite` could not run in this environment.
- The included patch is a narrow hardening/monitoring patch. It does not implement the thousands-word spelling expansion.
- Production was not validated. A reachable app shell at `https://ks2.eugnel.uk` is not proof that this patch or expansion is live, hard-refresh-safe, or usable.
- The secure-vocabulary source list was originally approved by James for import/reviewer-pack generation only. James later approved secure-extension import for all pinned candidate rows; that approval is recorded in `evidence/secure-extension-import-approval-record-2026-05-17.md` and `.json`, then ingested through `evidence/secure-extension-import-approval-pipeline-record-2026-05-17.json`. Live promotion still requires row-specific release-quality values, import, release, CI, and production evidence.
- The secure-vocabulary import proof is check-mode only and writes no spelling content, D1 data, generated runtime bundle, or production release.
- Local Node 22 Task B patch-equivalent tests now pass for the runtime cache key and admin content-quality signal fix. This removes the earlier Node 18 limitation only for Task B; it does not prove the full secure-extension expansion.
- The local taxonomy backbone now exists for `statutory-core`, `secure-extension`, and `enrichment-extra`, including runtime/read-model/admin/worker/test coverage. It does not import or promote the 1217 secure-extension candidate records.
- Current published spelling runtime counts remain `213` statutory-core, `0` secure-extension, and `33` enrichment-extra words.
