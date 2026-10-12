import { describe, it, expect } from "vitest";

import type { Assignment, SmartClass } from "@/features/partner/api";
import { STATUS_FILTERS, isDueSoon, toBatches, toClassGroups } from "./assignment-groups";

const GIAO = "2026-09-01T08:00:00Z";

function row(over: Partial<Assignment> = {}): Assignment {
  return {
    id: crypto.randomUUID(),
    test_id: "t1",
    test_name: "IELTS Smart Reading Test 02",
    skill: "speaking",
    tier: "homework",
    student_id: crypto.randomUUID(),
    student_name: "Nguyễn Văn A",
    status: "pending",
    created_at: GIAO,
    class_id: "c1",
    class_name: "Basic - 3.0",
    ...over,
  };
}

const KNOWN = new Set(["c1", "c2"]);

describe("toBatches", () => {
  it("folds one bài given to three students into a single batch", () => {
    const batches = toBatches([row(), row(), row()], KNOWN);

    expect(batches).toHaveLength(1);
    expect(batches[0].total).toBe(3);
    expect(batches[0].className).toBe("Basic - 3.0");
  });

  it("keeps two giao of the same bài to the same class apart", () => {
    const batches = toBatches([row(), row({ created_at: "2026-09-05T08:00:00Z" })], KNOWN);

    expect(batches).toHaveLength(2);
  });

  it("counts a submitted Reading answer as graded, never as awaiting review", () => {
    const batches = toBatches([row({ skill: "reading", status: "submitted" })], KNOWN);

    expect(batches[0]).toMatchObject({ submitted: 1, graded: 1, pendingReview: 0 });
  });

  it("counts a submitted Speaking answer as awaiting review", () => {
    const batches = toBatches([row({ skill: "speaking", status: "submitted" })], KNOWN);

    expect(batches[0]).toMatchObject({ submitted: 1, graded: 0, pendingReview: 1 });
  });

  it("collects every assignment id, and the pending ones separately", () => {
    const [batch] = toBatches(
      [
        row({ id: "a1", status: "submitted" }),
        row({ id: "a2", student_id: "u2", status: "pending" }),
        row({ id: "a3", student_id: "u3", status: "assigned" }),
      ],
      KNOWN,
    );

    expect(batch.assignmentIds).toEqual(["a1", "a2", "a3"]);
    expect(batch.pendingIds).toEqual(["a2", "a3"]);
    expect(batch.pendingStudentIds).toEqual(["u2", "u3"]);
  });

  it("keeps the class id so giao lại can target the same class", () => {
    const [inClass] = toBatches([row({ class_id: "c1" })], KNOWN);
    const [solo] = toBatches([row({ test_id: "t9", class_id: undefined, class_name: undefined })], KNOWN);

    expect(inClass.classId).toBe("c1");
    expect(solo.classId).toBeUndefined();
  });

  it("keeps the time limit so giao lại re-issues the same one", () => {
    const [timed] = toBatches([row({ time_limit_minutes: 25 })], KNOWN);
    const [untimed] = toBatches([row({ test_id: "t9" })], KNOWN);

    expect(timed.timeLimitMinutes).toBe(25);
    expect(untimed.timeLimitMinutes).toBeUndefined();
  });

  it("takes the earliest deadline of the batch", () => {
    const [batch] = toBatches(
      [
        row({ deadline: "2026-09-20T00:00:00Z" }),
        row({ deadline: "2026-09-12T00:00:00Z" }),
        row({ deadline: undefined }),
      ],
      KNOWN,
    );

    expect(batch.deadline).toBe("2026-09-12T00:00:00Z");
  });
});

const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

