import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { fraudVerdict, fraudWarnings, type FraudTone, type SpeakingFraudBlock } from "./speaking-fraud";

const TONE_CARD: Record<FraudTone, string> = {
  positive: "border-success-200 bg-success-50",
  warning: "border-amber-200 bg-amber-50",
  danger: "border-error-200 bg-error-50",
  neutral: "border-ink-200 bg-white",
};

const TONE_TEXT: Record<FraudTone, string> = {
  positive: "text-success-700",
  warning: "text-amber-700",
  danger: "text-error-700",
  neutral: "text-ink-700",
};

export function SpeakingFraudPanel({ fraud }: { fraud?: SpeakingFraudBlock }) {
  if (!fraud) return null;

  const { title, tone } = fraudVerdict(fraud);
  const Icon = tone === "positive" ? ShieldCheck : tone === "neutral" ? ShieldQuestion : ShieldAlert;

  return (
    <div
      data-testid="speaking-fraud-panel"
      className={cn("mb-5 rounded-xl border p-4", TONE_CARD[tone])}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("size-4.5 shrink-0", TONE_TEXT[tone])} />
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Phát hiện gian lận</p>
          <h2 className={cn("text-sm font-bold", TONE_TEXT[tone])}>{title}</h2>
        </div>
      </div>

      <div className="mt-2.5">
        <FraudBody fraud={fraud} />
      </div>
    </div>
  );
}

function FraudBody({ fraud }: { fraud: SpeakingFraudBlock }): ReactNode {
  if (fraud.status === "pending") {
    return (
      <p className="text-sm text-ink-600">
        Hệ thống đang phân tích audio Speaking. Kết quả sẽ hiện ở đây khi có, điểm không bị ảnh hưởng.
      </p>
    );
  }

  if (fraud.status === "unavailable") {
    return (
      <p className="text-sm text-ink-600">
        Dịch vụ phân tích chưa trả lời trong thời gian chờ. Bài chấm không bị ảnh hưởng.
      </p>
    );
  }

  if (fraud.status !== "completed") {
    return <p className="text-sm text-ink-600">Dịch vụ phân tích gặp sự cố với bài này. Bài chấm không bị ảnh hưởng.</p>;
  }

  const speakers = fraud.detail?.cross_segment?.num_distinct_speakers;
  const consistent = fraud.detail?.cross_segment?.consistent;
  const warnings = fraudWarnings(fraud);

  return (
    <>
      {(typeof speakers === "number" || typeof consistent === "boolean") && (
        <dl className="mb-2 grid gap-2 sm:grid-cols-2">
          {typeof speakers === "number" && <Fact label="Số giọng nói phát hiện được" value={String(speakers)} />}
          {typeof consistent === "boolean" && (
            <Fact label="Giọng nói nhất quán giữa các câu" value={consistent ? "Có" : "Không"} />
          )}
        </dl>
      )}

      {warnings.length > 0 ? (
        <ul className="space-y-1.5">
          {warnings.map((warning) => (
            <li key={warning} className="flex gap-2 text-sm text-ink-700">
              <span aria-hidden className="text-ink-400">
                •
              </span>
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-600">Không có cảnh báo nào.</p>
      )}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/60 px-3 py-2">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="text-sm font-medium text-ink-800 tabular-nums">{value}</dd>
    </div>
  );
}
