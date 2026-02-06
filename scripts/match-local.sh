#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'USAGE'
Usage: scripts/match-local.sh [--scenario <name>] [--seed <number>] [--turns <number>] [--agentA <name>] [--agentB <name>]

Runs one local match, replays recap to terminal, and saves JSONL to /tmp.
USAGE
}

die() {
  echo "Error: $*" >&2
  exit 1
}

scenario="numberGuess"
seed="42"
turns="20"
agentA="random"
agentB="baseline"

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

cd "$repo_root"

echo "Building project..."
npm run build

tmp_jsonl="$(mktemp /tmp/agentleague_match_XXXXXX.jsonl)"

echo "Running match: scenario=$scenario seed=$seed turns=$turns agentA=$agentA agentB=$agentB"
node dist/cli/run-match.js \
  --scenario "$scenario" \
  --seed "$seed" \
  --turns "$turns" \
  --agentA "$agentA" \
  --agentB "$agentB" \
  --out "$tmp_jsonl"

echo "Replaying recap..."
node dist/cli/replay-match.js --in "$tmp_jsonl"

echo "saved: $tmp_jsonl"
