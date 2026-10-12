/**
 * generate.mjs — regenerate xlsx test fixtures.
 *
 * Run: node tests/fixtures/xlsx/generate.mjs
 *
 * Headers match the real import templates in public/templates/:
 *   mau-giao-vien.xlsx  → ["Email","Họ tên","Mật khẩu","SĐT","Chuyên môn","Trạng thái"]
 *   mau-hoc-vien.xlsx   → ["Email","Họ tên","Mật khẩu","SĐT","Trình độ","Lớp"]
 *   mau-lop-hoc.xlsx    → ["Tên lớp","Trình độ","Sĩ số","Ngày bắt đầu","Ngày kết thúc","Email GV"]
 *   speaking-mau.xlsx / writing-mau.xlsx → ["Tên đề","Kỹ năng","Loại","Part","STT","Nội dung","Thời lượng","Band","Độ khó","Audio"]
 */

import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = (name) => path.join(__dirname, name);

function sheet(headers, rows) {
  return XLSX.utils.aoa_to_sheet([headers, ...rows]);
}

function wb(sheetData) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetData, "Sheet1");
  return wb;
}

// ── teachers-valid.xlsx ──────────────────────────────────────────────────────
const teacherHeaders = ["Email", "Họ tên", "Mật khẩu", "SĐT", "Chuyên môn", "Trạng thái"];
const teacherValid = sheet(teacherHeaders, [
  ["teacher1@example.com", "Nguyễn Văn A", "Password1!", "0901234567", "Speaking", "active"],
  ["teacher2@example.com", "Trần Thị B",   "Password2!", "0902345678", "Writing",  "active"],
]);
XLSX.writeFile(wb(teacherValid), out("teachers-valid.xlsx"));

// ── teachers-invalid.xlsx ────────────────────────────────────────────────────
// Missing required fields (empty email, short password, unknown status)
const teacherInvalid = sheet(teacherHeaders, [
  ["",                    "Thiếu email",  "Password1!", "0901111111", "Speaking", "active"],
  ["bad-email",           "Email sai",    "short",      "0902222222", "Writing",  "unknown"],
  ["dup@example.com",     "Trùng email",  "Password3!", "",           "",         ""],
]);
XLSX.writeFile(wb(teacherInvalid), out("teachers-invalid.xlsx"));

// ── students-valid.xlsx ──────────────────────────────────────────────────────
const studentHeaders = ["Email", "Họ tên", "Mật khẩu", "SĐT", "Trình độ", "Lớp"];
const studentValid = sheet(studentHeaders, [
  ["student1@example.com", "Lê Văn C",   "Password1!", "0903456789", "Band 5.0", "IELTS A1"],
  ["student2@example.com", "Phạm Thị D", "Password2!", "0904567890", "Band 6.0", "IELTS A2"],
  ["student3@example.com", "Hoàng Văn E","Password3!", "0905678901", "",         ""],
]);
XLSX.writeFile(wb(studentValid), out("students-valid.xlsx"));

// ── classes-valid.xlsx ───────────────────────────────────────────────────────
const classHeaders = ["Tên lớp", "Trình độ", "Sĩ số", "Ngày bắt đầu", "Ngày kết thúc", "Email GV"];
const classValid = sheet(classHeaders, [
  ["IELTS A1", "Band 5.0", 20, "2026-07-01", "2026-12-31", "teacher1@example.com"],
  ["IELTS A2", "Band 6.5", 15, "2026-07-01", "2026-12-31", "teacher2@example.com"],
]);
XLSX.writeFile(wb(classValid), out("classes-valid.xlsx"));

// ── bank-valid.xlsx ──────────────────────────────────────────────────────────
const bankHeaders = ["Tên đề", "Kỹ năng", "Loại", "Part", "STT", "Nội dung", "Thời lượng", "Band", "Độ khó"];
const bankValid = sheet(bankHeaders, [
  ["BTVN Speaking Part 1", "speaking", "homework", 1, 1, "What is your name?",          5, 5.0, "easy"],
  ["BTVN Speaking Part 1", "speaking", "homework", 1, 2, "Where are you from?",          5, 5.0, "easy"],
  ["BTVN Speaking Part 1", "speaking", "homework", 2, 3, "Describe a place you visited.", 5, 5.5, "medium"],
  ["Mock Writing",         "writing",  "exam",     1, 1, "The chart shows population growth.", 60, 6.0, "medium"],
  ["Mock Writing",         "writing",  "exam",     2, 2, "Some people argue that...",           60, 6.0, "medium"],
]);
XLSX.writeFile(wb(bankValid), out("bank-valid.xlsx"));

console.log("Fixtures generated in tests/fixtures/xlsx/");
