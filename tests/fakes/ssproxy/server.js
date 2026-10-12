// Fake ss-proxy router for the ielts-smart-web E2E spike.
//
// Replaces the real external SpeechSuper router. The backend worker submits one
// speaking item per question to POST /v1/score (see backend
// internal/scoring/infra/ssproxy/client.go); the real router scores it and
// later POSTs the result back to a webhook. This fake mimics that round-trip:
//
//   1. POST /v1/score          -> log + 202 Accepted (echoing nothing)
//   2. ~200ms later, the fake  -> POST {webhook_url from the request body}
//      with header X-SS-Signature = hex(HMAC_SHA256(rawBody, WEBHOOK_SECRET))
//      and body { idempotency_key, status:"succeeded", result:<resultSummary> }
//
// Each /v1/score call produces exactly one webhook callback that echoes back
// that call's own idempotency_key, so N parallel items => N callbacks.
//
// Pure Node built-ins (http + crypto). No npm deps, no fixtures needed: the
// resultSummary band is a fixed valid block defined inline below.
//
// Env:
//   PORT                   listen port           (default 5555)
//   SSPROXY_WEBHOOK_SECRET HMAC secret for X-SS-Signature (required to match BE)
//   CALLBACK_DELAY_MS      delay before callback  (default 200)

const http = require("http");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 5555);
const WEBHOOK_SECRET = process.env.SSPROXY_WEBHOOK_SECRET || "test-webhook-secret";
const CALLBACK_DELAY_MS = Number(process.env.CALLBACK_DELAY_MS || 200);

// Fixed, valid SpeechSuper `result` summary. Shape MUST match the
// `resultSummary` struct decoded by the backend at
// internal/scoring/infra/speechsuper/client.go (~lines 269-285). Only the
// fields the parser reads need real values; extras are harmless.
//
// overall 6.5 is a plausible mid band; per-criterion bands are >0 so the LLM
// aggregator downstream gets coherent input.
function buildResultSummary() {
  return {
    overall: 6.5,
    fluency_coherence: 6.5,
    lexical_resource: 6.5,
    grammar: 6.0,
    pronunciation: 7.0,
    relevance: 90,
    speed: 120,
    numeric_duration: 12.5,
    effective_speech_length: 11.0,
    // Verbatim the answer the OpenAI fixtures were captured from. Both fakes must describe the
    // SAME audio: the grader quotes `error_part` out of the transcript, and the review screen can
    // only highlight an error it can find there. Two unrelated stub texts silently kill the
    // highlight — which is how a real feature ends up with a test that can never pass.
    transcription:
      "Okay, we are trying this for a second time to test the ability to upload an MP3 file. Hopefully this will work.",
    fluency_stats: { pause_cnt: 2 },
    pause_filler: { um: 1, uh: 1 },
    sentences: [
      {
        details: [
          { word: "okay", pronunciation: 95, start: 0, end: 30, level: "good" },
          { word: "we", pronunciation: 92, start: 30, end: 50, level: "good" },
          { word: "are", pronunciation: 88, start: 50, end: 90, level: "average" },
          { word: "trying", pronunciation: 74, start: 90, end: 140, level: "average" },
          { word: "this", pronunciation: 55, start: 140, end: 180, level: "poor" },
        ],
      },
    ],
  };
}

function sign(rawBody) {
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
}

function fireCallback(webhookUrl, idempotencyKey) {
  const payload = JSON.stringify({
    idempotency_key: idempotencyKey, // echo the exact key from the request
    status: "succeeded",
    result: buildResultSummary(),
  });
  const sig = sign(payload);

  let target;
  try {
    target = new URL(webhookUrl);
  } catch (err) {
    console.error("[ssproxy] invalid webhook_url:", webhookUrl, err.message);
    return;
  }

  const req = http.request(
    {
      hostname: target.hostname,
      port: target.port || 80,
      path: target.pathname + target.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "X-SS-Signature": sig,
      },
    },
    (res) => {
      res.resume(); // drain
      console.log(
        `[ssproxy] callback ${webhookUrl} key=${idempotencyKey} -> ${res.statusCode}`
      );
    }
  );
  req.on("error", (err) => {
    console.error(`[ssproxy] callback error key=${idempotencyKey}:`, err.message);
  });
  req.write(payload);
  req.end();
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/v1/score") {
    let chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch (err) {
        console.error("[ssproxy] bad json on /v1/score:", err.message);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "bad json" }));
        return;
      }

      const token = req.headers["x-router-token"];
      const idempotencyKey = body.idempotency_key;
      const webhookUrl = body.webhook_url;
      console.log(
        `[ssproxy] /v1/score token=${token} key=${idempotencyKey} webhook=${webhookUrl} part=${
          body.item && body.item.part
        }`
      );

      // Accept regardless of token (router-token check is the BE's concern on
      // the way out; this stub just needs to mirror the 202 contract).
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ accepted: true }));

      if (webhookUrl && idempotencyKey) {
        setTimeout(() => fireCallback(webhookUrl, idempotencyKey), CALLBACK_DELAY_MS);
      } else {
        console.error(
          "[ssproxy] missing webhook_url or idempotency_key, no callback fired"
        );
      }
    });
    return;
  }

  if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "fake-ssproxy" }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found" }));
});

server.listen(PORT, () => {
  console.log(
    `[ssproxy] fake ss-proxy listening on :${PORT} (secret len=${WEBHOOK_SECRET.length}, delay=${CALLBACK_DELAY_MS}ms)`
  );
});
