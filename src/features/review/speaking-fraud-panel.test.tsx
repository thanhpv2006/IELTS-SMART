import { render, screen } from "@testing-library/react";
import { SpeakingFraudPanel } from "./speaking-fraud-panel";
import type { SpeakingFraudBlock } from "./speaking-fraud";

describe("SpeakingFraudPanel", () => {
  it("renders nothing when fraud is undefined", () => {
    const { container } = render(<SpeakingFraudPanel fraud={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows pending copy", () => {
    render(<SpeakingFraudPanel fraud={{ status: "pending" }} />);
    expect(screen.getByText("Đang kiểm tra giọng nói")).toBeTruthy();
  });

  it("shows completed high-risk verdict and segment warning", () => {
    const fraud: SpeakingFraudBlock = {
      status: "completed",
      overall_risk: "high",
      detail: { segments: [{ question_id: "q0", is_multi_speaker: true }] },
    };
    render(<SpeakingFraudPanel fraud={fraud} />);
    expect(screen.getByText("Phát hiện dấu hiệu bất thường")).toBeTruthy();
    expect(screen.getByText("Câu trả lời 1: nghe thấy nhiều hơn một giọng nói")).toBeTruthy();
  });

  it("shows unavailable copy without the speaker count fact", () => {
    render(<SpeakingFraudPanel fraud={{ status: "unavailable" }} />);
    expect(screen.getByText("Chưa có kết quả kiểm tra")).toBeTruthy();
    expect(screen.queryByText(/Số giọng nói/)).toBeNull();
  });
});
