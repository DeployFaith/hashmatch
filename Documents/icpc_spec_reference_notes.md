# ICPC CCS Spec — Reference Notes for Sprint #2

> Extracted from https://ccs-specs.icpc.io/draft/ (2023-06 stable + draft)
> Purpose: Cross-check GPT's ICPC-vs-HashMatch comparison when it arrives.

## Contest Package Directory Structure

```
<contest-id>/
  api.json                          # API metadata
  api/logo.png                      # API-level assets
  contest.json (or .yaml)           # Contest config (times, freeze, penalties)
  contest/banner.png                # Contest-level assets
  contest/logo.png
  judgement-types.json               # Verdict codes (AC, WA, TLE, RTE, CE, MLE, OLE...)
  languages.json (or .yaml)          # Compiler/runner definitions
  problems.json (or .yaml)           # Problem metadata + time limits
  problems/<id>/<id>.zip             # Problem package (tests, validators)
  problems/<id>/<id>.pdf             # Problem statement
  groups.json                        # Team groups/divisions
  organizations.json                 # Institutions
  organizations/<id>/logo.<size>.png
  teams.json                         # Team metadata
  teams/<id>/photo.jpg
  persons.json                       # Individual people
  persons/<id>/photo.jpg
  accounts.json (or .yaml)           # Auth credentials (admin, judge, team)
  submissions.json                   # All submissions
  submissions/<id>/files/<filename>  # Submission source code
  judgements.json                    # Judgement results
  runs.json                          # Per-test-case results
  clarifications.json                # Q&A threading
  commentary.json                    # Live commentary entries
  awards.json                        # Winner, medals, first-to-solve
  scoreboard.json                    # Final scoreboard
  state.json                         # Contest lifecycle timestamps
  event-feed.ndjson                  # Complete event changelog
```

## Event Feed Format (NDJSON)

```json
{
  "type": "submissions",
  "id": "187",
  "data": {
    "id": "187",
    "team_id": "11",
    "problem_id": "asteroids",
    "language_id": "java",
    "time": "2014-06-25T11:22:05.034+01",
    "contest_time": "1:22:05.034",
    "entry_point": "Main",
    "files": [{ "href": "contests/wf14/submissions/187/files", "mime": "application/zip" }]
  },
  "token": "abc123"
}
```

Envelope fields:

- `type`: endpoint name (plural) — submissions, judgements, teams, etc.
- `id`: event ID (string, unique, lexicographically increasing for same type)
- `data`: full current state of the object (or null for delete)
- `token`: reconnection token (use with `?since_token=`)

Rules:

- Complete from beginning of time on initial connection
- No guaranteed cross-type ordering
- Keepalive newline every 120 seconds
- No termination under normal circumstances
- `op` field removed in 2022-07 (events are always current state)

## Contest State Lifecycle

```json
{
  "started": "2014-06-25T10:00:00+01",
  "frozen": "2014-06-25T14:00:00+01", // scoreboard freeze
  "ended": "2014-06-25T15:00:00+01",
  "thawed": "2014-06-25T15:15:00+01", // reveal (Resolver triggers this)
  "finalized": "2014-06-25T15:30:00+01", // results are official
  "end_of_updates": "2014-06-25T16:00:00+01" // no more changes
}
```

Strict ordering: started < frozen < ended < thawed < finalized < end_of_updates

## Access Control (Roles)

| Role   | Submissions after freeze | Judgements after freeze | Runs              |
| ------ | ------------------------ | ----------------------- | ----------------- |
| public | YES                      | NO                      | NO (until thawed) |
| admin  | YES                      | YES                     | YES               |

The `contest_thaw` capability allows PATCH to set `scoreboard_thaw_time`.

## File References

```json
{
  "href": "https://example.com/api/contests/wf2014/teams/11/photo",
  "filename": "photo.jpg",
  "mime": "image/jpeg",
  "width": 640,
  "height": 480
}
```

- `filename` for local disk lookup
- `href` as fallback URL (may be stale after contest)
- Supports "shallow packages" where files are referenced by URL not embedded

## Use-Case-Driven Package Contents

| Use Case          | Required                                             | Optional                                        |
| ----------------- | ---------------------------------------------------- | ----------------------------------------------- |
| CCS Configuration | api, contest, languages, problems, teams, accounts   | judgement-types, groups, organizations, persons |
| Results Upload    | api, teams, scoreboard                               | awards                                          |
| Full Archive      | all endpoints + event-feed.ndjson + submission files | —                                               |

## Key Design Decisions to Study

1. **Package = API on disk.** Every endpoint maps 1:1 to a file. No separate "archive format" — same data, different transport.
2. **YAML for human-editable, JSON for machine-generated.** Pragmatic dual-format support.
3. **File references support stale URLs.** Designed for the reality that contest networks get torn down.
4. **Multi-system support.** `other-systems/<name>/` subdirectories for shadow CCS data. Symlinks for deduplication.
5. **Commentary is a first-class endpoint** (added 2022-07). Has `tags`, `source_id`, `submission_ids` fields. Shows that even ICPC eventually formalized narrative data.

## Mapping to HashMatch Concepts

| ICPC Concept                 | HashMatch Equivalent           | Notes                                                     |
| ---------------------------- | ------------------------------ | --------------------------------------------------------- |
| contest.json                 | match_manifest.json            | Contest metadata + config                                 |
| event-feed.ndjson            | match.jsonl                    | Complete event log                                        |
| scoreboard.json              | match_summary.json             | Derived standings/results                                 |
| state.json                   | (no equivalent)                | **GAP** — we don't have explicit lifecycle timestamps     |
| submissions/                 | (agent actions in match.jsonl) | Different domain — they log source code, we log actions   |
| judgements/                  | (outcomes in match.jsonl)      | They separate submissions from judgements; we combine     |
| awards.json                  | (in tournament_manifest?)      | We don't have a formal awards/results artifact            |
| commentary.json              | commentary.json (show layer)   | Both have it; theirs is authoritative, ours is show-layer |
| `scoreboard_freeze_duration` | `_private` field convention    | Different mechanism, same goal                            |
| `state.finalized`            | (no equivalent)                | **GAP** — we need a "finalized" concept                   |
| Reconnection token           | (no equivalent for SSE)        | **GAP** — need reconnection for live streams              |
| Package = API on disk        | Bundle ≈ but not identical     | We have separate bundle layout vs future API              |
