import { createServer } from "node:http";

const DEFAULT_RANGE_MIN = 1;
const DEFAULT_RANGE_MAX = 100;

function parsePort(argv) {
  const portFlagIndex = argv.indexOf("--port");
  if (portFlagIndex !== -1 && argv[portFlagIndex + 1]) {
    const parsed = Number.parseInt(argv[portFlagIndex + 1], 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (process.env.PORT) {
    const parsed = Number.parseInt(process.env.PORT, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 8781;
}

function computeGuess(observation) {
  const rangeMin =
    typeof observation?.rangeMin === "number" ? observation.rangeMin : DEFAULT_RANGE_MIN;
  const rangeMax =
    typeof observation?.rangeMax === "number" ? observation.rangeMax : DEFAULT_RANGE_MAX;
  let min = rangeMin;
  let max = rangeMax;

  if (min > max) {
    [min, max] = [max, min];
  }

  const lastGuess = typeof observation?.lastGuess === "number" ? observation.lastGuess : null;
  const feedback = observation?.feedback;

  if (feedback === "correct" && lastGuess !== null) {
    return lastGuess;
  }

  if (lastGuess !== null) {
    if (feedback === "higher") {
      min = Math.min(Math.max(lastGuess + 1, min), max);
    } else if (feedback === "lower") {
      max = Math.max(Math.min(lastGuess - 1, max), min);
    }
  }

  if (min > max) {
    min = rangeMin;
    max = rangeMax;
  }

  return Math.floor((min + max) / 2);
}

const modelId = process.env.MODEL_ID ?? "example-http-gateway";
const port = parsePort(process.argv.slice(2));

const server = createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/") {
    res.statusCode = 404;
    res.end("Not Found");
    return;
  }

  let body = "";
  req.setEncoding("utf-8");
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    let payload;
    try {
      payload = JSON.parse(body);
    } catch {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    if (payload?.protocolVersion !== "0.1.0") {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Unsupported protocolVersion" }));
      return;
    }

    const guess = computeGuess(payload.observation);

    const response = {
      protocolVersion: "0.1.0",
      matchId: payload.matchId,
      turn: payload.turn,
      agentId: payload.agentId,
      action: { guess },
      meta: { modelId },
    };

    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(response));
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`HTTP gateway agent listening on http://127.0.0.1:${port}`);
});
