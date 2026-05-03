# P13 全科 review 廣東話簡報

P13 live 呢點我接受。production smoke 入面已經有 `https://ks2.eugnel.uk`、production environment、P13 live-serving phase、runtime 3312 items、generated depth 100、Worker commit SHA、Worker version id、Parent Hub evidence、Admin Hub evidence，同埋 live Smart six-question smoke：6 題、6 個 unique items、0 immediate repeats。

即係：之前 P11/P12/P13 最擔心嘅「其實未 live」而家已經唔係主要問題。P13 有 production evidence。

不過，我做 full subject audit 時搵到兩個真實題目質量 bug。

第一，generated apostrophe 題有英文唔通順，例如：

```text
youve ready to move...
weve ready to move...
theyll ready to move...
it isnt move...
we arent move...
it isnt forget...
we arent forget...
```

呢啲唔係小瑕疵。Punctuation 題如果本身英文唔自然，小朋友會覺得系統唔可信。

第二，paragraph repair 題可以漏咗兩句之間嘅句號都照 mark correct。例如：

```text
We can't find the children's coats. The girls' bags are in the hall.
```

改成：

```text
We can't find the children's coats The girls' bags are in the hall
```

之前都可以 pass。呢個要修。

我已經提供 patch。patch 之後，25 個 core regression tests pass，custom audit 入面 model failure、answer surface failure、extra-tail false accept、lexical replacement false accept、punctuation-removal false accept 全部係 0。

但仲有一個大 product risk：transfer/open-production 題太少。3312 題入面，transfer 得 24 題。即係題庫好大，但真正要小朋友自己產出句子嘅深度唔夠。下一步唔應該加新 UI，應該做 P14 quality hardening：加 transfer templates、做 Star pacing simulation、再 review skill-detail modal 四題 focused round 會唔會令小朋友太快覺得完成。

我嘅建議 status：

```text
P13 before patch: LIVE_SERVING_WITH_CONTENT_QUALITY_DEFECTS
After patch + deploy + smoke: LIVE_SERVING_CONTENT_QUALITY_HARDENED
```

唔好講 full subject certified，直到 transfer depth、Star pacing、production smoke after patch 都完成。
