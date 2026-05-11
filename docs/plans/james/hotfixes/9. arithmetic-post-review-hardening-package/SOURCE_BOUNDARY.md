# Source boundary

Primary implementation snapshot: uploaded lean ZIP `ks2-mastery-lean-05111556.zip`.

Source ZIP SHA-256:

`596ac6308b01dc16150d584123f9c00303bd102e73b3b977aea034ef852d108b`

Patch target: extracted ZIP root. Apply from repository root with:

```bash
patch -p1 < patches/001-arithmetic-post-review-hardening.patch
```

GitHub was only used as a repository-identity supplement in this session. The patch and validation are ZIP-primary. Production deployment is not certified by this package.

The uploaded Arithmetic PoC HTML was used as the behaviour reference for answer-form tolerance, especially mixed-number and Unicode fraction entry forms.
