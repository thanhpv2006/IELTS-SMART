import { describe, it, expect } from "vitest";
import { ApiError, NetworkError, isApiError, errorMessage } from "@/lib/api/errors";

// ERR — errorMessage dispatch + isApiError
describe("ApiError", () => {
  it("exposes status, code, and message", () => {
    const err = new ApiError(422, { code: "validation_error", message: "Dữ liệu không hợp lệ" });
    expect(err.status).toBe(422);
    expect(err.code).toBe("validation_error");
    expect(err.message).toBe("Dữ liệu không hợp lệ");
    expect(err.name).toBe("ApiError");
  });

  it("inherits from Error", () => {
    const err = new ApiError(500, { code: "internal", message: "Lỗi hệ thống" });
    expect(err).toBeInstanceOf(Error);
  });
});

describe("NetworkError", () => {
  it("stores message and optional cause", () => {
    const cause = new Error("underlying");
    const err = new NetworkError("Không kết nối được máy chủ. Vui lòng thử lại.", cause);
    expect(err.message).toBe("Không kết nối được máy chủ. Vui lòng thử lại.");
    expect(err.cause).toBe(cause);
    expect(err.name).toBe("NetworkError");
  });

  it("inherits from Error", () => {
    const err = new NetworkError("net fail");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("isApiError", () => {
  it("returns true for ApiError instances", () => {
    expect(isApiError(new ApiError(404, { code: "not_found", message: "Không tìm thấy" }))).toBe(true);
  });

  it("returns false for NetworkError", () => {
    expect(isApiError(new NetworkError("net"))).toBe(false);
  });

  it("returns false for plain Error", () => {
    expect(isApiError(new Error("plain"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isApiError("string")).toBe(false);
    expect(isApiError(null)).toBe(false);
    expect(isApiError(undefined)).toBe(false);
    expect(isApiError(42)).toBe(false);
  });
});

describe("errorMessage", () => {
  it("ERR: extracts body.message from ApiError", () => {
    const err = new ApiError(400, { code: "bad_request", message: "Email không hợp lệ" });
    expect(errorMessage(err)).toBe("Email không hợp lệ");
  });

  it("ERR: returns message from NetworkError", () => {
    const err = new NetworkError("Không kết nối được máy chủ. Vui lòng thử lại.");
    expect(errorMessage(err)).toBe("Không kết nối được máy chủ. Vui lòng thử lại.");
  });

  it("ERR: returns message from generic Error", () => {
    const err = new Error("Something went wrong");
    expect(errorMessage(err)).toBe("Something went wrong");
  });

  it("ERR: returns fallback for non-Error values", () => {
    expect(errorMessage("raw string")).toBe("Đã xảy ra lỗi.");
    expect(errorMessage(null)).toBe("Đã xảy ra lỗi.");
    expect(errorMessage(undefined)).toBe("Đã xảy ra lỗi.");
    expect(errorMessage(42)).toBe("Đã xảy ra lỗi.");
    expect(errorMessage({ random: "object" })).toBe("Đã xảy ra lỗi.");
  });

  it("ERR: ApiError message takes precedence over Error.message", () => {
    // ApiError.message === body.message (set in constructor), so both paths give same string.
    const err = new ApiError(401, { code: "unauthorized", message: "Phiên đăng nhập hết hạn" });
    expect(errorMessage(err)).toBe("Phiên đăng nhập hết hạn");
  });
});
