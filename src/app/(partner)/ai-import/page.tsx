"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { aiImportApi } from "@/features/ai-import/api";
import { ReviewScreen, aiImportJobQueryKey } from "@/features/ai-import/review-screen";
import { isRunning, showsReviewScreen, STATUS_LABEL, STATUS_TONE } from "@/features/ai-import/status";
import type { AIImportJob } from "@/features/ai-import/types";
import { UploadDialog } from "@/features/ai-import/upload-dialog";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableScroll } from "@/components/ui/table";

const POLL_MS = 5_000;
const JOBS_KEY = ["ai-import-jobs"];

function dateTime(iso: string): string {
  return iso ? new Date(iso).toLocaleString("vi-VN") : "—";
}

function useCancelJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => aiImportApi.cancel(jobId),
    onSuccess: (_result, jobId) => {
      queryClient.invalidateQueries({ queryKey: JOBS_KEY });
      queryClient.invalidateQueries({ queryKey: aiImportJobQueryKey(jobId) });
    },
  });
}

function confirmCancel(job: AIImportJob): boolean {
  return window.confirm(`Huỷ "${job.name || job.slug}"? Phần AI đã soạn sẽ bị bỏ.`);
}

export default function AIImportPage() {
  const queryClient = useQueryClient();
  const cancel = useCancelJob();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // A list where nothing is running cannot change on its own — polling it forever only burns
  // requests, so the interval turns itself off until an upload puts a new job in flight.
  const { data, isLoading, isError, error } = useQuery({
    queryKey: JOBS_KEY,
    queryFn: () => aiImportApi.list(),
    refetchInterval: ({ state }) => (state.data?.items.some((job) => isRunning(job.status)) ? POLL_MS : false),
  });

  const jobs = data?.items ?? [];
  const anyRunning = jobs.some((job) => isRunning(job.status));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Import đề bằng AI</h1>
          <p className="mt-1 text-sm text-ink-500">
            Tải lên PDF/DOCX của đề thi thật — AI đọc đề và soạn câu hỏi, bạn rà lại rồi xác nhận thành đề thật.
          </p>
        </div>
        <Button data-testid="ai-import-upload-btn" onClick={() => setUploadOpen(true)}>
          <Upload /> Tải đề lên
        </Button>
      </div>

      {anyRunning && (
        <p className="rounded-lg bg-info-50 px-3 py-2 text-sm text-info-700">
          Trung tâm chỉ chạy được một job import cùng lúc. Muốn bắt đầu đề khác thì huỷ job đang chạy.
        </p>
      )}

      {cancel.isError && (
        <p data-testid="ai-import-cancel-error" className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">
          {errorMessage(cancel.error)}
        </p>
      )}

      {isLoading ? (
        <p className="py-12 text-center text-sm text-ink-400">Đang tải…</p>
      ) : isError ? (
        <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{errorMessage(error)}</p>
      ) : jobs.length === 0 ? (
        <Card data-testid="ai-import-empty" className="p-10 text-center text-sm text-ink-400">
          Chưa có job nào. Tải đề lên để AI soạn bản nháp.
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <TableScroll>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Đề</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Câu nháp</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Tạo lúc</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow
                    key={job.id}
                    data-testid={`ai-import-row-${job.id}`}
                    onClick={() => setSelectedId(job.id)}
                    className={cn("cursor-pointer", selectedId === job.id && "bg-brand-50/60")}
                  >
                    <TableCell>
                      <div className="font-semibold text-ink-900">{job.name || job.slug}</div>
                      <div className="text-xs text-ink-500">{job.slug}</div>
                    </TableCell>
                    <TableCell>
                      <Badge tone={STATUS_TONE[job.status]}>{STATUS_LABEL[job.status]}</Badge>
                      {isRunning(job.status) && job.stage && (
                        <div className="mt-1 text-xs text-ink-500">{job.stage}</div>
                      )}
                    </TableCell>
                    <TableCell className="num">{job.result?.questions?.length ?? 0}</TableCell>
                    <TableCell className="num">
                      {(job.prompt_tokens + job.completion_tokens).toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{dateTime(job.created_at)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          data-testid={`ai-import-open-${job.id}`}
                          onClick={() => setSelectedId(job.id)}
                        >
                          Xem
                        </Button>
                        {isRunning(job.status) && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            data-testid={`ai-import-cancel-${job.id}`}
                            disabled={cancel.isPending}
                            onClick={() => {
                              if (confirmCancel(job)) cancel.mutate(job.id);
                            }}
                          >
                            Huỷ
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        </Card>
      )}

      {selectedId && <JobDetail jobId={selectedId} onClose={() => setSelectedId(null)} />}

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onCreated={(jobId) => {
          setUploadOpen(false);
          queryClient.invalidateQueries({ queryKey: JOBS_KEY });
          setSelectedId(jobId);
        }}
      />
    </div>
  );
}

function JobDetail({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const cancel = useCancelJob();

  // ReviewScreen reads the same cache key, so this one observer drives the polling for both.
  const { data: job, isLoading, isError, error } = useQuery({
    queryKey: aiImportJobQueryKey(jobId),
    queryFn: () => aiImportApi.get(jobId),
    refetchInterval: ({ state }) => (state.data && isRunning(state.data.status) ? POLL_MS : false),
  });

  const reviewable = job !== undefined && showsReviewScreen(job.status);

  return (
    <Card data-testid="ai-import-detail" className="flex flex-col gap-4 p-5">
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" data-testid="ai-import-detail-close" onClick={onClose}>
          Đóng
        </Button>
      </div>

      {isLoading && <p className="py-8 text-center text-sm text-ink-400">Đang tải…</p>}
      {isError && <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{errorMessage(error)}</p>}

      {job && reviewable && <ReviewScreen job={job} />}

      {job && !reviewable && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-lg font-bold tracking-tight text-ink-900">{job.name || job.slug}</h2>
            <Badge tone={STATUS_TONE[job.status]}>{STATUS_LABEL[job.status]}</Badge>
          </div>

          {job.status === "failed" ? (
            <p data-testid="ai-import-detail-error" className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">
              {job.error || "Job thất bại mà không kèm thông báo lỗi."}
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-500">
                {job.stage ? `Bước hiện tại: ${job.stage}` : "Đang xử lý…"} · trang tự cập nhật mỗi 5 giây.
              </p>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="ai-import-detail-cancel"
                  disabled={cancel.isPending}
                  onClick={() => {
                    if (confirmCancel(job)) cancel.mutate(job.id);
                  }}
                >
                  {cancel.isPending ? "Đang huỷ…" : "Huỷ job"}
                </Button>
              </div>
              {cancel.isError && (
                <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{errorMessage(cancel.error)}</p>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
