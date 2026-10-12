import { describe, it, expect, vi, afterEach } from "vitest";

import { obscure, reveal } from "@/features/take/exam-media-guard";

// jsdom does not implement HTMLMediaElement play()/pause(), so back a fake <audio> with spies and
// a controllable `paused` flag. Appended to document.body so querySelectorAll("audio, video")
// finds it (the guard queries the live DOM).
function fakeAudio(initiallyPlaying: boolean) {
  const el = document.createElement("audio");
  let paused = !initiallyPlaying;
  Object.defineProperty(el, "paused", { get: () => paused, configurable: true });
  el.pause = vi.fn(() => {
    paused = true;
  });
  el.play = vi.fn(() => {
    paused = false;
    return Promise.resolve();
  });
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = "";
  // Drain any leftover source so tests stay isolated.
  reveal("fullscreen");
  reveal("tab");
});

describe("exam-media-guard refcount", () => {
  it("pauses only currently-playing media on first obscure, resumes on last reveal", () => {
    const playing = fakeAudio(true);
    const already = fakeAudio(false);

    obscure("fullscreen");
    expect(playing.pause).toHaveBeenCalledTimes(1);
    expect(already.pause).not.toHaveBeenCalled(); // was already paused → left alone

    reveal("fullscreen");
    expect(playing.play).toHaveBeenCalledTimes(1);
    expect(already.play).not.toHaveBeenCalled(); // never resume something we didn't pause
  });

  it("resumes only after the LAST source reveals (refcount)", () => {
    const el = fakeAudio(true);

    obscure("fullscreen");
    obscure("tab");
    expect(el.pause).toHaveBeenCalledTimes(1); // second obscure does not re-pause

    reveal("fullscreen");
    expect(el.play).not.toHaveBeenCalled(); // tab still obscuring → stay paused

    reveal("tab");
    expect(el.play).toHaveBeenCalledTimes(1); // last source gone → resume
  });

  it("does not resume media removed from the DOM while obscured", () => {
    const el = fakeAudio(true);

    obscure("tab");
    expect(el.pause).toHaveBeenCalledTimes(1);
    el.remove(); // torn out (e.g. runner unmounted on terminate)

    reveal("tab");
    expect(el.play).not.toHaveBeenCalled();
  });
});
