/**
 * E2E spec: per-partner ASR engine (ss | el), through the admin + partner APIs — no browser.
 *
 * The switch lives in ielts-smart-admin, which has no Playwright setup, and the grading it
 * redirects is partner-billable, so the rules are asserted here — same reasoning as
 * seat-contract-api.spec.ts.
 *
 * Nothing external is called. ELEVENLABS_API_KEY is unset in docker-compose.e2e.yml, so the
 * worker builds elevenlabs.StubClient and returns a canned transcription; fake-openai answers
 * the aggregate with speaking_exam_high_scribe.json, selected off the `scribe_v2_compact_1`
 * marker the compact payload carries.
 *
 * That fixture is deliberately wrong in every field the backend owns — overall_band 9.0,
 * stability 0, threshold 8.5, a fabricated question and answer on the annotation — so a green
 * run proves the validate layer rewrote them rather than that the model happened to agree.
 *
 * Seed requirements: partner "E2E Center" and admin@e2e.local with role=admin.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import { adminAccessToken, findPartnerIdByName } from "./seat";
import { apiBase } from "../setup/auth";

const PARTNER_NAME = "E2E Center";

/** The partner API is mounted at /partner/v1, outside the /api/v1 subtree. */
function partnerApiBase(): string {
  return apiBase().replace(/\/api\/v1$/, "");
}

function authed(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function setEngine(
  request: APIRequestContext,
  token: string,
  partnerId: string,
  engine: string,
) {
  return request.patch(`${apiBase()}/admin/partners/${partnerId}`, {
    headers: authed(token),
    data: { asr_engine: engine },
  });
}

async function readEngine(
  request: APIRequestContext,
  token: string,
  partnerId: string,
): Promise<string> {
  const res = await request.get(`${apiBase()}/admin/partners/${partnerId}`, {
    headers: authed(token),
  });
  expect(res.ok(), `GET partner: ${res.status()}`).toBeTruthy();
  return ((await res.json()) as { asr_engine: string }).asr_engine;
}

/**
 * Where the WORKER reaches MinIO. The presign endpoint hands back a STORAGE_PUBLIC_URL
 * (localhost:9110) built for the browser; inside the worker container "localhost" is that
 * container's own loopback, so the fetch is refused. STORAGE_ENDPOINT is the in-network
 * address, and it is on the worker's SSRF allowlist for the same reason.
 */
const WORKER_MINIO_BASE = process.env.E2E_WORKER_MINIO_BASE ?? "http://minio:9000/ielts88";

/**
 * Uploads a scrap of audio and returns a URL the worker can fetch. The bytes are never
 * decoded: the partner API only requires an http(s) URL, and StubClient ignores the body it is
 * handed. The bucket is anonymous-download in this stack, so an unsigned GET is enough.
 */
async function uploadScrapAudio(request: APIRequestContext, token: string): Promise<string> {
  const presign = await request.post(`${apiBase()}/media/presign-upload`, {
    headers: authed(token),
    data: {
      media_type: "audio",
      content_type: "audio/webm",
      filename: "asr-engine-e2e",
    },
  });
  expect(presign.ok(), `presign-upload: ${presign.status()} ${await presign.text()}`).toBeTruthy();
  const { upload_url, key } = (await presign.json()) as {
    upload_url: string;
    key: string;
  };

  const put = await request.fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": "audio/webm" },
    data: Buffer.alloc(2048, 7),
  });
  expect(put.ok(), `upload audio: ${put.status()}`).toBeTruthy();

  return `${WORKER_MINIO_BASE}/${key}`;
}

type SpeakingJob = {
  id: string;
  status: string;
  result?: Record<string, unknown>;
};

async function submitSpeakingJob(
  request: APIRequestContext,
  apiKey: string,
  scoringType: string,
  audioURL: string,
): Promise<string> {
  const res = await request.post(`${partnerApiBase()}/partner/v1/speaking-jobs`, {
    headers: { "X-API-Key": apiKey, "Idempotency-Key": `asr-e2e-${Date.now()}-${Math.random()}` },
    data: {
      scoring_type: scoringType,
      items: [{ part: 1, question: "Do you enjoy reading?", audio_url: audioURL }],
    },
  });
  expect(res.status(), `submit ${scoringType}: ${await res.text()}`).toBe(201);
  return ((await res.json()) as SpeakingJob).id;
}

