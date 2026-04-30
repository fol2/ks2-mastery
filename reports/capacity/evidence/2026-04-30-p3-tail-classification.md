# P3 Tail Classification

Generated from the P3 strict 30 learner correlations captured on 2026-04-30. This file is diagnostic only. It does not certify capacity by itself; certification still depends on strict evidence rows and the verifier.

## Summary

| Run | Evidence | Bootstrap P95 | Invocation coverage | Statement coverage | Warnings | Classification counts |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| P3-T1 strict | `reports/capacity/evidence/2026-04-30-p3-t1-strict.json` | 701.3 ms | 10/10 | 10/10 | 0 | `d1-dominated`: 9, `worker-cpu-dominated`: 1 |
| P3-T5 repeat 1 | `reports/capacity/evidence/2026-04-30-p3-t5-strict-r1.json` | 661.4 ms | 10/10 | 10/10 | 0 | `d1-dominated`: 7, `worker-cpu-dominated`: 2, `client-network-or-platform-overhead`: 1 |
| P3-T5 repeat 2 | `reports/capacity/evidence/2026-04-30-p3-t5-strict-r2.json` | 715.2 ms | 10/10 | 10/10 | 0 | `d1-dominated`: 8, `client-network-or-platform-overhead`: 2 |

Across the retained strict-run top-tail bootstrap samples, the dominant diagnostic label is `d1-dominated` (24/30 samples). This does not open an immediate D1 mitigation phase because all strict 30 learner runs passed the configured gate. The P3 terminal outcome is therefore `strict-30-certified-candidate`, with a separate reviewed capacity-status update as the next step.

## Top-Tail Samples

| Run | Sample | Client wall | App wall | Worker wall | Worker CPU | D1 duration | Queries | Rows read | Rows written | Bytes | Classification |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| P3-T1 | `req_d3aa23132e7d8edd75940338` | 703.7 ms | 252 ms | 289 ms | 17 ms | 163.4 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T1 | `req_76befcca75832c41bd4feeef` | 702.0 ms | 286 ms | 300 ms | 16 ms | 176.5 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T1 | `req_1cfb4151fb3025c1e117bfd1` | 701.3 ms | 303 ms | 313 ms | 4 ms | 179.5 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T1 | `req_6333bd20ad231d272133c7c7` | 698.7 ms | 289 ms | 303 ms | 15 ms | 178.5 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T1 | `req_c4ac9dac7981a496d67bcb0d` | 696.8 ms | 284 ms | 296 ms | 14 ms | 163.4 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T1 | `req_3adc5c6a4cc5a15e12ea59bd` | 696.2 ms | 304 ms | 314 ms | 4 ms | 179.4 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T1 | `req_2c761e15f20e40487a69455e` | 696.2 ms | 256 ms | 290 ms | 7 ms | 163.4 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T1 | `req_d3019453ec427526b2b68474` | 694.8 ms | 230 ms | 259 ms | 14 ms | 127.5 ms | 11 | 9 | 0 | 2449 | `worker-cpu-dominated` |
| P3-T1 | `req_3ec9b740a620b21f28468739` | 693.9 ms | 284 ms | 296 ms | 14 ms | 151.4 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T1 | `req_bba838f4ff0e36aa8580c910` | 692.5 ms | 285 ms | 303 ms | 12 ms | 178.4 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T5 r1 | `req_a6ce62cc03799a4ef439b998` | 664.3 ms | 296 ms | 308 ms | 14 ms | 179.4 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T5 r1 | `req_06c7e1d7651d710b32b7facc` | 663.2 ms | 283 ms | 304 ms | 10 ms | 172.5 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T5 r1 | `req_0c0cfdff1529c52ad5b3447c` | 661.4 ms | 267 ms | 307 ms | 20 ms | 145.4 ms | 11 | 9 | 0 | 2449 | `worker-cpu-dominated` |
| P3-T5 r1 | `req_44ece595c176582183f2d428` | 660.0 ms | 289 ms | 306 ms | 7 ms | 175.4 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T5 r1 | `req_c7879c017862234b67ace69b` | 659.9 ms | 284 ms | 310 ms | 4 ms | 151.7 ms | 11 | 9 | 0 | 2449 | `client-network-or-platform-overhead` |
| P3-T5 r1 | `req_b8597202b8f6fd9de853b188` | 659.6 ms | 291 ms | 308 ms | 8 ms | 172.4 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T5 r1 | `req_f5e0ef89fe789b35f9e34216` | 656.4 ms | 273 ms | 308 ms | 6 ms | 178.4 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T5 r1 | `req_105e09e42a023cb1e97ccc5e` | 655.6 ms | 289 ms | 319 ms | 4 ms | 178.4 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T5 r1 | `req_3f2f049e94ead3944f6ca47b` | 655.2 ms | 278 ms | 317 ms | 6 ms | 174.5 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T5 r1 | `req_c0550b303c1341ee37e0481f` | 587.3 ms | 252 ms | 280 ms | 14 ms | 130.5 ms | 11 | 9 | 0 | 2449 | `worker-cpu-dominated` |
| P3-T5 r2 | `req_8f8593f380a49d389b73caa2` | 719.0 ms | 248 ms | 278 ms | 13 ms | 164.5 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T5 r2 | `req_0c34cd23e5d73c0c7c83e5d6` | 716.3 ms | 243 ms | 261 ms | 21 ms | 161.4 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T5 r2 | `req_1db8f9847ece1c938243726a` | 715.2 ms | 268 ms | 282 ms | 16 ms | 194.5 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T5 r2 | `req_5b50b3d210433df12c9696e8` | 711.9 ms | 212 ms | 248 ms | 18 ms | 144.4 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T5 r2 | `req_5f826e836572b413f121f22f` | 711.3 ms | 282 ms | 294 ms | 14 ms | 174.4 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T5 r2 | `req_52616c345610176f8d7cace8` | 710.2 ms | 278 ms | 291 ms | 15 ms | 197.4 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T5 r2 | `req_53f2f2a4c1eba1cf2b11dce1` | 622.1 ms | 229 ms | 256 ms | 12 ms | 152.4 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T5 r2 | `req_abd404f56112111141f0b10c` | 619.0 ms | 332 ms | 354 ms | 4 ms | 167.4 ms | 11 | 9 | 0 | 2449 | `client-network-or-platform-overhead` |
| P3-T5 r2 | `req_27efd988fac1a3d85e376524` | 617.6 ms | 323 ms | 328 ms | 7 ms | 174.4 ms | 11 | 9 | 0 | 2449 | `d1-dominated` |
| P3-T5 r2 | `req_3e6a2083e4c335dc552fc22c` | 616.7 ms | 298 ms | 327 ms | 7 ms | 161.4 ms | 11 | 9 | 0 | 2449 | `client-network-or-platform-overhead` |
