// Speaking fraud verdict. Shape mirrors ielts88-speaking-demo/src/lib/partner-api-types.ts
// (PartnerFraudBlock), which in turn mirrors ielts-smart-backend's fraud_sink.go.
// `detail` is the vendor's verbatim JSON, so every field below is optional.

export interface SpeakingFraudSegment {
  question_id?: string;
  is_multi_speaker?: boolean;
  num_speakers?: number;
  is_outlier?: boolean;
  data_quality?: string;
  flags?: string[];
}

export interface SpeakingFraudDetail {
  cross_segment?: {
    num_distinct_speakers?: number;
    consistent?: boolean;
  };
  segments?: SpeakingFraudSegment[];
}

export interface SpeakingFraudBlock {
  /** Widened to string on purpose: a new backend status must not break the FE build. */
  status: "pending" | "completed" | "failed" | "unavailable" | string;
  overall_risk?: string;
  requires_human_review?: boolean;
  flags?: string[];
  detail?: SpeakingFraudDetail;
}

export type FraudTone = "positive" | "warning" | "danger" | "neutral";

export function fraudVerdict(block: SpeakingFraudBlock): { title: string; tone: FraudTone } {
  if (block.status === "pending") {
    return { title: "Đang kiểm tra giọng nói", tone: "neutral" };
  }
  if (block.status === "unavailable") {
    return { title: "Chưa có kết quả kiểm tra", tone: "neutral" };
  }
  if (block.status !== "completed") {
    return { title: "Không kiểm tra được bài này", tone: "neutral" };
  }

  if (block.requires_human_review === true) {
    return { title: "Cần người kiểm tra lại", tone: "warning" };
  }
  if (block.overall_risk === "high") {
    return { title: "Phát hiện dấu hiệu bất thường", tone: "danger" };
  }
  if (block.overall_risk === "medium") {
    return { title: "Có dấu hiệu cần lưu ý", tone: "warning" };
  }
  return { title: "Không phát hiện bất thường", tone: "positive" };
}

export function fraudWarnings(block: SpeakingFraudBlock): string[] {
  const out: string[] = [...(block.flags ?? [])];

  for (const segment of block.detail?.segments ?? []) {
    const label = fraudQuestionLabel(segment.question_id);
    if (segment.is_multi_speaker === true) {
      out.push(`${label}: nghe thấy nhiều hơn một giọng nói`);
    }
    if (segment.is_outlier === true) {
      out.push(`${label}: giọng khác biệt so với các câu còn lại`);
    }
    if (segment.data_quality && segment.data_quality !== "ok") {
      out.push(`${label}: chất lượng âm thanh kém (${segment.data_quality})`);
    }
    for (const flag of segment.flags ?? []) {
      out.push(`${label}: ${flag}`);
    }
  }

  return out;
}

// BE numbers only answered Speaking questions, in submission order (GC7) — this matches the
// order in the teacher review panel, not the paper's question numbers.
export function fraudQuestionLabel(questionId?: string): string {
  if (!questionId) return "Câu trả lời không rõ";
  const match = /^q(\d+)$/.exec(questionId);
  return match ? `Câu trả lời ${Number(match[1]) + 1}` : questionId;
}
