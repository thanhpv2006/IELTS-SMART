"use client";

// Self-attested speaker + mic check shown once before a FRESH mock full-test attempt (design
// item 7, D6 — replaces the Speaking-only MicTest since Speaking is now the first skill).
// Both checks are self-attested: a permission/API failure never traps a student behind a flaky
// mic (anti-trap) — Continue only requires the speaker confirmation plus either a successful
// mic playback OR a mic error.

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, Mic, Square, Play, Check, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { randomVerificationCode, voiceSampleSentence } from "./voice-sample";

type MicState = "idle" | "recording" | "recorded" | "error";

export function DeviceCheck({ onContinue }: { onContinue: (voiceSample: Blob | null) => void }) {
  const [code] = useState(randomVerificationCode);
  const [speakerPlaying, setSpeakerPlaying] = useState(false);
  const [speakerAttempted, setSpeakerAttempted] = useState(false);
  const [speakerConfirmed, setSpeakerConfirmed] = useState(false);

  const [micState, setMicState] = useState<MicState>("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [micPlaying, setMicPlaying] = useState(false);
  const [micPlayedBack, setMicPlayedBack] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const playbackRef = useRef<HTMLAudioElement | null>(null);
  const recordedUrlRef = useRef<string | null>(null);
  const recordedBlobRef = useRef<Blob | null>(null);
  const sampleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    recordedUrlRef.current = recordedUrl;
  }, [recordedUrl]);

  // Best-effort teardown on unmount — never throws even if nothing was ever created.
  useEffect(() => {
    return () => {
      if (sampleTimerRef.current !== null) window.clearTimeout(sampleTimerRef.current);
      audioCtxRef.current?.close().catch(() => {});
      // Detach onstop BEFORE stopping tracks: stopping tracks fires MediaRecorder.onstop, which
      // would otherwise setState + createObjectURL on an unmounted component (leaking the URL).
      if (recorderRef.current) recorderRef.current.onstop = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
    };
  }, []);

  // Speaker check: play a short 440Hz tone. If Web Audio is unavailable or playback throws, the
  // click itself still counts as an attempt so the confirm step never traps the student.
  const playSample = useCallback(() => {
    setSpeakerAttempted(true);
    setSpeakerPlaying(true);
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error("no AudioContext");
      const ctx = new Ctor();
      audioCtxRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 440;
      gain.gain.value = 0.06;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      sampleTimerRef.current = window.setTimeout(() => {
        osc.stop();
        ctx.close().catch(() => {});
        setSpeakerPlaying(false);
      }, 900);
    } catch {
      sampleTimerRef.current = window.setTimeout(() => setSpeakerPlaying(false), 900);
    }
  }, []);

  // Mic check: record a short clip and allow playback. A permission/API failure still marks the
  // step as "attempted" (micState "error") so Continue unlocks without a working mic.
  const toggleRecord = useCallback(async () => {
    if (micState === "recording") {
      recorderRef.current?.stop();
      return;
    }
    setMicError(null);
    setMicPlayedBack(false);
    recordedBlobRef.current = null;
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const chunks: BlobPart[] = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
        recordedBlobRef.current = blob;
        setRecordedUrl(URL.createObjectURL(blob));
        setMicState("recorded");
      };
      mr.start();
      recorderRef.current = mr;
      setMicState("recording");
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setMicError("Không thể truy cập microphone. Bạn vẫn có thể tiếp tục vào bài thi.");
      setMicState("error");
    }
  }, [micState, recordedUrl]);

  const playRecording = useCallback(() => {
    if (!recordedUrl || !playbackRef.current) return;
    playbackRef.current.currentTime = 0;
    setMicPlaying(true);
    playbackRef.current.play().catch(() => {
      // Playback blocked/failed still counts as an attempt — anti-trap, same spirit as playSample.
      setMicPlaying(false);
      setMicPlayedBack(true);
    });
  }, [recordedUrl]);

  const micReady = micPlayedBack || micState === "error";
  const ready = speakerConfirmed && micReady;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-ink-200 bg-white shadow-sm">
        <div className="border-b border-ink-100 px-6 py-5">
          <h1 className="text-lg font-bold text-ink-900">Kiểm tra thiết bị</h1>
          <p className="mt-1 text-sm text-ink-500">
            Vui lòng kiểm tra loa và microphone trước khi bắt đầu bài thi thử.
          </p>
        </div>

        <div className="divide-y divide-ink-100">
          {/* Step 1 — speaker */}
          <div className="flex gap-4 px-6 py-5">
            <StepGlyph done={speakerConfirmed} n={1} />
            <div className="flex-1">
              <h2 className="text-sm font-bold text-ink-900">Kiểm tra loa</h2>
              <p className="mt-1 text-sm text-ink-500">Phát âm thanh mẫu và xác nhận bạn nghe rõ.</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" onClick={playSample}>
                  <Volume2 />
                  {speakerPlaying ? "Đang phát…" : "Phát âm thanh mẫu"}
                </Button>
                <Button
                  type="button"
                  variant={speakerConfirmed ? "soft" : "default"}
                  disabled={!speakerAttempted}
                  onClick={() => setSpeakerConfirmed(true)}
                >
                  {speakerConfirmed && <Check />}
                  {speakerConfirmed ? "Đã xác nhận" : "Xác nhận đã nghe rõ"}
                </Button>
              </div>
            </div>
          </div>

          {/* Step 2 — microphone */}
          <div className={cn("flex gap-4 px-6 py-5", !speakerConfirmed && "opacity-50")}>
            <StepGlyph done={micReady} n={2} />
            <div className="flex-1">
              <h2 className="text-sm font-bold text-ink-900">Kiểm tra microphone</h2>
              <p className="mt-1 text-sm text-ink-500">
                Ghi âm thử rồi phát lại để xác nhận microphone hoạt động.
              </p>
              <div className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-700">
                Hãy đọc to câu sau: <strong>“{voiceSampleSentence(code)}”</strong>
              </div>
              <p className="mt-1 text-xs text-ink-500">
                Bản ghi này được dùng làm mẫu giọng để đối chiếu với phần Speaking.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant={micState === "recording" ? "destructive" : "outline"}
                  disabled={!speakerConfirmed}
                  onClick={toggleRecord}
                >
                  {micState === "recording" ? <Square /> : <Mic />}
                  {micState === "recording" ? "Dừng ghi âm" : "Ghi âm thử"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!recordedUrl || micPlaying}
                  onClick={playRecording}
                >
                  <Play />
                  Nghe lại
                </Button>
              </div>
              {recordedUrl && (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <audio
                  ref={playbackRef}
                  src={recordedUrl}
                  onEnded={() => {
                    setMicPlaying(false);
                    setMicPlayedBack(true);
                  }}
                  className="hidden"
                />
              )}
              {micError && (
                <p className="mt-3 flex items-center gap-2 text-sm text-error-700">
                  <TriangleAlert className="size-4 shrink-0" />
                  {micError}
                </p>
              )}
              {micPlayedBack && (
                <p className="mt-3 flex items-center gap-2 text-sm text-success-700">
                  <Check className="size-4 shrink-0" />
                  Đã nghe lại bản ghi âm.
                </p>
              )}
            </div>
          </div>

          {/* Step 3 — ready */}
          <div className="flex gap-4 px-6 py-5">
            <StepGlyph done={ready} n={3} />
            <div className="flex-1">
              <h2 className="text-sm font-bold text-ink-900">Sẵn sàng</h2>
              <p className="mt-1 text-sm text-ink-500">
                {ready
                  ? "Thiết bị của bạn đã sẵn sàng. Nhấn Tiếp tục để vào phần giới thiệu bài thi."
                  : "Hoàn tất bước kiểm tra loa và microphone ở trên để tiếp tục."}
              </p>
              <Button
                type="button"
                size="lg"
                className="mt-4"
                disabled={!ready}
                onClick={() => onContinue(recordedBlobRef.current)}
              >
                Tiếp tục
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepGlyph({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
        done ? "bg-success-700 text-white" : "bg-ink-100 text-ink-500",
      )}
    >
      {done ? <Check className="size-4" /> : n}
    </span>
  );
}
