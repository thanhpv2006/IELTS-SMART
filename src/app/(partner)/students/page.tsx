"use client";

import { useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Eye, Info, Lock, Pencil, Plus, Search, Upload } from "lucide-react";
import { classApi, studentApi, type ImportResult, type Student } from "@/features/partner/api";
import { LEVEL_OPTIONS, levelToBand } from "@/features/partner/levels";
import { errorMessage } from "@/lib/api/errors";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Pagination, usePaginatedSearch } from "@/components/ui/search-pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Table, TableScroll, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

const PAGE_SIZE = 20;
const inputCls =
  "h-11 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";
const selectCls =
  "h-11 w-full appearance-none rounded-lg border border-input bg-white px-3 pr-9 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

export default function StudentsPage() {
  const qc = useQueryClient();
  const { data: students = [], isLoading } = useQuery({ queryKey: ["students"], queryFn: studentApi.list });
  const { data: classes = [] } = useQuery({ queryKey: ["classes"], queryFn: classApi.list });

  const [classFilter, setClassFilter] = useState("");

  const filteredByClass = useMemo(() => {
    if (!classFilter) return students;
    if (classFilter === "__none") return students.filter((student) => student.classes.length === 0);
    return students.filter((student) => student.classes.some((c) => c.id === classFilter));
  }, [students, classFilter]);

  const { query, setQuery, page, setPage, paged, totalPages } = usePaginatedSearch(
    filteredByClass,
    (student, q) => {
      const text = `${student.display_name} ${student.email ?? ""}`.toLowerCase();
      return text.includes(q);
    },
    PAGE_SIZE,
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [classId, setClassId] = useState("");
  const [currentLevel, setCurrentLevel] = useState("Band 5.5");
  const [showPwd, setShowPwd] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const openCreate = () => {
    setEmail("");
    setPhone("");
    setPassword("");
    setName("");
    setClassId("");
    setCurrentLevel("Band 5.5");
    setShowPwd(false);
    setFormError(null);
    setCreateOpen(true);
  };
  const handleCreateClose = () => setCreateOpen(false);

  const create = useMutation({
    mutationFn: () =>
      studentApi.create({
        email,
        password,
        display_name: name,
        phone: phone || undefined,
        class_ids: classId ? [classId] : undefined,
        current_level: currentLevel || undefined,
        current_band: levelToBand(currentLevel),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["classes"] });
      handleCreateClose();
    },
    onError: (e) => setFormError(errorMessage(e)),
  });

  // ── Edit ──
  const [editing, setEditing] = useState<Student | null>(null);

  const [creditLimit, setCreditLimit] = useState("");

  const openEdit = (student: Student) => {
    setName(student.display_name);
    setEmail(student.email ?? "");
    setPhone(student.phone ?? "");
    setCurrentLevel(student.current_level ?? "Band 5.5");
    setCreditLimit(student.credit_limit == null ? "" : String(student.credit_limit));
    setFormError(null);
    setEditing(student);
  };
  const closeEdit = () => setEditing(null);

  const update = useMutation({
    mutationFn: () =>
      studentApi.update(editing!.user_id, {
        display_name: name,
        phone: phone || undefined,
        current_level: currentLevel || undefined,
        current_band: levelToBand(currentLevel),
        credit_limit: creditLimit.trim() === "" ? null : Number(creditLimit),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["students"] });
      closeEdit();
    },
    onError: (e) => setFormError(errorMessage(e)),
  });

  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImportClose = () => {
    setImportOpen(false);
    setImportResult(null);
    setImportError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const importStudents = useMutation({
    mutationFn: (file: File) => studentApi.importXlsx(file),
    onSuccess: (res) => {
      setImportResult(res);
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["classes"] });
    },
    onError: (e) => setImportError(errorMessage(e)),
  });

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Quản lý học viên</h1>
          <p className="mt-1 text-sm text-ink-500">Tạo hồ sơ học viên và xếp vào lớp.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button data-testid="import-student-btn" type="button" variant="outline" className="h-11 px-5" onClick={() => setImportOpen(true)}>
            <Upload /> Nhập từ file
          </Button>
          <Button data-testid="add-student-btn" onClick={openCreate} className="h-11 px-5">
            <Plus /> Thêm học viên
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-200 px-5 py-4">
          <div className="flex h-11 w-full items-center gap-2 rounded-lg border border-input px-3 sm:w-80">
            <Search className="size-4 text-ink-400" />
            <input
              data-testid="student-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo tên, email..."
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <div className="relative">
            <select data-testid="class-filter" value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className={`${selectCls} w-36`}>
              <option value="">Lớp</option>
              <option value="__none">Chưa xếp lớp</option>
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400">⌄</span>
          </div>
        </div>

        {isLoading ? (
          <p className="px-5 py-10 text-center text-sm text-ink-400">Đang tải...</p>
        ) : students.length === 0 ? (
          <div data-testid="students-empty" className="px-5 py-12 text-center text-sm text-ink-400">
            Chưa có học viên nào.{" "}
            <button onClick={openCreate} className="font-medium text-brand-600 hover:underline">
              Thêm ngay
            </button>
          </div>
        ) : (
          <>
            <TableScroll>
              <Table className="min-w-[1320px]">
                <TableHeader>
                  <TableRow className="hover:bg-ink-50">
                    <TableHead>Học viên</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Lớp</TableHead>
                    <TableHead>Ngày thêm</TableHead>
                    <TableHead>Trình độ</TableHead>
                    <TableHead>Band</TableHead>
                    <TableHead>Tiến độ</TableHead>
                    <TableHead>Hạn mức credit</TableHead>
                    <TableHead>Quota tháng này</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((student) => (
                    <TableRow key={student.user_id} data-testid={`student-row-${student.user_id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <AvatarInitials name={student.display_name} />
                          <span className="font-semibold text-ink-900">{student.display_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-ink-500">{student.email ?? "--"}</TableCell>
                      <TableCell className="text-ink-600">
                        {student.classes.length === 0 ? (
                          <span className="text-ink-400">Chưa xếp lớp</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {student.classes.map((c) => (
                              <span
                                key={c.id}
                                className="rounded-full border border-ink-200 bg-ink-50 px-2 py-0.5 text-xs font-medium text-ink-700"
                              >
                                {c.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-ink-500">{formatDate(student.created_at)}</TableCell>
                      <TableCell>
                        <LevelPill id={student.user_id} value={student.current_level} />
                      </TableCell>
                      <TableCell data-testid={`student-band-${student.user_id}`} className="font-bold text-ink-900">{student.current_band?.toFixed(1) ?? "--"}</TableCell>
                      <TableCell>
                        <ProgressCell id={student.user_id} student={student} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-ink-600">
                        {student.credits_used.toLocaleString("vi-VN")}/
                        {student.credit_limit == null ? "∞" : student.credit_limit.toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-ink-600">
                        {formatMonthlyQuota(student)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/students/${student.user_id}`}
                            className="inline-flex size-9 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-800"
                            aria-label={`Xem chi tiết ${student.display_name}`}
                          >
                            <Eye className="size-4" />
                          </Link>
                          <button
                            data-testid={`edit-student-btn-${student.user_id}`}
                            onClick={() => openEdit(student)}
                            className="inline-flex size-9 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-800"
                            aria-label={`Cập nhật ${student.display_name}`}
                          >
                            <Pencil className="size-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>
            <p className="px-5 pt-3 text-xs text-ink-400">
              Hạn mức credit tính theo credit cũ (mỗi bài chấm trừ theo bảng giá cũ), không phải theo Part hay câu.
            </p>
            <div className="px-5 py-3">
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </div>
          </>
        )}
      </Card>

      <Dialog open={createOpen} onClose={handleCreateClose} title="Thêm học viên mới" size="lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setFormError(null);
            create.mutate();
          }}
        >
          <DialogBody className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold text-ink-700">
                Họ và tên <span className="text-brand-500">*</span>
              </label>
              <input data-testid="student-name-input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="VD: Nguyễn Văn An" className={inputCls} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-ink-700">Email</label>
                <input data-testid="student-email-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="an.nguyen@email.com" className={inputCls} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-ink-700">Số điện thoại</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xx xxx xxx" className={inputCls} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-ink-700">Xếp vào lớp</label>
                <Select testId="student-class-select" value={classId} onChange={setClassId}>
                  <option value="">Chưa xếp lớp</option>
                  {classes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-ink-700">Trình độ hiện tại</label>
                <Select testId="student-level-select" value={currentLevel} onChange={setCurrentLevel}>
                  {LEVEL_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-ink-700">
                Mật khẩu đăng nhập hệ thống <span className="text-brand-500">*</span>
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-400" />
                <input
                  data-testid="student-password-input"
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••••"
                  className={`${inputCls} pl-11 pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((value) => !value)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-400 hover:text-ink-600"
                  aria-label={showPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  <Eye className="size-5" />
                </button>
              </div>
              <p className="mt-2 text-xs text-ink-400">Học viên dùng email và mật khẩu này để đăng nhập hệ thống.</p>
            </div>

            <div className="flex gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-600">
              <Info className="mt-0.5 size-5 shrink-0" />
              <p>Khi tạo, hệ thống sẽ đồng thời tạo hồ sơ học viên và tài khoản đăng nhập với email & mật khẩu ở trên.</p>
            </div>

            {formError && <p data-testid="student-form-error" className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{formError}</p>}
          </DialogBody>
          <DialogFooter className="justify-end">
            <Button type="button" variant="outline" onClick={handleCreateClose}>
              Hủy
            </Button>
            <Button data-testid="save-student-btn" type="submit" disabled={create.isPending}>
              {create.isPending ? "Đang thêm..." : "Thêm học viên"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      <Dialog open={editing !== null} onClose={closeEdit} title="Cập nhật học viên" size="lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setFormError(null);
            update.mutate();
          }}
        >
          <DialogBody className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-semibold text-ink-700">
                Họ và tên <span className="text-brand-500">*</span>
              </label>
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="VD: Nguyễn Văn An" className={inputCls} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-ink-700">Email</label>
                <input type="email" value={email} disabled className={`${inputCls} bg-ink-50 text-ink-500`} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-ink-700">Số điện thoại</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xx xxx xxx" className={inputCls} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-ink-700">Trình độ hiện tại</label>
                <Select value={currentLevel} onChange={setCurrentLevel}>
                  {LEVEL_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-ink-700">Hạn mức credit</label>
                <input
                  type="number"
                  min={0}
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  placeholder="Để trống = không giới hạn"
                  className={inputCls}
                />
                <p className="mt-2 text-xs text-ink-400">Tính theo credit cũ, không phải Part hay câu.</p>
              </div>
            </div>

            {formError && <p data-testid="student-form-error" className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{formError}</p>}
          </DialogBody>
          <DialogFooter className="justify-end">
            <Button type="button" variant="outline" onClick={closeEdit}>
              Hủy
            </Button>
            <Button data-testid="save-student-btn" type="submit" disabled={update.isPending}>
              {update.isPending ? "Đang lưu..." : "Lưu thay đổi"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      <ImportDialog
        open={importOpen}
        onClose={handleImportClose}
        fileRef={fileRef}
        result={importResult}
        error={importError}
        isPending={importStudents.isPending}
        onFile={(file) => {
          setImportError(null);
          setImportResult(null);
          importStudents.mutate(file);
        }}
      />
    </div>
  );
}

function Select({ value, onChange, children, testId }: { value: string; onChange: (value: string) => void; children: ReactNode; testId?: string }) {
  return (
    <div className="relative">
      <select data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
        {children}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400">⌄</span>
    </div>
  );
}

function LevelPill({ id, value }: { id?: string; value?: string }) {
  if (!value) return <span className="text-ink-400">--</span>;
  return <span data-testid={id ? `level-pill-${id}` : undefined} className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${levelBadgeClass(value)}`}>{value.replace(/^Band\s*/i, "")}</span>;
}

const QUOTA_POOL_LABELS: { key: string; unit: string }[] = [
  { key: "fulltest", unit: "lượt" },
  { key: "speaking_part", unit: "Part" },
  { key: "writing_task", unit: "câu" },
];

/** Only pools the centre's plan actually includes are shown — a plan without
 *  Fulltest must not read as "0 of 0 used". */
function formatMonthlyQuota(student: Student): string {
  const limits = student.quota_limit;
  if (!limits) return "—";
  const parts = QUOTA_POOL_LABELS.filter(({ key }) => (limits[key] ?? 0) > 0).map(
    ({ key, unit }) => `${student.quota_used?.[key] ?? 0}/${limits[key]} ${unit}`,
  );
  return parts.length ? parts.join(" · ") : "—";
}

function ProgressCell({ id, student }: { id?: string; student: Student }) {
  const total = student.assignment_total || 0;
  const done = student.assignment_done || 0;
  const percent = total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100));
  return (
    <div data-testid={id ? `progress-cell-${id}` : undefined} className="w-36">
      <div className="mb-1 text-sm text-ink-500">
        {done}/{total} bài
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function ImportDialog({
  open,
  onClose,
  fileRef,
  result,
  error,
  isPending,
  onFile,
}: {
  open: boolean;
  onClose: () => void;
  fileRef: RefObject<HTMLInputElement | null>;
  result: ImportResult | null;
  error: string | null;
  isPending: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Nhập học viên từ file Excel" size="sm">
      <DialogBody className="space-y-4">
        <p className="text-sm text-ink-600">
          File cần cột: <strong>Email</strong>, <strong>Họ tên</strong>, <strong>Mật khẩu</strong> (trống = tự sinh), <strong>SĐT</strong>, <strong>Trình độ</strong> (VD: Band 5.5), <strong>Lớp</strong> (theo tên lớp). Các cột sau Mật khẩu là tuỳ chọn.
        </p>
        <a href="/templates/mau-hoc-vien.xlsx" download className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline">
          <Download className="size-4" /> Tải file mẫu
        </a>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
          }}
          className="w-full text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-600 hover:file:bg-brand-100"
        />
        {isPending && <p className="text-sm text-ink-500">Đang nhập...</p>}
        {error && <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{error}</p>}
        {result && (
          <div className="space-y-3">
            <div className="flex gap-4 text-sm">
              <span className="font-medium text-success-700">✓ {result.imported} thành công</span>
              {result.skipped > 0 && <span className="text-ink-400">{result.skipped} bỏ qua</span>}
              {(result.errors ?? []).length > 0 && <span className="text-error-700">{result.errors.length} lỗi</span>}
            </div>
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Đóng
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function levelBadgeClass(level: string) {
  if (level.includes("7")) return "border-violet-200 bg-violet-50 text-violet-600";
  if (level.includes("5.5")) return "border-amber-200 bg-amber-50 text-amber-700";
  if (level.toLowerCase().includes("giao")) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (level.toLowerCase().includes("foundation")) return "border-ink-200 bg-ink-50 text-ink-600";
  return "border-brand-200 bg-brand-50 text-brand-600";
}

function formatDate(value?: string) {
  if (!value) return "--";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}