describe("status filters", () => {
  it("closes a batch whose deadline has passed", () => {
    const [batch] = toBatches([row({ deadline: inDays(-1) })], KNOWN);

    expect(batch.status).toBe("closed");
    expect(isDueSoon(batch)).toBe(false);
  });

  it("leaves a batch with no deadline open", () => {
    const [batch] = toBatches([row({ deadline: undefined })], KNOWN);

    expect(batch.status).toBe("open");
    expect(isDueSoon(batch)).toBe(false);
  });

  it("marks a batch due in two days as due soon", () => {
    const [batch] = toBatches([row({ deadline: inDays(2) })], KNOWN);

    expect(batch.status).toBe("open");
    expect(isDueSoon(batch)).toBe(true);
  });

  it("does not mark a batch due in ten days as due soon", () => {
    const [batch] = toBatches([row({ deadline: inDays(10) })], KNOWN);

    expect(isDueSoon(batch)).toBe(false);
  });

  it("offers the five labels the design names", () => {
    expect(STATUS_FILTERS.map((f) => f.key)).toEqual(["all", "open", "needReview", "dueSoon", "closed"]);
    expect(STATUS_FILTERS.map((f) => f.label)).toEqual([
      "Tất cả",
      "Số bài đang mở",
      "Số bài cần đánh giá",
      "Số bài sắp hết hạn",
      "Số bài đã kết thúc",
    ]);
  });

  it("partitions every batch into đang mở or đã kết thúc", () => {
    const batches = toBatches(
      [row({ deadline: inDays(-1) }), row({ test_id: "t2", deadline: inDays(5) }), row({ test_id: "t3" })],
      KNOWN,
    );
    const open = batches.filter(STATUS_FILTERS.find((f) => f.key === "open")!.match).length;
    const closed = batches.filter(STATUS_FILTERS.find((f) => f.key === "closed")!.match).length;

    expect(open + closed).toBe(batches.length);
  });
});

function cls(id: string, name: string): SmartClass {
  return {
    id,
    name,
    student_count: 0,
    assignment_count: 0,
    completion_rate: 0,
    status: "active",
    created_at: GIAO,
  };
}

const CLASSES = [cls("c1", "Basic - 3.0"), cls("c2", "Huyen IELTS Target 7.5")];

describe("toClassGroups", () => {
  it("keeps a class that has never been given a bài, with every count at zero", () => {
    const groups = toClassGroups(toBatches([], KNOWN), CLASSES);

    expect(groups.map((g) => g.name)).toEqual(["Basic - 3.0", "Huyen IELTS Target 7.5"]);
    expect(groups[0]).toMatchObject({ total: 0, open: 0, needReview: 0, completion: 0 });
  });

  it("keeps two classes of the same name apart", () => {
    const classes = [cls("c1", "Basic"), cls("c2", "Basic")];
    const batches = toBatches([row({ class_id: "c1", class_name: "Basic" })], KNOWN);

    const groups = toClassGroups(batches, classes);

    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.total)).toEqual([1, 0]);
  });

  it("files work with no live class under Giao lẻ, last", () => {
    const batches = toBatches(
      [row(), row({ test_id: "t2", class_id: undefined, class_name: undefined }), row({ test_id: "t3", class_id: "gone" })],
      KNOWN,
    );

    const groups = toClassGroups(batches, CLASSES);

    expect(groups.at(-1)).toMatchObject({ name: "Giao lẻ", isSolo: true, total: 2 });
  });

  it("omits Giao lẻ when nothing feeds it", () => {
    const groups = toClassGroups(toBatches([row()], KNOWN), CLASSES);

    expect(groups.some((g) => g.isSolo)).toBe(false);
  });

  it("counts bài, not student rows", () => {
    const batches = toBatches([row(), row(), row()], KNOWN);

    expect(toClassGroups(batches, CLASSES)[0].total).toBe(1);
  });

  it("counts a bài needing review once, however many students await it", () => {
    const batches = toBatches(
      [row({ status: "submitted" }), row({ status: "submitted" }), row({ status: "submitted" })],
      KNOWN,
    );

    expect(toClassGroups(batches, CLASSES)[0].needReview).toBe(1);
  });

  it("averages completion per bài, not over all students", () => {
    const later = { test_id: "t2", created_at: "2026-09-08T08:00:00Z" };
    const batches = toBatches(
      [
        row({ ...later }),
        row({ ...later }),
        row({ ...later }),
        row({ ...later }),
        row({ ...later }),
        row({ status: "submitted", skill: "reading" }),
      ],
      KNOWN,
    );

    expect(toClassGroups(batches, CLASSES)[0].completion).toBe(50);
  });
});