async function waitForResult(
  request: APIRequestContext,
  apiKey: string,
  jobId: string,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 60_000;
  let last = "";
  while (Date.now() < deadline) {
    const res = await request.get(`${partnerApiBase()}/partner/v1/speaking-jobs/${jobId}`, {
      headers: { "X-API-Key": apiKey },
    });
    expect(res.ok(), `poll job: ${res.status()}`).toBeTruthy();
    const job = (await res.json()) as SpeakingJob;
    last = job.status;
    if (job.status === "completed" && job.result) return job.result;
    if (job.status === "failed") throw new Error(`job ${jobId} failed`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`job ${jobId} did not complete within 60s (last status: ${last})`);
}

/** The Scribe branch is the only one that pins stability and the 7.0 gate. */
function scribeConfidence(result: Record<string, unknown>) {
  return result.confidence as {
    raw_score: number;
    threshold: number;
    stability: { score: number };
    speaking_evidence: { score: number };
    outlier_subscore: { score: number };
    recommendation: { gate_status: string; message: string };
  };
}

test.describe.serial("per-partner ASR engine", () => {
  let token = "";
  let partnerId = "";
  let apiKey = "";
  let audioURL = "";

  test.beforeAll(async ({ request }) => {
    token = await adminAccessToken(request);
    partnerId = await findPartnerIdByName(request, token, PARTNER_NAME);

    // Fund the pool rather than trusting the seeded balance: the charge is resolved from
    // billing.price_rules, so what one attempt costs is not this spec's business.
    const pack = await request.post(`${apiBase()}/admin/partners/${partnerId}/credit-packs`, {
      headers: authed(token),
      data: { plan_code: "asr_e2e", credits: 100_000, note: "asr-engine e2e" },
    });
    expect(pack.ok(), `credit pack: ${pack.status()} ${await pack.text()}`).toBeTruthy();

    const key = await request.post(`${apiBase()}/admin/partners/${partnerId}/api-keys`, {
      headers: authed(token),
    });
    expect(key.ok(), `issue api key: ${key.status()}`).toBeTruthy();
    apiKey = ((await key.json()) as { token: string }).token;

    audioURL = await uploadScrapAudio(request, token);
    await setEngine(request, token, partnerId, "ss");
  });

  test.afterAll(async ({ request }) => {
    if (partnerId && token) await setEngine(request, token, partnerId, "ss");
  });

  test("a partner defaults to SpeechSuper", async ({ request }) => {
    expect(await readEngine(request, token, partnerId)).toBe("ss");
  });

  test("an unknown engine is refused and changes nothing", async ({ request }) => {
    const res = await setEngine(request, token, partnerId, "whisper");
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe("invalid_asr_engine");
    expect(await readEngine(request, token, partnerId)).toBe("ss");
  });

  test("an update that omits the engine leaves it alone", async ({ request }) => {
    expect((await setEngine(request, token, partnerId, "el")).ok()).toBeTruthy();

    const res = await request.patch(`${apiBase()}/admin/partners/${partnerId}`, {
      headers: authed(token),
      data: { name: PARTNER_NAME },
    });
    expect(res.ok(), `rename: ${res.status()}`).toBeTruthy();

    expect(await readEngine(request, token, partnerId)).toBe("el");
  });

  test("exam_high on an ElevenLabs partner is graded from the Scribe payload", async ({
    request,
  }) => {
    test.setTimeout(120_000);
    expect((await setEngine(request, token, partnerId, "el")).ok()).toBeTruthy();

    const jobId = await submitSpeakingJob(request, apiKey, "exam_high", audioURL);
    const result = await waitForResult(request, apiKey, jobId);

    // Schema is unchanged from the SpeechSuper branch — that is the whole point of V7.
    expect(Object.keys(result).sort()).toEqual([
      "_transcripts",
      "confidence",
      "criteria",
      "errors",
      "overall_band",
      "overall_feedback",
    ]);

    // floor-half over the four criteria (5+6+5+5 = 21 -> 5.0), overriding the fixture's 9.0.
    expect(result.overall_band).toBe(5);

    const c = scribeConfidence(result);
    expect(c.stability.score).toBe(5);
    expect(c.threshold).toBe(7);
    expect(c.raw_score).toBeCloseTo(
      0.5 * c.speaking_evidence.score + 0.3 * 5 + 0.2 * c.outlier_subscore.score,
      5,
    );
    expect(c.recommendation.gate_status).toBe("Pass");
    expect(c.recommendation.message).toContain("Gate Pass");

    // The annotation is re-quoted from the payload, so the fabricated question and answer in
    // the fixture must not survive.
    const annotation = (result.errors as Array<Record<string, string>>)[0];
    expect(annotation.question).toBe("Do you enjoy reading?");
    expect(annotation.original_answer).not.toContain("BIA DAT");
    expect(annotation.original_answer).toContain("reading books");
    expect(annotation.part_label).toBe("Part 1");

    // ElevenLabs returns no pronunciation scores, so per-word data is absent — but the
    // derived speech metrics still land.
    const transcripts = result._transcripts as Array<Record<string, unknown>>;
    expect(transcripts).toHaveLength(1);
    expect(transcripts[0].words).toBeUndefined();
    expect((transcripts[0].metrics as { speed_wpm: number }).speed_wpm).toBeGreaterThan(0);
  });

  test("the engine is frozen at submit, so a switch only reaches later jobs", async ({
    request,
  }) => {
    test.setTimeout(180_000);
    expect((await setEngine(request, token, partnerId, "el")).ok()).toBeTruthy();
    const elJob = await submitSpeakingJob(request, apiKey, "exam_high", audioURL);

    // Switch back while that job is in flight; it must keep the engine it was submitted with.
    expect((await setEngine(request, token, partnerId, "ss")).ok()).toBeTruthy();
    const ssJob = await submitSpeakingJob(request, apiKey, "exam_high", audioURL);

    const elResult = await waitForResult(request, apiKey, elJob);
    expect(scribeConfidence(elResult).threshold).toBe(7);
    expect(scribeConfidence(elResult).stability.score).toBe(5);

    // The SpeechSuper branch is untouched: its answer keeps the older schema, which the
    // Scribe validate layer would have rewritten.
    const ssResult = await waitForResult(request, apiKey, ssJob);
    expect(ssResult).toHaveProperty("schema_version");
    expect((ssResult.confidence as { threshold: number }).threshold).toBe(8.5);
  });

  test("a scoring type with no Scribe prompt falls back to SpeechSuper", async ({ request }) => {
    test.setTimeout(120_000);
    expect((await setEngine(request, token, partnerId, "el")).ok()).toBeTruthy();

    const jobId = await submitSpeakingJob(request, apiKey, "exam_mid", audioURL);
    const result = await waitForResult(request, apiKey, jobId);

    expect(result).toHaveProperty("schema_version");
    expect((result.confidence as { threshold: number }).threshold).toBe(8.5);
  });
});
