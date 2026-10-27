#!/usr/bin/env bash
# 기준선 만들기: 지정한 커밋(기본: HEAD)의 코드를 별도 작업 폴더에 꺼내, 지금의 검증 도구로 돌려 기준선을 저장한다.
# 사용: bash scripts/qa/baseline.sh [커밋] [audit 옵션...]
#   예) bash scripts/qa/baseline.sh            # HEAD 기준 전체 검증 기준선
#       bash scripts/qa/baseline.sh HEAD --lives=40
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REV="${1:-HEAD}"; shift || true
BASE="$ROOT/../fanta-base"
cd "$ROOT"
if [ -d "$BASE" ]; then git worktree remove --force "$BASE" 2>/dev/null || rm -rf "$BASE"; git worktree prune; fi
git worktree add -q --detach "$BASE" "$REV"
cp scripts/qa/*.ts "$BASE/scripts/qa/"
# node_modules는 공유한다 (윈도우는 디렉터리 연결, 그 밖에는 심볼릭 링크)
if command -v cmd >/dev/null 2>&1; then cmd //c "mklink /J $(cygpath -w "$BASE/node_modules") $(cygpath -w "$ROOT/node_modules")" >/dev/null; else ln -s "$ROOT/node_modules" "$BASE/node_modules"; fi
(cd "$BASE" && npx tsx scripts/qa/audit.ts --save "$@" | tail -3)
cp "$BASE"/scripts/qa/baseline*.json "$ROOT/scripts/qa/"
echo "기준선 갱신: $REV ($(git rev-parse --short "$REV"))"
