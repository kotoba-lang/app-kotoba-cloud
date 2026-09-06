#!/bin/bash
echo "=== $(date) ==="
echo "--- / ---"
curl -sS -o /dev/null -w "HTTP %{http_code} | %{time_total}s | redir:%{redirect_url}\n" https://kotoba.cloud
echo "--- /en/ ---"
curl -sS -o /dev/null -w "HTTP %{http_code} | %{time_total}s\n" https://kotoba.cloud/en/
echo "--- /health ---"
curl -sS -w "\nHTTP %{http_code}\n" https://kotoba.cloud/health
echo "--- random path (expect 404) ---"
curl -sS -o /dev/null -w "HTTP %{http_code} | %{time_total}s\n" https://kotoba.cloud/nonexistent-xyz-404
echo "--- api.kotoba.cloud/v1/control-plane ---"
curl -sS -o /dev/null -w "HTTP %{http_code} | %{time_total}s\n" -m 15 https://api.kotoba.cloud/v1/control-plane
echo "--- x-kotoba-deploy freshness header on / ---"
curl -sSI https://kotoba.cloud 2>/dev/null | grep -i "x-kotoba\|last-modified\|cf-ray\|server\|date" || echo "(no deploy header)"