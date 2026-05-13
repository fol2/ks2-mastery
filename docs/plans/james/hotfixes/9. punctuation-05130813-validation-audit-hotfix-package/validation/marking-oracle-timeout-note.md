# Marking/oracle timeout note

A very large marking/oracle command was started after the patch, but it did not complete inside the local execution window. This package therefore does **not** claim that command as a pass.

Partial pre-timeout output showed:

```text
ALTERNATIVES: 13274 accepted alternatives verified
NEGATIVES: 52140 negative examples verified
CHOICES: 2420 choice items verified (exactly-one-correct)
Total pool items: 15072
Fixed items: 512
Generated items: 14560
Items with DSL tests: 14560
```

The P20 expansion verifier remained the authoritative local gate for this patch and passed after fresh application.
