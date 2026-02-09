#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'USAGE'
Usage: scripts/match-publish.sh [--scenario <name>] [--seed <number>] [--turns <number>] [--agentA <name>] [--agentB <name>]

Runs one match, publishes latest JSONL + Markdown recap to /var/www/hashmatch/matches.
USAGE
}

die() {
  echo "Error: $*" >&2
  exit 1
}

scenario="numberGuess"
seed="42"
turns="20"
agentA="llm:ollama:qwen2.5:3b"
agentB="llm:ollama:qwen2.5:3b"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scenario)
      [[ $# -ge 2 ]] || die "Missing value for --scenario"
      scenario="$2"
      shift 2
      ;;
    --seed)
      [[ $# -ge 2 ]] || die "Missing value for --seed"
      seed="$2"
      shift 2
      ;;
    --turns)
      [[ $# -ge 2 ]] || die "Missing value for --turns"
      turns="$2"
      shift 2
      ;;
    --agentA)
      [[ $# -ge 2 ]] || die "Missing value for --agentA"
      agentA="$2"
      shift 2
      ;;
    --agentB)
      [[ $# -ge 2 ]] || die "Missing value for --agentB"
      agentB="$2"
      shift 2
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

if [[ "$agentA" != llm:* || "$agentB" != llm:* ]]; then
  die "Publish blocked: non-LLM agents are not allowed. Use llm:<provider>:<model>[:<purpose>]."
fi
if [[ "$agentA" == *:test || "$agentB" == *:test ]]; then
  die "Publish blocked: test-purpose agents cannot be published."
fi

web_root="/var/www/hashmatch"
matches_dir="$web_root/matches"
out_jsonl="$matches_dir/latest.jsonl"
out_md="$matches_dir/latest.md"

[[ -d "$web_root" ]] || die "Publish root not found: $web_root"
[[ -w "$web_root" ]] || die "Publish root is not writable: $web_root"

mkdir -p "$matches_dir"
[[ -w "$matches_dir" ]] || die "Matches directory is not writable: $matches_dir"

cd "$repo_root"

echo "Building project..."
npm run build

echo "Publishing match: scenario=$scenario seed=$seed turns=$turns agentA=$agentA agentB=$agentB"
HASHMATCH_PUBLISH=1 node dist/cli/run-match.js \
  --scenario "$scenario" \
  --seed "$seed" \
  --turns "$turns" \
  --agentA "$agentA" \
  --agentB "$agentB" \
  --out "$out_jsonl"

node dist/cli/replay-match.js --in "$out_jsonl" --out-md "$out_md"

echo "Wrote: $out_jsonl"
echo "Wrote: $out_md"
echo "URL: https://hashmatch.deployfaith.xyz/matches/latest.jsonl"
echo "URL: https://hashmatch.deployfaith.xyz/matches/latest.md"
echo "OUTPUT_JSONL=$out_jsonl"
echo "OUTPUT_MD=$out_md"
echo "OUTPUT_DIR=$matches_dir"
if [[ -f "$matches_dir/gateway_transcript.jsonl" ]]; then
  echo "OUTPUT_GATEWAY_TRANSCRIPT=$matches_dir/gateway_transcript.jsonl"
fi
