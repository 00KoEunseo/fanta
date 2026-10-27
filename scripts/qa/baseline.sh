#!/usr/bin/env bash
# 기준선 만들기: 지정한 커밋(기본: HEAD)의 코드를 별도 작업 폴더에 꺼내, 지금의 검증 도구로 돌려 기준선을 저장한다.
# 사용: bash scripts/qa/baseline.sh [커밋] [audit 옵션...]
#   예) bash scripts/qa/baseline.sh            # HEAD 기준 전체 검증 기준선
#       bash scripts/qa/baseline.sh HEAD --lives=40
#
# 주의: 작업 폴더의 node_modules는 원본을 가리키는 '연결'이다. 작업 폴더를 지우기 전에 반드시 연결만 먼저 끊는다.
#       (연결을 끊지 않고 폴더째 지우면 원본 node_modules까지 지워진다)
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REV="${1:-HEAD}"; shift || true
BASE="$ROOT/../fanta-base"
cd "$ROOT"

unlink_modules() {
  local nm="$BASE/node_modules"
  [ -e "$nm" ] || [ -L "$nm" ] || return 0
  if command -v cmd >/dev/null 2>&1; then cmd //c "rmdir $(cygpath -w "$nm")" >/dev/null; else rm "$nm"; fi
  if [ -e "$nm" ]; then echo "node_modules 연결을 끊지 못했다. 중단한다: $nm" >&2; exit 1; fi
}

if [ -d "$BASE" ]; then
  unlink_modules
  git worktree remove --force "$BASE" 2>/dev/null || rm -rf "$BASE" 2>/dev/null || true
  git worktree prune
  # 다른 셸이 붙잡고 있어 폴더 자체가 남으면, 비어 있는지만 확인하고 그대로 쓴다
  if [ -d "$BASE" ] && [ -n "$(ls -A "$BASE")" ]; then echo "작업 폴더를 비우지 못했다: $BASE" >&2; exit 1; fi
fi
git worktree add -q --detach "$BASE" "$REV"
cp scripts/qa/*.ts "$BASE/scripts/qa/"
# node_modules는 공유한다 (윈도우는 디렉터리 연결, 그 밖에는 심볼릭 링크)
if command -v cmd >/dev/null 2>&1; then cmd //c "mklink /J $(cygpath -w "$BASE/node_modules") $(cygpath -w "$ROOT/node_modules")" >/dev/null; else ln -s "$ROOT/node_modules" "$BASE/node_modules"; fi
trap unlink_modules EXIT
(cd "$BASE" && npx tsx scripts/qa/audit.ts --save "$@" | tail -3)
cp "$BASE"/scripts/qa/baseline*.json "$ROOT/scripts/qa/"
echo "기준선 갱신: $REV ($(git rev-parse --short "$REV"))"
