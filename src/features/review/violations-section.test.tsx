import { render, screen } from "@testing-library/react";
import { ViolationsSection } from "./violations-section";

describe("ViolationsSection", () => {
  it("renders nothing when violations is undefined", () => {
    const { container } = render(<ViolationsSection violations={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when total is 0", () => {
    const { container } = render(<ViolationsSection violations={{ total: 0, by_type: {} }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows violation counts by type", () => {
    render(
      <ViolationsSection
        violations={{ total: 3, by_type: { "leave-tab": 2, "exit-fullscreen": 1 } }}
      />,
    );
    expect(screen.getByText("Rời tab: 2")).toBeTruthy();
    expect(screen.getByText("Thoát toàn màn hình: 1")).toBeTruthy();
  });
});
