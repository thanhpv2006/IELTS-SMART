// DeviceCheck's mic-check recording doubles as the voice sample the fraud detector compares
// every Speaking answer against (GC9). A per-session random code keeps the sample tied to
// this sitting — a clip recorded once and replayed later reads the wrong numbers out loud.

const DIGIT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

export const VOICE_SAMPLE_CODE_LENGTH = 4;

export function randomVerificationCode(): string {
  return Array.from({ length: VOICE_SAMPLE_CODE_LENGTH }, () => Math.floor(Math.random() * 10)).join("");
}

export function spellCode(code: string): string {
  return code
    .split("")
    .map((d) => DIGIT_WORDS[Number(d)] ?? d)
    .join(" ");
}

export function voiceSampleSentence(code: string): string {
  return `I am ready for the speaking test. The code is ${spellCode(code)}.`;
}

export function settleVoiceSample(pending: Promise<string> | null, timeoutMs: number): Promise<string | null> {
  if (!pending) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    pending.then(
      (key) => {
        clearTimeout(timer);
        resolve(key);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}
