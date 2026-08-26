#!/bin/sh
# pre-commit 에 harness all 을 강제한다. 규칙을 사람 기억이 아니라 훅이 지킨다.
HOOK=".git/hooks/pre-commit"
cat > "$HOOK" <<'INNER'
#!/bin/sh
echo "[ pre-commit ] python scripts/harness.py all"
python scripts/harness.py all || {
  echo ""
  echo "❌ harness all 실패 — 커밋 차단 (긴급 시 git commit --no-verify)"
  exit 1
}
echo "✅ harness all 통과"
INNER
chmod +x "$HOOK"
echo "✅ pre-commit hook 설치: $HOOK"
