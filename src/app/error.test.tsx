import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ErrorPage from "./error";

describe("route ErrorPage", () => {
  it("offers a retry that re-renders the failed segment", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();

    render(<ErrorPage error={Object.assign(new Error("boom"), { digest: "abc123" })} unstable_retry={retry} />);

    expect(screen.getByTestId("route-error")).toHaveTextContent("Mã lỗi: abc123");
    await userEvent.click(screen.getByTestId("route-error-retry"));
    expect(retry).toHaveBeenCalledOnce();
  });
});
