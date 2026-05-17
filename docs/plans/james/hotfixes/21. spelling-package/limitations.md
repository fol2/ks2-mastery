# Limitations

- The uploaded ZIP is a lean review archive, not a full production artifact. Assets, reports, and output directories are omitted by manifest.
- The ZIP has no `.git` metadata, so branch ancestry and full repo equality cannot be proved from the extraction.
- GitHub was used only as a supplementary exact-file check for `worker/src/repository.js` on `main`; whole-repo comparison was not performed.
- Local Node in the ChatGPT container was `v18.20.4`; the repo expects Node `22` from `.nvmrc`.
- Worker/server tests that import `node:sqlite` could not run in this environment.
- The included patch is a narrow hardening/monitoring patch. It does not implement the thousands-word spelling expansion.
- Production was not validated. A reachable app shell at `https://ks2.eugnel.uk` is not proof that this patch or expansion is live, hard-refresh-safe, or usable.
- No adult review of any new secure vocabulary list was performed because no new vocabulary source list was supplied.
