#!/usr/bin/env bash
set -euo pipefail

# Requires: jq (apt install jq / brew install jq)
# Recommended: run 10-20 rounds minimum for stable deltas (LLM has sampling stochasticity)

# Workflow:
# 1. On main:    HASHMATCH_ALLOW_TOOLS=1 bash scripts/heist-prompt-experiment.sh run 9001 10
#    Note the output path.
# 2. Switch:     git switch prompt/heist-strategy-fm17-ab-harness
# 3. On branch:  HASHMATCH_ALLOW_TOOLS=1 bash scripts/heist-prompt-experiment.sh run 9001 10
#    Note the output path.
# 4. Compare:    bash scripts/heist-prompt-experiment.sh compare /tmp/.../baseline /tmp/.../strategy

LLM_AGENT_KEY="llm:ollama:qwen2.5-coder:7b"

usage() {
  echo "Usage: scripts/heist-prompt-experiment.sh run [seed] [rounds]"
  echo "       scripts/heist-prompt-experiment.sh compare <baseline-dir> <strategy-dir>"
}

mean_from_list() {
  local values="$1"
  if [[ -z "$values" ]]; then
    echo "-"
    return
  fi
  awk '{s+=$1; n+=1} END { if (n==0) print "-"; else printf "%.3f", s/n }' <<< "$values"
}

