"use client";

import { useRef, useState } from "react";
import { Mic, Square, Check, RotateCcw, AudioLines } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// The skill accent uses design-system tokens (speaking → info), matching the Badge convention on other pages.
const SPEAKING_CHIP = "bg-info-50 text-info-700";

// ── Mic Test Screen (a gate before SkillRunner for speaking — the engine has no mic test) ────────
export function MicTest({ testName, count, onReady }: { testName: string; count: number; onReady: () => void }) {
  const mrRef = useRef<MediaRecorder | null>(null);
  const [phase, setPhase] = useState<"idle" | "recording" | "done">("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  const startTest = async () => {
    setMicError(null);
    setPreviewUrl(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        setPreviewUrl(URL.createObjectURL(blob));
        setPhase("done");
      };
      mrRef.current = mr;
      mr.start();
      setPhase("recording");
      setTimeout(() => { if (mr.state === "recording") mr.stop(); }, 5000);
    } catch {
      setMicError("Không thể truy cập microphone. Vui lòng kiểm tra quyền trình duyệt và thử lại.");
      setPhase("idle");
    }
  };

  const stopTest = () => { if (mrRef.current?.state === "recording") mrRef.current.stop(); };
  const retry = () => { setPreviewUrl(null); setPhase("idle"); };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-ink-100 px-6 py-4">
          <span className={cn("flex size-9 items-center justify-center rounded-lg", SPEAKING_CHIP)}>
            <AudioLines className="size-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-ink-900">{testName}</p>
            <p className="text-xs text-ink-400">{count} câu · Speaking</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
          <div className={cn(
            "mb-6 flex size-20 items-center justify-center rounded-full transition-all",
            phase === "recording" ? "animate-pulse bg-destructive" : phase === "done" ? "bg-success-700" : "bg-brand-100",
          )}>
            {phase === "done" ? <Check className="size-9 text-white" strokeWidth={2.5} /> : <Mic className={cn("size-9", phase === "recording" ? "text-white" : "text-brand-600")} />}
          </div>
          <h2 className="mb-1 text-lg font-bold text-ink-900">Kiểm tra microphone</h2>
          <p className="mb-6 max-w-sm text-sm text-ink-500">
            {phase === "idle" && "Nhấn nút bên dưới để ghi âm thử. Nói vài câu để xác nhận mic hoạt động."}
            {phase === "recording" && "Đang ghi âm... Nói vài câu rồi nhấn Dừng (tự dừng sau 5 giây)."}
            {phase === "done" && "Nghe lại bên dưới. Nếu nghe rõ giọng bạn, nhấn Bắt đầu làm bài."}
          </p>
          {phase === "idle" && <Button data-testid="start-mic-btn" size="lg" onClick={startTest}><Mic /> Bắt đầu kiểm tra mic</Button>}
          {phase === "recording" && <Button size="lg" variant="destructive" onClick={stopTest}><Square /> Dừng ghi âm</Button>}
          {phase === "done" && previewUrl && (
            <div className="w-full max-w-sm space-y-4">
              <audio controls src={previewUrl} className="w-full rounded-lg" />
              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={retry}><RotateCcw /> Ghi lại</Button>
                <Button data-testid="mic-good-btn" onClick={onReady}><Check /> Mic tốt, bắt đầu làm bài</Button>
              </div>
            </div>
          )}
          {micError && (
            <div data-testid="mic-error" className="mt-4 w-full max-w-sm rounded-lg bg-error-50 px-4 py-3 text-sm text-error-700">
              {micError}
              <div className="mt-2"><button data-testid="mic-retry-btn" onClick={startTest} className="font-medium underline underline-offset-2 hover:text-error-700">Thử lại</button></div>
            </div>
          )}
          <Button variant="link" size="sm" onClick={onReady} data-testid="skip-mic-btn" className="mt-6 text-ink-400 hover:text-ink-600">Bỏ qua kiểm tra</Button>
        </div>
      </div>
    </div>
  );
}
