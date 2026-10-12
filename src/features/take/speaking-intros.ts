import type { SpeakingIntros } from "@novaforge-team/ielts-exam-engine";

// Examiner assets served from public/. The lead-in clip for each Speaking part plays before that
// part's first question; Part 2 additionally flips its cue card open 16s into the clip (the moment
// the examiner hands the card over) and plays a second clip after the preparation minute, right
// before the mic opens. The engine only uses these in exam mode.
export const SPEAKING_INTROS: SpeakingIntros = {
  1: { url: "/audio/speaking/dan-part1.mp3" },
  2: {
    url: "/audio/speaking/dan-part2-intro.mp3",
    revealCueAtSeconds: 16,
    answerCueUrl: "/audio/speaking/dan-part2-start.mp3",
  },
  3: { url: "/audio/speaking/dan-part3.mp3" },
};

export const EXAMINER_IMAGE_URL = "/examiner/dan.jpg";
