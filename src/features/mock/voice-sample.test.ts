import { describe, it, expect } from "vitest";
import { randomVerificationCode, spellCode, voiceSampleSentence, settleVoiceSample } from "./voice-sample";

describe("spellCode", () => {
  it("converts digits to English words", () => {
    expect(spellCode("7492")).toBe("seven four nine two");
  });
});

describe("voiceSampleSentence", () => {
  it("ends with the spelled-out code", () => {
    expect(voiceSampleSentence("0105")).toBe(
      "I am ready for the speaking test. The code is zero one zero five.",
    );
  });
});

describe("randomVerificationCode", () => {
  it("always returns 4 digits", () => {
    for (let i = 0; i < 50; i++) {
      expect(randomVerificationCode()).toMatch(/^\d{4}$/);
    }
  });
});

describe("settleVoiceSample", () => {
  it("resolves the key for a resolved promise", async () => {
    await expect(settleVoiceSample(Promise.resolve("key"), 20)).resolves.toBe("key");
  });

  it("resolves null for a rejected promise", async () => {
    await expect(settleVoiceSample(Promise.reject(new Error("fail")), 20)).resolves.toBeNull();
  });

  it("resolves null when pending is null", async () => {
    await expect(settleVoiceSample(null, 20)).resolves.toBeNull();
  });

  it("resolves null when a never-resolving promise hits the timeout", async () => {
    const neverResolve = new Promise<string>(() => {});
    await expect(settleVoiceSample(neverResolve, 20)).resolves.toBeNull();
  });
});
