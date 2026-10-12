import { fraudQuestionLabel, fraudVerdict, fraudWarnings } from "./speaking-fraud";

describe("fraudVerdict", () => {
  it("shows pending", () => {
    expect(fraudVerdict({ status: "pending" })).toEqual({
      title: "Đang kiểm tra giọng nói",
      tone: "neutral",
    });
  });

  it("shows unavailable", () => {
    expect(fraudVerdict({ status: "unavailable" })).toEqual({
      title: "Chưa có kết quả kiểm tra",
      tone: "neutral",
    });
  });

  it("shows failed", () => {
    expect(fraudVerdict({ status: "failed" })).toEqual({
      title: "Không kiểm tra được bài này",
      tone: "neutral",
    });
  });

  it("shows unknown status same as failed", () => {
    expect(fraudVerdict({ status: "something_new" })).toEqual({
      title: "Không kiểm tra được bài này",
      tone: "neutral",
    });
  });

  it("human review wins outright, even over low risk", () => {
    expect(
      fraudVerdict({ status: "completed", requires_human_review: true, overall_risk: "low" }),
    ).toEqual({ title: "Cần người kiểm tra lại", tone: "warning" });
  });

  it("high risk when completed", () => {
    expect(fraudVerdict({ status: "completed", overall_risk: "high" })).toEqual({
      title: "Phát hiện dấu hiệu bất thường",
      tone: "danger",
    });
  });

  it("medium risk when completed", () => {
    expect(fraudVerdict({ status: "completed", overall_risk: "medium" })).toEqual({
      title: "Có dấu hiệu cần lưu ý",
      tone: "warning",
    });
  });

  it("no risk when completed", () => {
    expect(fraudVerdict({ status: "completed" })).toEqual({
      title: "Không phát hiện bất thường",
      tone: "positive",
    });
  });
});

describe("fraudWarnings", () => {
  it("lists top-level flags first, then outlier, poor audio and segment flags in order", () => {
    expect(
      fraudWarnings({
        status: "completed",
        flags: ["voice_mismatch"],
        detail: {
          segments: [
            { question_id: "q0", is_outlier: true },
            { question_id: "q4", data_quality: "too_short", flags: ["reading_detected"] },
          ],
        },
      }),
    ).toEqual([
      "voice_mismatch",
      "Câu trả lời 1: giọng khác biệt so với các câu còn lại",
      "Câu trả lời 5: chất lượng âm thanh kém (too_short)",
      "Câu trả lời 5: reading_detected",
    ]);
  });

  it("maps multi-speaker segment to a Vietnamese line", () => {
    expect(
      fraudWarnings({
        status: "completed",
        detail: { segments: [{ question_id: "q2", is_multi_speaker: true }] },
      }),
    ).toEqual(["Câu trả lời 3: nghe thấy nhiều hơn một giọng nói"]);
  });

  it("skips ok data_quality", () => {
    expect(
      fraudWarnings({
        status: "completed",
        detail: { segments: [{ question_id: "q0", data_quality: "ok" }] },
      }),
    ).toEqual([]);
  });
});

describe("fraudQuestionLabel", () => {
  it("maps q0 to Câu trả lời 1", () => {
    expect(fraudQuestionLabel("q0")).toBe("Câu trả lời 1");
  });

  it("falls back for missing id", () => {
    expect(fraudQuestionLabel(undefined)).toBe("Câu trả lời không rõ");
  });

  it("returns raw id when it does not match the pattern", () => {
    expect(fraudQuestionLabel("abc")).toBe("abc");
  });
});
