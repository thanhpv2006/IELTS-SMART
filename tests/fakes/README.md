# Fake upstreams for the E2E spike

Two zero-dependency Node servers (built-in `http`/`crypto`/`fs` only) that stand
in for the external upstreams during the `ielts-smart-web` E2E spike. Everything
else in the stack is real. Constants come from
[`../E2E-CONTRACT.md`](../E2E-CONTRACT.md) — do not diverge.

```
tests/fakes/
  ssproxy/server.js     fake SpeechSuper router  (port 5555)
  ssproxy/Dockerfile
  openai/server.js      fake OpenAI chat API     (port 6000)
  openai/Dockerfile
  fixtures/             canned LLM JSON outputs  (DO NOT edit)
  README.md
```

Both Dockerfiles assume the **compose build context is `tests/fakes/`** (per the
contract), so `COPY` paths are relative to this directory, not the subfolder.

---

## fake-ssproxy

Replaces the external ss-proxy router. Flow:

1. `POST /v1/score` → logs, returns **202 Accepted**.
2. After `CALLBACK_DELAY_MS` (~200ms), `POST` to the **`webhook_url` taken from
   the request body** (never hardcoded) with a signed result payload.

Each `/v1/score` call fires exactly one callback that echoes that call's own
`idempotency_key`, so N parallel items → N callbacks.

### Endpoints

| Method | Path         | Behaviour                          |
|--------|--------------|------------------------------------|
| POST   | `/v1/score`  | log + 202; schedules one callback  |
| GET    | `/health`,`/`| `{ ok: true }`                     |

### Env

| Var                      | Default               | Notes                                  |
|--------------------------|-----------------------|----------------------------------------|
| `PORT`                   | `5555`                | listen port                            |
| `SSPROXY_WEBHOOK_SECRET` | `test-webhook-secret` | **must match** backend env to sign OK  |
| `CALLBACK_DELAY_MS`      | `200`                 | delay before firing the callback       |

### Run locally

```bash
cd tests/fakes
SSPROXY_WEBHOOK_SECRET=test-webhook-secret node ssproxy/server.js
# in another shell:
curl -X POST localhost:5555/v1/score \
  -H 'Content-Type: application/json' -H 'X-Router-Token: test-router-token' \
  -d '{"idempotency_key":"job:0","webhook_url":"http://localhost:8082/ss-proxy/webhook","item":{"part":1}}'
```

### Webhook payload it sends

Header: `X-SS-Signature: <hex(HMAC_SHA256(rawBody, SSPROXY_WEBHOOK_SECRET))>`

```json
{
  "idempotency_key": "<echoed from request>",
  "status": "succeeded",
  "result": { "overall": 6.5, "fluency_coherence": 6.5, "lexical_resource": 6.5,
              "grammar": 6.0, "pronunciation": 7.0, "relevance": 90, "speed": 120,
              "numeric_duration": 12.5, "effective_speech_length": 11.0,
              "transcription": "...", "fluency_stats": {"pause_cnt": 2},
              "pause_filler": {"um":1,"uh":1}, "sentences": [ ... ] }
}
```

---

## fake-openai

Replaces `api.openai.com` for the LLM aggregator. Serves a canned fixture JSON
as a streamed chat completion.

### Endpoints

| Method | Path                    | Behaviour                                  |
|--------|-------------------------|--------------------------------------------|
| POST   | `/v1/chat/completions`  | `text/event-stream` of the fixture JSON    |
| GET    | `/health`,`/`           | `{ ok: true }`                             |

### Fixture selection (priority)

1. Header `X-Fake-Fixture: <name>` (`.json` optional) — explicit override, used
   to pick Pass vs review branch in tests.
2. Request body: any message text mentioning **writing** →
   `writing_exam_high.json`; mentioning **speaking** → `speaking_exam_high_pass.json`.
3. `DEFAULT_FIXTURE` env (defaults to `speaking_exam_high_pass.json`).

### Env

| Var               | Default                        | Notes                                   |
|-------------------|--------------------------------|-----------------------------------------|
| `PORT`            | `6000`                         | listen port                             |
| `FIXTURES_DIR`    | `../fixtures` (`/app/fixtures` in image) | where the JSONs live          |
| `DEFAULT_FIXTURE` | `speaking_exam_high_pass.json` | fallback fixture                        |
| `CHUNK_SIZE`      | `48`                           | bytes of content per SSE chunk          |

### Run locally

```bash
cd tests/fakes
node openai/server.js
curl -N -X POST localhost:6000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"stream":true,"messages":[{"role":"user","content":"score this speaking answer"}]}'
```

### SSE wire format emitted

