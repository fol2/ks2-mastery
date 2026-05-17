# Limitations

- The uploaded ZIP remains a lean review archive. It proves the original snapshot and intentionally omits many planning/report/evidence files.
- The live implementation was ported and verified in the Git worktree at commit `8f32b9961728228e8dcfcd87870be12979a06fe8`; production proof applies to that deployed Git commit, not to byte-identity with the original ZIP.
- The original ZIP package patch was tested by package evidence, but the final production implementation used the Git checkout because the local Windows environment did not provide a `patch` binary.
- The active/passive explanation family still uses arrows intentionally to show a transformation. The prompt-leak scan reviewed these cases and recorded `blockers=0`; they were not patched because they are explanation material, not a hidden answer leak in a fix/rewrite/fill task.
- No open production, reviewer, or contract-audit limitation remains for this task.
