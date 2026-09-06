#!/bin/bash
cd /Users/junkawasaki/github/com-junkawasaki/orgs/kotoba-lang/app-kotoba-cloud || exit 1
echo "=== git remote ==="
git remote -v
echo "=== HEAD ==="
git rev-parse HEAD 2>/dev/null
git log -1 --format='%h %ci %s' 2>/dev/null
echo "=== last deploy ref via main ==="
git fetch kotoba-lang main 2>/dev/null
git rev-parse kotoba-lang/main 2>/dev/null
git log -1 kotoba-lang/main --format='%h %ci %s' 2>/dev/null
echo "=== open issues ==="
gh issue list --repo kotoba-lang/app-kotoba-cloud --state open --limit 30 2>&1
echo "=== open PRs ==="
gh pr list --repo kotoba-lang/app-kotoba-cloud --state open --limit 30 2>&1
echo "=== recent merged PRs (for deploy freshness) ==="
gh pr list --repo kotoba-lang/app-kotoba-cloud --state merged --limit 8 2>&1
echo "=== package.json wrangler + deps ==="
grep -A2 -E '"wrangler"|"chicory"|"dependencies"|"devDependencies"' package.json 2>/dev/null | head -40
echo "=== npm latest versions ==="
npm view wrangler version 2>&1 | head -1
echo "=== last commits on repo (git log) ==="
git log kotoba-lang/main --oneline -15 2>/dev/null