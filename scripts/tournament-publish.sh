#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'USAGE'
Usage: scripts/tournament-publish.sh [--seed <number>] [--rounds <number>] [--maxTurns <number>] [--scenario <name>] [--agents <csv>] [--writeLogs]

Runs a tournament and publishes output under /var/www/hashmatch/tournaments/<run_id>/.
USAGE
}

die() {
  echo "Error: $*" >&2
  exit 1
}

seed="42"
rounds="3"
max_turns="20"
scenario="numberGuess"
agents="llm:ollama:qwen2.5:3b,llm:ollama:qwen2.5:3b"
write_logs="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --seed)
      [[ $# -ge 2 ]] || die "Missing value for --seed"
      seed="$2"
      shift 2
      ;;
    --rounds)
      [[ $# -ge 2 ]] || die "Missing value for --rounds"
      rounds="$2"
      shift 2
      ;;
    --maxTurns)
      [[ $# -ge 2 ]] || die "Missing value for --maxTurns"
      max_turns="$2"
      shift 2
      ;;
    --scenario)
      [[ $# -ge 2 ]] || die "Missing value for --scenario"
      scenario="$2"
      shift 2
      ;;
    --agents)
      [[ $# -ge 2 ]] || die "Missing value for --agents"
      agents="$2"
      shift 2
      ;;
    --writeLogs)
      write_logs="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage
      die "Unknown option: $1"
      ;;
  esac
done

IFS="," read -r -a agent_list <<<"$agents"
for agent_key in "${agent_list[@]}"; do
  if [[ "$agent_key" != llm:* ]]; then
    die "Publish blocked: non-LLM agents are not allowed. Use llm:<provider>:<model>[:<purpose>]."
  fi
  if [[ "$agent_key" == *:test ]]; then
    die "Publish blocked: test-purpose agents cannot be published."
  fi
done

web_root="/var/www/hashmatch"
tournaments_dir="$web_root/tournaments"

[[ -d "$web_root" ]] || die "Publish root not found: $web_root"
[[ -w "$web_root" ]] || die "Publish root is not writable: $web_root"

mkdir -p "$tournaments_dir"
[[ -w "$tournaments_dir" ]] || die "Tournaments directory is not writable: $tournaments_dir"

run_id="$(date -u +%Y-%m-%d_%H%M%SZ)_seed-${seed}"
out_dir="$tournaments_dir/$run_id"

cd "$repo_root"

echo "Building project..."
npm run build

echo "Publishing tournament: seed=$seed rounds=$rounds maxTurns=$max_turns scenario=$scenario agents=$agents writeLogs=$write_logs"

cmd=(
  HASHMATCH_PUBLISH=1
  node
  dist/cli/run-tournament.js
  --seed "$seed"
  --rounds "$rounds"
  --maxTurns "$max_turns"
  --scenario "$scenario"
  --agents "$agents"
  --outDir "$out_dir"
)

if [[ "$write_logs" == "true" ]]; then
  cmd+=(--writeLogs)
fi

"${cmd[@]}"

echo "Wrote tournament output to: $out_dir"
echo "URL: https://hashmatch.deployfaith.xyz/tournaments/$run_id/tournament.json"

if [[ "$write_logs" == "true" ]]; then
  echo "Match logs: $out_dir/matches/*.jsonl"
fi
