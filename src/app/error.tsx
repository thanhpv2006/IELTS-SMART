"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card data-testid="route-error" className="flex max-w-md flex-col items-center gap-4 p-8 text-center">
        <h1 className="text-lg font-bold text-ink-900">Trang này gặp lỗi khi hiển thị</h1>
        <p className="text-sm text-ink-500">
          Dữ liệu vẫn an toàn. Bạn thử tải lại, nếu vẫn lỗi hãy báo cho quản trị viên kèm thời điểm gặp lỗi.
        </p>
        {error.digest && <p className="text-xs text-ink-400">Mã lỗi: {error.digest}</p>}
        <div className="flex gap-2">
          <Button type="button" data-testid="route-error-retry" onClick={() => unstable_retry()}>
            Thử lại
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Về trang chủ</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
