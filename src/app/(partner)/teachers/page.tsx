"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Download, Eye, EyeOff, Info, Lock, Pencil, Plus, Search, Upload } from "lucide-react";
import { classApi, teacherApi, type ImportResult, type Teacher } from "@/features/partner/api";
import { errorMessage } from "@/lib/api/errors";
import { Pagination, usePaginatedSearch } from "@/components/ui/search-pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Table, TableScroll, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

const PAGE_SIZE = 20;
const inputCls =
  "w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

function formatDate(value?: string) {
  if (!value) return "Chưa rõ";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa rõ";
  return dateFormatter.format(date);
}

export function normalizedSpecialization(t: Teacher) {
  const skills = new Set(t.specializations ?? []);
  if (skills.has("general")) return "general";
  if (skills.has("speaking") && skills.has("writing")) return "general";
  if (skills.has("speaking")) return "speaking";
  if (skills.has("writing")) return "writing";
  return "unknown";
}

export function specializationMeta(value: string) {
  if (value === "speaking") return { label: "Speaking", tone: "success" as const };
  if (value === "writing") return { label: "Writing", tone: "warning" as const };
  if (value === "general") return { label: "IELTS tổng quát", tone: "info" as const };
  return { label: "Chưa cập nhật", tone: "gray" as const };
}

export function teacherStatus(t: Teacher) {
  if (t.status === "inactive") return { label: "Tạm nghỉ", tone: "gray" as const };
  if (t.status === "active") return { label: "Đang dạy", tone: "success" as const };
  if (!t.last_active_at && t.student_count === 0 && t.assignments_this_month === 0) {
    return { label: "Tạm nghỉ", tone: "gray" as const };
  }
  if (!t.last_active_at) return { label: "Đang dạy", tone: "success" as const };

  const lastActive = new Date(t.last_active_at).getTime();
  const days = (Date.now() - lastActive) / (1000 * 60 * 60 * 24);
  if (!Number.isNaN(days) && days > 60) return { label: "Tạm nghỉ", tone: "gray" as const };
  return { label: "Đang dạy", tone: "success" as const };
}

