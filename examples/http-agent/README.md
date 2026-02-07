# HTTP Gateway Agent (Example)

This example runs a minimal HTTP gateway agent using Node's built-in `http` module.

## Run two agents

In two terminals, start the agent server twice with different ports:

```bash
node examples/http-agent/server.mjs --port 8781
node examples/http-agent/server.mjs --port 8782
```

## Run a match against the HTTP gateway

```bash
npm run match -- --gateway http --agent-urls "http://127.0.0.1:8781,http://127.0.0.1:8782" --out "$OUTDIR/match.jsonl"
```

## Transcript output

When you pass `--out`, the gateway also writes a diagnostic transcript file named
`gateway_transcript.jsonl` alongside `match.jsonl` in the same directory.
