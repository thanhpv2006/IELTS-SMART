import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { setupServer } from "msw/node";

// Export the MSW server so individual test files can add handlers if needed.
export const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());