extract_metric_lines() {
  local dir="$1"
  find "$dir" -type f -path "*/matches/*/match.jsonl" | sort | while read -r match_jsonl; do
    local line
    line=$(jq -rs --arg llm "$LLM_AGENT_KEY" '
      def llmAgentId:
        ((map(select(.type=="MatchStarted") | .agentIds[]?) | map(select(test($llm))) | .[0]) // $llm);
      def firstTurnForAction($aid; $atype):
        (map(select(.type=="ActionAdjudicated" and .agentId==$aid and (.chosenAction.type? == $atype)) | .turn) | .[0] // "-");
      def firstTurnForExtraction($aid):
        (
          (
            map(
              select(.type=="StateUpdated")
              | select((.summary.agents[$aid].extracted? // false) == true)
              | .turn
            )
            | .[0]
          )
          // "-"
        );
      . as $events
      | (llmAgentId) as $aid
      | {
          agentId: $aid,
          inv: ($events | map(select(.type=="InvalidAction" and .agentId==$aid)) | length),
          mv: ($events | map(select(.type=="ActionAdjudicated" and .agentId==$aid and (.chosenAction.type? == "move"))) | length),
          pk: ($events | map(select(.type=="ActionAdjudicated" and .agentId==$aid and (.chosenAction.type? == "pickup"))) | length),
          hk: ($events | map(select(.type=="ActionAdjudicated" and .agentId==$aid and (.chosenAction.type? == "use_terminal"))) | length),
          ex: ($events | map(select(.type=="ActionAdjudicated" and .agentId==$aid and (.chosenAction.type? == "extract"))) | length),
          wt: ($events | map(select(.type=="ActionAdjudicated" and .agentId==$aid and (.chosenAction.type? == "wait"))) | length),
          extracted: (
            ($events | map(select(.type=="StateUpdated" and ((.summary.agents[$aid].extracted? // false) == true))) | length)
            +
            ($events | map(select(.type=="MatchEnded" and (((.details.agents // []) | map(select(.agentId==$aid and (.extracted==true))) | length) > 0))) | length)
          ),
          score: ($events | map(select(.type=="MatchEnded") | .scores[$aid]?) | .[0] // "?"),
          unique_rooms: (
            $events
            | map(select(.type=="StateUpdated") | .summary.agents[$aid].roomId? // empty)
            | unique
            | length
          ),
          turns_to_extract: firstTurnForExtraction($aid),
          turns_to_first_pickup: firstTurnForAction($aid; "pickup")
        }
      | [
          .inv,
          .mv,
          .pk,
          .hk,
          .ex,
          .wt,
          .extracted,
          (.score|tostring),
          .unique_rooms,
          (.turns_to_extract|tostring),
          (.turns_to_first_pickup|tostring)
        ]
      | @tsv
    ' "$match_jsonl")

    IFS=$'\t' read -r inv mv pk hk ex wt extracted score unique_rooms turns_to_extract turns_to_first_pickup <<< "$line"
    echo "$(basename "$(dirname "$match_jsonl")"): inv=${inv} mv=${mv} pk=${pk} hk=${hk} ex=${ex} wt=${wt} extracted=${extracted} score=${score} unique_rooms=${unique_rooms} turns_to_extract=${turns_to_extract} turns_to_first_pickup=${turns_to_first_pickup}"
    echo "$inv|$score|$extracted|$turns_to_extract|$turns_to_first_pickup|$unique_rooms"
  done
}

summarize_dir() {
  local dir="$1"
  local label="$2"
  local lines
  lines=$(extract_metric_lines "$dir")

  local metrics
  metrics=$(echo "$lines" | tail -n +1 | awk -F'|' 'NF==6 {print}')

  echo "[$label]"
  echo "$lines" | awk -F"|" 'NF!=6 {print}' || true

  local total
  total=$(echo "$metrics" | awk 'NF>0{n+=1} END{print n+0}')
  local extracted_matches
  extracted_matches=$(echo "$metrics" | awk -F'|' '$3+0>0{n+=1} END{print n+0}')
  local extraction_rate="0.000"
  if [[ "$total" -gt 0 ]]; then
    extraction_rate=$(awk -v e="$extracted_matches" -v t="$total" 'BEGIN{printf "%.3f", e/t}')
  fi

  local score_values
  score_values=$(echo "$metrics" | awk -F'|' '$2 != "?" {print $2}')
  local mean_score
  mean_score=$(mean_from_list "$score_values")

  local total_invalid
  total_invalid=$(echo "$metrics" | awk -F'|' '{s+=$1} END{print s+0}')

  local extract_turn_values
  extract_turn_values=$(echo "$metrics" | awk -F'|' '$4 != "-" {print $4}')
  local mean_turns_to_extract
  mean_turns_to_extract=$(mean_from_list "$extract_turn_values")

  local pickup_turn_values
  pickup_turn_values=$(echo "$metrics" | awk -F'|' '$5 != "-" {print $5}')
  local mean_turns_to_first_pickup
  mean_turns_to_first_pickup=$(mean_from_list "$pickup_turn_values")

  local unique_room_values
  unique_room_values=$(echo "$metrics" | awk -F'|' '{print $6}')
  local mean_unique_rooms
  mean_unique_rooms=$(mean_from_list "$unique_room_values")

  echo "Summary:"
  echo "  Total matches: $total"
  echo "  Extraction rate: $extracted_matches/$total ($extraction_rate)"
  echo "  Mean score: $mean_score"
  echo "  Total invalid actions: $total_invalid"
  echo "  Mean turns to extraction: $mean_turns_to_extract"
  echo "  Mean turns to first pickup: $mean_turns_to_first_pickup"
  echo "  Mean unique rooms: $mean_unique_rooms"

  echo "SUMMARY|$label|$total|$extracted_matches|$extraction_rate|$mean_score|$total_invalid|$mean_turns_to_extract|$mean_turns_to_first_pickup|$mean_unique_rooms"
}

run_mode() {
  local seed="${1:-9001}"
  local rounds="${2:-10}"
  local stamp
  stamp=$(date +%Y%m%d-%H%M%S)
  local out_dir="/tmp/hm-prompt-experiment-${stamp}-seed${seed}-r${rounds}"

  echo "Running tournament -> $out_dir"
  npm run tournament -- \
    --seed "$seed" \
    --rounds "$rounds" \
    --scenario heist \
    --agents "${LLM_AGENT_KEY},noop" \
    --maxTurns 20 \
    --outDir "$out_dir"

  summarize_dir "$out_dir" "run"
  echo "Output directory: $out_dir"
}

num_or_zero() {
  local v="$1"
  if [[ "$v" == "-" || "$v" == "?" || -z "$v" ]]; then
    echo "0"
  else
    echo "$v"
  fi
}

compare_mode() {
  local baseline_dir="$1"
  local strategy_dir="$2"

  local b_summary s_summary
  b_summary=$(summarize_dir "$baseline_dir" "baseline" | tee /tmp/hm-baseline-summary.$$ | tail -n 1)
  s_summary=$(summarize_dir "$strategy_dir" "strategy" | tee /tmp/hm-strategy-summary.$$ | tail -n 1)

  IFS='|' read -r _ _ b_total b_extracted b_rate b_mean_score b_invalid b_tte b_ttfp b_unique <<< "$b_summary"
  IFS='|' read -r _ _ s_total s_extracted s_rate s_mean_score s_invalid s_tte s_ttfp s_unique <<< "$s_summary"

  local d_rate d_score d_invalid d_tte d_ttfp d_unique
  d_rate=$(awk -v s="$(num_or_zero "$s_rate")" -v b="$(num_or_zero "$b_rate")" 'BEGIN{printf "%.3f", s-b}')
  d_score=$(awk -v s="$(num_or_zero "$s_mean_score")" -v b="$(num_or_zero "$b_mean_score")" 'BEGIN{printf "%.3f", s-b}')
  d_invalid=$(awk -v s="$(num_or_zero "$s_invalid")" -v b="$(num_or_zero "$b_invalid")" 'BEGIN{printf "%.0f", s-b}')
  d_tte=$(awk -v s="$(num_or_zero "$s_tte")" -v b="$(num_or_zero "$b_tte")" 'BEGIN{printf "%.3f", s-b}')
  d_ttfp=$(awk -v s="$(num_or_zero "$s_ttfp")" -v b="$(num_or_zero "$b_ttfp")" 'BEGIN{printf "%.3f", s-b}')
  d_unique=$(awk -v s="$(num_or_zero "$s_unique")" -v b="$(num_or_zero "$b_unique")" 'BEGIN{printf "%.3f", s-b}')

  echo "Delta [strategy - baseline]:"
  echo "  Extraction rate delta: $d_rate"
  echo "  Mean score delta: $d_score"
  echo "  Total invalid actions delta: $d_invalid"
  echo "  Mean turns-to-extract delta: $d_tte"
  echo "  Mean turns-to-first-pickup delta: $d_ttfp"
  echo "  Mean unique rooms delta: $d_unique"

  rm -f /tmp/hm-baseline-summary.$$ /tmp/hm-strategy-summary.$$
}

main() {
  local mode="${1:-}"
  case "$mode" in
    run)
      run_mode "${2:-9001}" "${3:-10}"
      ;;
    compare)
      if [[ $# -lt 3 ]]; then
        usage
        exit 1
      fi
      compare_mode "$2" "$3"
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
