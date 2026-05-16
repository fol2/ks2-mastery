#!/usr/bin/env bash
set -euo pipefail
patch --binary -p1 < patches/004-reasoning-world-class-variety-hardening.patch
