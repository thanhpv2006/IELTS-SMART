import { describe, it, expect } from "vitest";
import { buildPracticeHistory } from "./history";

const correct = (raw: number) => ({ kind: "objective", skill: "reading", raw, total: 13, band: 9, sections: [] });

describe("buildPracticeHistory", () => {
  it("returns no key for a test that has never been practiced", () => {
    const history = buildPracticeHistory([], []);

    expect(history["test-1"]).toBeUndefined();
  });

  it("counts all self-practice attempts and picks the most correct answers as bestCorrect", () => {
    const assignments = [
      { id: "a1", test_id: "test-1", origin: "self_practice", created_at: "2026-09-01T00:00:00Z" },
      { id: "a2", test_id: "test-1", origin: "self_practice", created_at: "2026-09-02T00:00:00Z" },
      { id: "a3", test_id: "test-1", origin: "self_practice", created_at: "2026-09-03T00:00:00Z" },
    ];
    const results = [
      { id: "r1", assignment_id: "a1", result: correct(5) },
      { id: "r2", assignment_id: "a2", result: correct(7) },
      { id: "r3", assignment_id: "a3", result: correct(6) },
    ];

    const history = buildPracticeHistory(assignments, results);

    expect(history["test-1"].attempts).toBe(3);
    expect(history["test-1"].bestCorrect).toEqual({ raw: 7, total: 13 });
  });

  it("counts an abandoned attempt (no result) toward attempts but not bestCorrect", () => {
    const assignments = [
      { id: "a1", test_id: "test-1", origin: "self_practice", created_at: "2026-09-01T00:00:00Z" },
      { id: "a2", test_id: "test-1", origin: "self_practice", created_at: "2026-09-02T00:00:00Z" },
    ];
    const results = [{ id: "r1", assignment_id: "a1", result: correct(6) }];

    const history = buildPracticeHistory(assignments, results);

    expect(history["test-1"].attempts).toBe(2);
    expect(history["test-1"].bestCorrect).toEqual({ raw: 6, total: 13 });
  });

  it("ignores assignments with origin=assigned entirely", () => {
    const assignments = [
      { id: "a1", test_id: "test-1", origin: "self_practice", created_at: "2026-09-01T00:00:00Z" },
      { id: "a2", test_id: "test-1", origin: "assigned", created_at: "2026-09-02T00:00:00Z" },
    ];
    const results = [
      { id: "r1", assignment_id: "a1", result: correct(5) },
      { id: "r2", assignment_id: "a2", result: correct(9) },
    ];

    const history = buildPracticeHistory(assignments, results);

    expect(history["test-1"].attempts).toBe(1);
    expect(history["test-1"].bestCorrect).toEqual({ raw: 5, total: 13 });
  });

  it("points lastResultId to the most recently created attempt that has a result, not the overall most recent attempt", () => {
    const assignments = [
      { id: "a1", test_id: "test-1", origin: "self_practice", created_at: "2026-09-01T00:00:00Z" },
      { id: "a2", test_id: "test-1", origin: "self_practice", created_at: "2026-09-02T00:00:00Z" },
      { id: "a3", test_id: "test-1", origin: "self_practice", created_at: "2026-09-03T00:00:00Z" },
    ];
    const results = [
      { id: "r1", assignment_id: "a1", result: correct(5) },
      { id: "r2", assignment_id: "a2", result: correct(6) },
    ];

    const history = buildPracticeHistory(assignments, results);

    expect(history["test-1"].lastResultId).toBe("r2");
  });

  it("compares created_at by real timestamp, not by string ordering across differing ISO formats", () => {
    // a1's offset form sorts as a LARGER string than a2's UTC form even though
    // a1 happened earlier in real time (a1 = 02:00 UTC, a2 = 08:00 UTC).
    const assignments = [
      { id: "a1", test_id: "test-1", origin: "self_practice", created_at: "2026-09-08T09:00:00+07:00" },
      { id: "a2", test_id: "test-1", origin: "self_practice", created_at: "2026-09-08T08:00:00Z" },
    ];
    const results = [
      { id: "r1", assignment_id: "a1", result: correct(5) },
      { id: "r2", assignment_id: "a2", result: correct(6) },
    ];

    const history = buildPracticeHistory(assignments, results);

    expect(history["test-1"].lastResultId).toBe("r2");
  });
});