```
data: {"id":"chatcmpl-fake-e2e","object":"chat.completion.chunk","model":"...","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}
data: {... "choices":[{"index":0,"delta":{"content":"<piece>"},"finish_reason":null}]}
...
data: {... "choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}
data: {... "choices":[],"usage":{"prompt_tokens":100,"completion_tokens":200,"total_tokens":300}}
data: [DONE]
```

---

## Docker

```bash
cd tests/fakes
docker build -f ssproxy/Dockerfile -t fake-ssproxy .
docker build -f openai/Dockerfile  -t fake-openai .
```

`fake-openai` bakes `fixtures/` into the image at `/app/fixtures`; compose can
also mount `tests/fakes/fixtures` over it. `fake-ssproxy` needs no fixtures (its
result block is inline).

---

## Confirmed against backend code (file:line)

**HMAC header & algorithm** — `internal/scoring/port/webhook/handler.go:55,97-102`:
- Header name is **`X-SS-Signature`** (`r.Header.Get("X-SS-Signature")`).
- `validSignature`: `hmac.New(sha256.New, []byte(secret))` over the **raw request
  body**, compared as **lowercase hex** (`hex.EncodeToString`). The fake's
  `crypto.createHmac("sha256", SECRET).update(rawBody).digest("hex")` matches
  exactly (verified end-to-end: `sig_ok=true`).

**Webhook body shape** — `internal/scoring/port/webhook/handler.go:42-47`
(`payload`): `{ idempotency_key, status, result, error }`. `status:"succeeded"`
requires a non-empty `result` (line 73-76). The fake omits `error` on success.

**`idempotency_key`** — `client.go:36` sends it; the handler parses it via
`app.ParseIngestKey` (`handler.go:65`). The fake treats it as **opaque** and just
echoes it — no need to understand the `jobID:sequence` encoding
(`app/score_item.go:516` `BuildIngestKey`).

**`/v1/score` request body** — `internal/scoring/infra/ssproxy/client.go:34-50`
(`scoreRequest`/`scoreItem`): `{ idempotency_key, partner_id, type, webhook_url,
item:{ question_id, part, question_prompt, audio_url, task_type, user_id } }`.
Header `X-Router-Token` (`client.go:76`). Accepted status is **202 or 200**
(`client.go:86`). The fake reads `webhook_url` + `idempotency_key` from this body.

**`resultSummary` fields** — `internal/scoring/infra/speechsuper/client.go:269-285`:
`overall`, `fluency_coherence`, `lexical_resource`, `grammar`, `pronunciation`
(floats); `relevance`, `speed` (ints); `numeric_duration`,
`effective_speech_length` (floats); `transcription` (string);
`fluency_stats.pause_cnt`; `pause_filler` (`map[string]int`); `sentences[]` with
`details[]{ word, pronunciation, start, end, level }` (`client.go:290-301`). The
fake's inline result reproduces all of these; `parseResult`
(`client.go:337-374`) decodes it without error.

**SSE chunk format** — `internal/scoring/infra/openai/common.go:99-113`
(`streamChatCompletion`): uses the openai-go SDK
`client.Chat.Completions.NewStreaming` and feeds chunks into
`ChatCompletionAccumulator.AddChunk`, then reads `acc.Choices[0].Message.Content`
(`common.go:138`). So the wire must be standard OpenAI
`chat.completion.chunk` objects with `choices[].delta.content` accumulating into
the final string. `StreamOptions{IncludeUsage:true}` is set (`common.go:93`) — the
fake emits the trailing usage-only chunk the SDK expects. `finish_reason:"stop"`
on the closing choice chunk and a `data: [DONE]` terminator complete the stream.
Verified: SDK-style reassembly yields `role=assistant`, `finish=stop`, valid JSON
content.

---

## Decisions & contract notes

- **No npm / no `package.json`.** Pure Node built-ins, so `node:20-alpine`
  images need no install step.
- **ss-proxy result is inline, not a fixture.** The contract only pins the
  fixtures for the OpenAI side; the SpeechSuper result block is small and fixed,
  so it lives in `ssproxy/server.js` (`buildResultSummary`) with `overall: 6.5`.
- **`X-Router-Token` is logged but not enforced** by the fake — validating the
  outbound token is the backend's concern; the stub only needs to honour the 202
  contract. Tighten later if a negative-auth test needs it.
- **Fixture override knob** is `X-Fake-Fixture` (header). Chosen over env so a
  single running container can serve both Pass and review branches across tests
  without a restart.
- **Contract deviations found: none.** All constants
  (`X-SS-Signature`, `SSPROXY_WEBHOOK_SECRET`, ports 5555/6000, `/v1/score`,
  `/v1/chat/completions`, fixture filenames) in `E2E-CONTRACT.md` match the
  backend code as written. One clarification worth flagging to whoever wires
  compose: the contract's note that `result` shape is at
  `speechsuper/client.go` "~dòng 260-280" is actually **lines 269-285** — same
  struct, slightly shifted; no semantic difference.
