#!/usr/bin/env bash
# Manual live-harness matrix (§11.2).
#
# The automated suites cover everything CI can reach. These steps need real
# external accounts (Claude Code, Codex, Hermes, OpenClaw) and a real PAT, so they
# stay a script you drive by hand before a release.
#
#   export WZRD_PAT=wzrd_pat_…
#   scripts/plugin/live-harness.sh            # interactive, writes a report
#   scripts/plugin/live-harness.sh --dry      # print the matrix and exit
#
# Nothing here spends credits on its own: the spending steps are performed by you
# inside the client under test, after it has shown you a credit number.
set -euo pipefail

MCP_URL="${MCP_URL:-https://ixkkrousepsiorwlaycp.supabase.co/functions/v1/mcp-server}"
REPO="gratitude5dee/WZRD-Studio"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPORT="${REPORT:-$REPO_ROOT/live-harness-report.md}"
DRY_RUN=0
[[ "${1:-}" == "--dry" ]] && DRY_RUN=1

STEPS=(
  "Claude Code|/plugin marketplace add $REPO && /plugin install wzrd-studio|Plugin installs; the nine wzrd-* skills are listed"
  "Claude Code|/wzrd:setup|Project created, timeline deep link shown, 0 credits"
  "Claude Code|/wzrd:storyboard (3 iterations)|Free propose/diff loop; the hook renders the storyboard as a markdown table"
  "Claude Code|/wzrd:generate|get_credits -> dryRun quote -> explicit confirmation -> exactly the catalog price, charged once"
  "Claude Code|/wzrd:generate then decline the confirmation|Nothing is charged"
  "Claude Code|/wzrd:handoff|Review packet; every reference slot populated or explicitly null with a reason; 0 credits"
  "Codex|codex mcp add wzrd-remote --url $MCP_URL --bearer-token-env-var WZRD_PAT; npx skills add github:$REPO/plugin/skills|Tools + skills available; golden path repeats"
  "Hermes|Point the harness at com.hermes/agent.yaml|Every generate tool goes through draft/approve; billing tool present"
  "OpenClaw|Activate via ai.openclaw/manifest.json|Plugin activates; skills + mcp.json alone are sufficient"
  "VS Code / Cursor / Copilot / Kiro|Paste the mcp.json snippet from Settings -> Agent access|Server connects; golden path repeats"
  "Any client|Revoke the PAT mid-session|Next call fails with -32001; the client stops cleanly, no retry storm"
  "Any client|Use a PAT with a 1-credit monthly cap|Generation refused with -32003 and { used, cap, resetsAt }"
  "Web app|Open the project's Timeline tab|The frame generated in step 4 is visible in the app"
)

print_matrix() {
  printf '%-34s | %s\n' "CLIENT / STEP" "EXPECTED"
  printf -- '-%.0s' {1..110}; echo
  for step in "${STEPS[@]}"; do
    IFS='|' read -r client action expected <<<"$step"
    printf '%-34s | %s\n' "$client" "$expected"
    printf '%-34s | %s\n' "  → $action" ""
  done
}

automated_preflight() {
  echo "== Non-interactive preflight (no external account needed) =="

  local local_version
  local_version="$(node -p "require('$REPO_ROOT/plugin/plugin.json').version")"

  echo -n "  /health version+commit: "
  local health
  health="$(curl -fsS "$MCP_URL/health")" || { echo "FAILED to reach $MCP_URL/health"; return 1; }
  echo "$health"
  node -e "
    const health = $health;
    if (health.version !== '$local_version') { console.error('  ✗ deployed version ' + health.version + ' != local ' + '$local_version'); process.exit(1); }
    if (!health.commit) { console.error('  ✗ /health does not report a commit'); process.exit(1); }
    console.log('  ✓ /health matches the local plugin version and reports a commit');
  "

  echo -n "  unauthenticated tools/call: "
  local code
  code="$(curl -fsS -X POST "$MCP_URL" -H 'Content-Type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_credits","arguments":{}}}' \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).error?.code))")"
  if [[ "$code" == "-32001" ]]; then echo "-32001 ✓"; else echo "expected -32001, got $code ✗"; return 1; fi

  if [[ -n "${WZRD_PAT:-}" ]]; then
    echo -n "  authenticated tools/list: "
    curl -fsS -X POST "$MCP_URL" -H 'Content-Type: application/json' -H "Authorization: Bearer $WZRD_PAT" \
      -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
      | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const t=JSON.parse(s).result?.tools??[];console.log(t.length+' tools');})"
  else
    echo "  (set WZRD_PAT to also check tools/list and initialize with a real token)"
  fi
}

if [[ $DRY_RUN -eq 1 ]]; then
  print_matrix
  exit 0
fi

automated_preflight || echo "  preflight reported a problem — record it in the report"

{
  echo "# WZRD plugin live-harness report"
  echo
  echo "- date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "- operator: ${USER:-unknown}"
  echo "- server: $MCP_URL"
  echo "- plugin version: $(node -p "require('$REPO_ROOT/plugin/plugin.json').version")"
  echo
  echo "| # | Client | Step | Expected | Verdict | Notes |"
  echo "| --- | --- | --- | --- | --- | --- |"
} >"$REPORT"

index=0
for step in "${STEPS[@]}"; do
  index=$((index + 1))
  IFS='|' read -r client action expected <<<"$step"
  echo
  echo "── Step $index/${#STEPS[@]} — $client"
  echo "   do:       $action"
  echo "   expected: $expected"
  read -r -p "   verdict [p]ass / [f]ail / [s]kip: " verdict
  read -r -p "   notes (optional): " notes
  case "$verdict" in
    p|P) verdict="pass" ;;
    f|F) verdict="FAIL" ;;
    *) verdict="skipped" ;;
  esac
  echo "| $index | $client | ${action//|/\\|} | ${expected//|/\\|} | $verdict | ${notes//|/\\|} |" >>"$REPORT"
done

echo
echo "Report written to $REPORT"
grep -c '| FAIL |' "$REPORT" >/dev/null 2>&1 && echo "Some steps FAILED — do not release." || true
