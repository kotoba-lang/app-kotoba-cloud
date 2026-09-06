#!/bin/bash
cd /Users/junkawasaki/github/com-junkawasaki/orgs/kotoba-lang/app-kotoba-cloud || exit 1
echo "=== package.json on kotoba-lang/main ==="
git show kotoba-lang/main:package.json 2>/dev/null | grep -A2 -E '"shadow-cljs"|"wrangler"|"@noble|"dependencies"|"devDependencies"'
echo "=== npm latest: @noble/post-quantum ==="
npm view @noble/post-quantum version 2>&1 | head -1
echo "=== npm latest: shadow-cljs ==="
npm view shadow-cljs version 2>&1 | head -1
echo "=== npm latest: wrangler ==="
npm view wrangler version 2>&1 | head -1
echo "=== worker build file headers / deploy HTTP check: worker.js exists? ==="
ls -la build/worker.js 2>/dev/null || ls -la 2>/dev/null | grep -i build
echo "=== probe: does site expose a version/revision header? full headers / ==="
curl -sSI https://kotoba.cloud 2>/dev/null | head -30