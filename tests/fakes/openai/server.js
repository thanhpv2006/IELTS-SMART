// Fake OpenAI chat-completions endpoint for the ielts-smart-web E2E spike.
//
// Replaces api.openai.com for the LLM aggregator step. The backend calls it via
// the openai-go SDK (see backend internal/scoring/infra/openai/common.go,
// streamChatCompletion): a streaming chat.completions request in JSON mode. The
// SDK accumulates `choices[].delta.content` across chunks
// (ChatCompletionAccumulator.AddChunk) and reads the final assembled string as
// the assistant message content.
//
// This fake serves a canned fixture JSON (the exact JSON object the aggregator
// prompt expects back), split into many small SSE chunks and terminated with
// `data: [DONE]`, matching the OpenAI Chat Completions streaming wire format:
//
//   data: {"id":"...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}
//   data: {"id":"...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"<piece>"},"finish_reason":null}]}
//   ...
//   data: {"id":"...","object":"chat.completion.chunk","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}
//   data: {"id":"...",...,"usage":{...}}            // StreamOptions.IncludeUsage=true
//   data: [DONE]
//
// Fixture selection (in priority order):
//   1. Header `X-Fake-Fixture: <name>` (with or without .json) — explicit override.
//   2. Body content: if any message mentions "writing" -> writing_exam_high.json;
//      otherwise (speaking is the default) -> speaking_exam_high_pass.json.
//   3. Env DEFAULT_FIXTURE overrides the speaking default if set.
//
// Pure Node built-ins (http + fs + path). No npm deps.
//
// Env:
//   PORT             listen port              (default 6000)
//   FIXTURES_DIR     dir holding the *.json   (default ../fixtures, see Docker note)
//   DEFAULT_FIXTURE  fixture when nothing else matches (default speaking_exam_high_pass.json)
//   CHUNK_SIZE       bytes of content per SSE chunk (default 48)

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 6000);
// In the Docker image, fixtures are copied to /app/fixtures (see Dockerfile).
// For `node openai/server.js` from tests/fakes/, default to ../fixtures.
const FIXTURES_DIR =
  process.env.FIXTURES_DIR || path.join(__dirname, "..", "fixtures");
const DEFAULT_FIXTURE = process.env.DEFAULT_FIXTURE || "speaking_exam_high_pass.json";
const CHUNK_SIZE = Number(process.env.CHUNK_SIZE || 48);

const SPEAKING_FIXTURE = "speaking_exam_high_pass.json";
const WRITING_FIXTURE = "writing_exam_high.json";
const SCRIBE_FIXTURE = "speaking_exam_high_scribe.json";
const GATE_FAIL_FIXTURE = "speaking_exam_high_review.json";

// Part 3 of the seeded "E2E Batch Set", verbatim. It is the discriminator for the gate-FAIL
// answer, so it must stay byte-identical to cmd/seed-e2e/main.go's batchSetItems.
const GATE_FAIL_PROMPT = "famous people have more influence on society";

function normalizeFixtureName(name) {
  if (!name) return null;
  return name.endsWith(".json") ? name : name + ".json";
}

function pickFixture(headerFixture, bodyText) {
  const override = normalizeFixtureName(headerFixture);
  if (override) return override;
  // Reliable discriminator: the WRITING aggregate prompt contains the IELTS
  // writing criteria "Task Achievement"/"Task Response"/"Coherence and Cohesion",
  // which never appear in the SPEAKING prompt (criteria FC/LR/GRA/PRON). The
  // speaking prompt does mention the bare word "writing" a few times, so a
  // naive /writing/ check mis-selects — use the writing-only criterion names.
  if (/Task Achievement|Task Response|Coherence and Cohesion/i.test(bodyText)) {
    return WRITING_FIXTURE;
  }
  // The ElevenLabs branch sends the compact Scribe payload as the user message and
  // stamps its schema name in input_version, so that literal appears on every scribe
  // request and on no SpeechSuper one. The two answers differ in shape (V7 returns
  // exactly five top-level keys), which is why they cannot share a fixture.
  if (bodyText.includes("scribe_v2_compact_1")) {
    return SCRIBE_FIXTURE;
  }
  // Which set is graded is the only thing a spec controls in this request, so "E2E Batch Set"
  // is reserved as the gate=Fail one — no other spec sends it through scoring.
  if (bodyText.includes(GATE_FAIL_PROMPT)) {
    return GATE_FAIL_FIXTURE;
  }
  return SPEAKING_FIXTURE;
}

function loadFixture(name) {
  const file = path.join(FIXTURES_DIR, name);
  // Read + reserialize to a compact single-line JSON string. This is exactly
  // the "content" the assistant message should contain (aggregator parses it
  // as JSON), and reserializing strips fixture pretty-printing so chunking is
  // clean.
  const raw = fs.readFileSync(file, "utf8");
  return JSON.stringify(JSON.parse(raw));
}

function sseChunk(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

const ID = "chatcmpl-fake-e2e";
const MODEL = process.env.OPENAI_MODEL || "gpt-test";

function streamCompletion(res, content) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const base = (delta, finish) => ({
    id: ID,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: MODEL,
    choices: [{ index: 0, delta, finish_reason: finish }],
  });

  // 1) role chunk first (OpenAI emits the assistant role on the opening chunk).
  res.write(sseChunk(base({ role: "assistant" }, null)));

  // 2) content chunks.
  for (let i = 0; i < content.length; i += CHUNK_SIZE) {
    const piece = content.slice(i, i + CHUNK_SIZE);
    res.write(sseChunk(base({ content: piece }, null)));
  }

  // 3) final choice chunk with finish_reason "stop" and empty delta.
  res.write(sseChunk(base({}, "stop")));

  // 4) usage chunk (StreamOptions.IncludeUsage=true => SDK expects a trailing
  //    chunk carrying usage with an empty choices array).
  res.write(
    sseChunk({
      id: ID,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: MODEL,
      choices: [],
      usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
    })
  );

  // 5) terminator.
  res.write("data: [DONE]\n\n");
  res.end();
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/v1/chat/completions") {
    let chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch (_) {
        // tolerate; bodyText stays empty -> default fixture
      }
      const bodyText = JSON.stringify(body.messages || raw);
      const fixture = pickFixture(req.headers["x-fake-fixture"], bodyText);

      let content;
      try {
        content = loadFixture(fixture);
      } catch (err) {
        console.error(`[openai] failed to load fixture ${fixture}:`, err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: `fixture load: ${err.message}` } }));
        return;
      }

      console.log(
        `[openai] /v1/chat/completions stream=${body.stream} fixture=${fixture} content_bytes=${content.length}`
      );
      streamCompletion(res, content);
    });
    return;
  }

  if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "fake-openai" }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: { message: "not found" } }));
});

server.listen(PORT, () => {
  console.log(
    `[openai] fake OpenAI listening on :${PORT} (fixtures=${FIXTURES_DIR}, default=${DEFAULT_FIXTURE}, chunk=${CHUNK_SIZE})`
  );
});