export default function TeachersPage() {
  const qc = useQueryClient();
  const [specializationFilter, setSpecializationFilter] = useState("all");
  const { data: teachers = [], isLoading } = useQuery({ queryKey: ["teachers"], queryFn: teacherApi.list });
  const { data: classes = [] } = useQuery({ queryKey: ["classes"], queryFn: classApi.list });

  const teacherClassStats = useMemo(() => {
    const map = new Map<string, { classCount: number; studentCount: number }>();
    classes.forEach((c) => {
      if (!c.teacher_id) return;
      const current = map.get(c.teacher_id) ?? { classCount: 0, studentCount: 0 };
      map.set(c.teacher_id, {
        classCount: current.classCount + 1,
        studentCount: current.studentCount + c.student_count,
      });
    });
    return map;
  }, [classes]);

  const visibleTeachers = useMemo(() => {
    if (specializationFilter === "all") return teachers;
    return teachers.filter((t) => normalizedSpecialization(t) === specializationFilter);
  }, [specializationFilter, teachers]);

  const { query, setQuery, page, setPage, paged, totalPages } = usePaginatedSearch(
    visibleTeachers,
    (t, q) => {
      const specialization = specializationMeta(normalizedSpecialization(t)).label.toLowerCase();
      return t.display_name.toLowerCase().includes(q)
        || t.email.toLowerCase().includes(q)
        || specialization.includes(q);
    },
    PAGE_SIZE,
  );

  // ── Create ──
  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [specialization, setSpecialization] = useState("writing");
  const [status, setStatus] = useState("active");
  const [name, setName] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);

  const handleCreateClose = () => {
    setCreateOpen(false);
    setEmail("");
    setPhone("");
    setPassword("");
    setSpecialization("writing");
    setStatus("active");
    setName("");
    setShowPwd(false);
    setFormError(null);
  };

  const create = useMutation({
    mutationFn: teacherApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teachers"] });
      handleCreateClose();
    },
    onError: (e) => setFormError(errorMessage(e)),
  });

  const openEdit = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setName(teacher.display_name);
    setEmail(teacher.email);
    setPhone(teacher.phone ?? "");
    setSpecialization(normalizedSpecialization(teacher) === "unknown" ? "writing" : normalizedSpecialization(teacher));
    setStatus(teacher.status ?? "active");
    setPassword("");
    setShowPwd(false);
    setFormError(null);
  };

  const closeEdit = () => {
    setEditingTeacher(null);
    setEmail("");
    setPhone("");
    setPassword("");
    setSpecialization("writing");
    setStatus("active");
    setName("");
    setShowPwd(false);
    setFormError(null);
  };

  const update = useMutation({
    mutationFn: () => {
      if (!editingTeacher) return Promise.resolve();
      return teacherApi.update(editingTeacher.user_id, {
        display_name: name,
        phone: phone || undefined,
        specialization,
        status,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teachers"] });
      closeEdit();
    },
    onError: (e) => setFormError(errorMessage(e)),
  });

  // ── Import ──
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

  const importMutation = useMutation({
    mutationFn: (file: File) => teacherApi.importXlsx(file),
    onSuccess: (res) => {
      setImportResult(res);
      qc.invalidateQueries({ queryKey: ["teachers"] });
    },
    onError: (e) => setImportError(errorMessage(e)),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Quản lý giáo viên</h1>
          <p className="mt-1 text-sm text-ink-500">Tạo tài khoản giáo viên và theo dõi lớp phụ trách.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button data-testid="import-teacher-btn" variant="outline" onClick={() => setImportOpen(true)}><Upload /> Nhập từ file</Button>
          <Button data-testid="add-teacher-btn" onClick={() => setCreateOpen(true)}><Plus /> Thêm giáo viên</Button>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-ink-200 px-5 py-4">
          <div className="flex h-11 w-full items-center gap-2 rounded-lg border border-input px-3 sm:w-[360px]">
            <Search className="size-5 text-ink-400" />
            <input
              data-testid="teacher-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm theo tên, email..."
              className="min-w-0 flex-1 bg-transparent text-sm text-ink-700 outline-none placeholder:text-ink-400"
            />
          </div>

          <div className="relative h-11 min-w-44">
            <select
              data-testid="specialization-filter"
              value={specializationFilter}
              onChange={(e) => { setSpecializationFilter(e.target.value); setPage(1); }}
              className="h-full w-full appearance-none rounded-lg border border-input bg-white px-4 pr-10 text-sm font-semibold text-ink-700 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="all">Chuyên môn</option>
              <option value="speaking">Speaking</option>
              <option value="writing">Writing</option>
              <option value="general">IELTS tổng quát</option>
              <option value="unknown">Chưa cập nhật</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          </div>

        </div>

        {isLoading ? (
          <p className="px-5 py-10 text-center text-sm text-ink-400">Đang tải...</p>
        ) : teachers.length === 0 ? (
          <div data-testid="teachers-empty" className="px-5 py-12 text-center text-sm text-ink-400">
            Chưa có giáo viên nào. <button onClick={() => setCreateOpen(true)} className="font-medium text-brand-600 hover:underline">Thêm ngay</button>
          </div>
        ) : (
          <>
            <TableScroll>
              <Table className="min-w-[1020px]">
                <TableHeader>
                  <TableRow className="hover:bg-ink-50">
                    <TableHead>Giáo viên</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Chuyên môn</TableHead>
                    <TableHead>Lớp phụ trách</TableHead>
                    <TableHead>Ngày thêm</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map((t) => {
                    const classStats = teacherClassStats.get(t.user_id);
                    const classCount = classStats?.classCount ?? 0;
                    const studentCount = classStats?.studentCount ?? t.student_count;
                    const specialization = specializationMeta(normalizedSpecialization(t));
                    const status = teacherStatus(t);

                    return (
                      <TableRow key={t.user_id} data-testid={`teacher-row-${t.user_id}`}>
                        <TableCell>
                          <div className="flex items-center gap-4">
                            <AvatarInitials name={t.display_name} />
                            <span className="text-base font-semibold text-ink-900">{t.display_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-base text-ink-500">{t.email}</TableCell>
                        <TableCell>
                          <Badge tone={specialization.tone}>{specialization.label}</Badge>
                        </TableCell>
                        <TableCell className="text-base text-ink-600">
                          {classCount > 0 ? `${classCount} lớp · ${studentCount} HV` : `0 lớp · ${studentCount} HV`}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-base text-ink-500">{formatDate(t.created_at)}</TableCell>
                        <TableCell>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <button
                            data-testid={`edit-teacher-btn-${t.user_id}`}
                            onClick={() => openEdit(t)}
                            className="inline-flex size-9 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-800"
                            aria-label={`Cập nhật ${t.display_name}`}
                          >
                            <Pencil className="size-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableScroll>
            <div className="px-5 py-3">
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </div>
          </>
        )}
      </Card>

      <Dialog open={createOpen} onClose={handleCreateClose} title="Thêm giáo viên mới" size="lg">
        <form onSubmit={(e) => {
          e.preventDefault();
          setFormError(null);
          create.mutate({
            email,
            password,
            display_name: name,
            phone: phone || undefined,
            specialization,
            status,
          });
        }}>
          <DialogBody className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Họ tên <span className="text-brand-500">*</span></label>
              <input data-testid="teacher-name-input" value={name} onChange={(e) => setName(e.target.value)} required placeholder="VD: Trần Mỹ Linh" className={inputCls} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-700">Email <span className="text-brand-500">*</span></label>
                <input data-testid="teacher-email-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="giaovien@trungtam.edu.vn" className={inputCls} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-700">Số điện thoại</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xx xxx xxx" className={inputCls} />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Chuyên môn giảng dạy</label>
              <div className="relative">
                <select
                  data-testid="teacher-specialization-select"
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  className={`${inputCls} h-11 appearance-none pr-10`}
                >
                  <option value="writing">Writing</option>
                  <option value="speaking">Speaking</option>
                  <option value="general">IELTS tổng quát</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Trạng thái</label>
              <div className="relative">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={`${inputCls} h-11 appearance-none pr-10`}
                >
                  <option value="active">Đang dạy</option>
                  <option value="inactive">Tạm nghỉ</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Mật khẩu đăng nhập <span className="text-brand-500">*</span></label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-400" />
                <input data-testid="teacher-password-input" type={showPwd ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                  required minLength={6} placeholder="Tối thiểu 6 ký tự" className={`${inputCls} px-11`} />
                <button data-testid="toggle-teacher-password" type="button" onClick={() => setShowPwd((v) => !v)} tabIndex={-1}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-400 hover:text-ink-600"
                  aria-label={showPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>
                  {showPwd ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-ink-400">Giáo viên dùng email &amp; mật khẩu này để đăng nhập hệ thống.</p>
            </div>

            <div className="flex gap-3 rounded-lg border border-info-200 bg-info-50 px-4 py-3 text-sm text-brand-700">
              <Info className="mt-0.5 size-5 shrink-0" />
              <p>Khi tạo, hệ thống sẽ đồng thời tạo hồ sơ giáo viên và tài khoản đăng nhập với email &amp; mật khẩu ở trên.</p>
            </div>

            {formError && <p data-testid="teacher-form-error" className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{formError}</p>}
          </DialogBody>
          <DialogFooter className="justify-end">
            <Button type="button" variant="outline" onClick={handleCreateClose}>Huỷ</Button>
            <Button data-testid="save-teacher-btn" type="submit" disabled={create.isPending}>{create.isPending ? "Đang tạo..." : "Thêm giáo viên"}</Button>
          </DialogFooter>
        </form>
      </Dialog>

      <Dialog open={editingTeacher !== null} onClose={closeEdit} title="Cập nhật giáo viên" size="lg">
        <form onSubmit={(e) => { e.preventDefault(); setFormError(null); update.mutate(); }}>
          <DialogBody className="space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Họ tên <span className="text-brand-500">*</span></label>
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="VD: Trần Mỹ Linh" className={inputCls} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-700">Email</label>
                <input type="email" value={email} disabled className={`${inputCls} bg-ink-50 text-ink-500`} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-ink-700">Số điện thoại</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xx xxx xxx" className={inputCls} />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Chuyên môn giảng dạy</label>
              <div className="relative">
                <select
                  value={specialization}
                  onChange={(e) => setSpecialization(e.target.value)}
                  className={`${inputCls} h-11 appearance-none pr-10`}
                >
                  <option value="writing">Writing</option>
                  <option value="speaking">Speaking</option>
                  <option value="general">IELTS tổng quát</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink-700">Trạng thái</label>
              <div className="relative">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={`${inputCls} h-11 appearance-none pr-10`}
                >
                  <option value="active">Đang dạy</option>
                  <option value="inactive">Tạm nghỉ</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
              </div>
            </div>

            {formError && <p data-testid="teacher-form-error" className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{formError}</p>}
          </DialogBody>
          <DialogFooter className="justify-end">
            <Button type="button" variant="outline" onClick={closeEdit}>Huỷ</Button>
            <Button data-testid="save-teacher-btn" type="submit" disabled={update.isPending}>{update.isPending ? "Đang lưu..." : "Lưu thay đổi"}</Button>
          </DialogFooter>
        </form>
      </Dialog>

      <Dialog open={importOpen} onClose={handleImportClose} title="Nhập giáo viên từ file Excel" size="sm">
        <DialogBody className="space-y-4">
          <p className="text-sm text-ink-600">
            File cần cột: <strong>Email</strong>, <strong>Họ tên</strong>, <strong>Mật khẩu</strong> (trống = tự sinh), <strong>SĐT</strong>, <strong>Chuyên môn</strong> (speaking/writing/general), <strong>Trạng thái</strong> (đang dạy/tạm nghỉ). Các cột sau Mật khẩu là tuỳ chọn.
          </p>
          <a href="/templates/mau-giao-vien.xlsx" download className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline">
            <Download className="size-4" /> Tải file mẫu
          </a>
          <input ref={fileRef} type="file" accept=".xlsx" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; setImportError(null); setImportResult(null); importMutation.mutate(f); }}
            className="w-full text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-600 hover:file:bg-brand-100" />
          {importMutation.isPending && <p className="text-sm text-ink-500">Đang nhập...</p>}
          {importError && <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{importError}</p>}
          {importResult && (
            <div className="space-y-3">
              <div className="flex gap-4 text-sm">
                <span className="font-medium text-success-700">✓ {importResult.imported} thành công</span>
                {importResult.skipped > 0 && <span className="text-ink-400">{importResult.skipped} bỏ qua</span>}
                {(importResult.errors ?? []).length > 0 && <span className="text-error-700">{importResult.errors.length} lỗi</span>}
              </div>
              {(importResult.errors ?? []).length > 0 && (
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-xs text-error-700">
                  {importResult.errors.map((e, i) => <p key={i}>Dòng {e.row}: {e.reason}</p>)}
                </div>
              )}
              {(importResult.generated_passwords ?? []).length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-ink-600">Mật khẩu tự sinh:</p>
                  <div className="max-h-32 space-y-0.5 overflow-y-auto rounded-lg border border-ink-100 bg-ink-50 px-3 py-2 font-mono text-xs">
                    {importResult.generated_passwords.map((c, i) => <p key={i}>{c.email}: <span className="font-semibold">{c.password}</span></p>)}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={handleImportClose}>Đóng</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
