"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Zap } from "lucide-react";
import { smartCreditApi, paymentApi, accountApi, type CreditPackage, type CreditUnitType, type PurchaseResult } from "@/features/partner/api";
import { errorMessage } from "@/lib/api/errors";
import { cn } from "@/lib/utils";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const vnd = (n: number) => n.toLocaleString("vi-VN") + "₫";

// Only the pools still on sale. A legacy package is never offered again — that
// balance is spent down, not topped up.
const SALE_POOLS: { key: CreditUnitType; heading: string; unit: string; perUnit: string }[] = [
  { key: "fulltest", heading: "Fulltest 4 kỹ năng", unit: "lượt", perUnit: "đ/lượt" },
  { key: "speaking_part", heading: "Speaking", unit: "Part", perUnit: "đ/Part" },
  { key: "writing_task", heading: "Writing", unit: "câu", perUnit: "đ/câu" },
];

/** The "top up credit" dialog: pick a package → create an order → scan the SePay QR → credit is added automatically on payment. */
export function CreditTopupDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: pkgData, isLoading } = useQuery({
    queryKey: ["smart-credit-packages"],
    queryFn: smartCreditApi.packages,
  });
  const [order, setOrder] = useState<PurchaseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  const buy = useMutation({
    mutationFn: (pkg: CreditPackage) => smartCreditApi.purchase(pkg.id),
    onSuccess: (res) => setOrder(res),
    onError: (e) => setError(errorMessage(e)),
  });

  // Whitelisted (simulate_payment) accounts can settle the order without paying.
  const { data: flags } = useQuery({ queryKey: ["me-flags"], queryFn: accountApi.myFlags });
  const canSimulate = flags?.flags.simulate_payment === true;
  // Do NOT set `paid` here — the poll below detects `status==="paid"` (single source of truth).
  const simulate = useMutation({
    mutationFn: () => paymentApi.simulatePaid(order!.order_id),
    // Nudge the status poll to refetch now instead of waiting up to 3s; the poll
    // (not this mutation) still owns flipping `paid` — single source of truth.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment-order", order?.order_id] }),
    onError: (e) => setError(errorMessage(e)),
  });

  // Poll order status while pending; stop once paid.
  useQuery({
    queryKey: ["payment-order", order?.order_id],
    queryFn: async () => {
      const o = await paymentApi.getOrder(order!.order_id);
      if (o.status === "paid" && !paid) {
        setPaid(true);
        qc.invalidateQueries({ queryKey: ["smart-credit-balance"] });
      }
      return o;
    },
    enabled: order !== null && !paid,
    refetchInterval: 3000,
  });

  const packages = pkgData?.items ?? [];

  return (
    <Dialog open onClose={onClose} title="Nạp thêm credit" size="md">
      <DialogBody className="flex flex-col gap-4">
        {paid ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-success-50 text-success-600">
              <Check className="size-7" />
            </span>
            <div className="text-lg font-bold text-ink-900">Nạp thành công!</div>
            <p className="text-sm text-ink-500">Credit đã được cộng vào tài khoản trung tâm.</p>
          </div>
        ) : order ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-ink-600">Quét mã QR bằng app ngân hàng để thanh toán</p>
            <div className="text-2xl font-extrabold text-ink-900">{Number(order.amount).toLocaleString("vi-VN")} {order.currency}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={order.checkout_url} alt="Mã QR thanh toán" className="size-60 rounded-xl border border-ink-100 object-contain" />
            <div className="flex items-center gap-2 text-sm text-ink-400">
              <Loader2 className="size-4 animate-spin" /> Đang chờ thanh toán…
            </div>
            <p className="text-xs text-ink-400">Cửa sổ sẽ tự cập nhật khi nhận được thanh toán. Đừng đóng vội.</p>
            {canSimulate && (
              <Button
                variant="outline"
                disabled={simulate.isPending}
                onClick={() => { setError(null); simulate.mutate(); }}
              >
                {simulate.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Giả lập đã thanh toán
              </Button>
            )}
          </div>
        ) : isLoading ? (
          <p className="py-8 text-center text-sm text-ink-400">Đang tải gói…</p>
        ) : packages.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-400">Chưa có gói nào. Liên hệ quản trị viên.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-500">Chọn gói để nạp:</p>
            {SALE_POOLS.map((pool) => {
              const items = packages.filter((pkg) => pkg.unit_type === pool.key);
              if (items.length === 0) return null;
              return (
                <div key={pool.key} className="flex flex-col gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-ink-400">{pool.heading}</h3>
                  {items.map((pkg) => (
                    <button
                      key={pkg.id}
                      type="button"
                      disabled={buy.isPending}
                      onClick={() => { setError(null); buy.mutate(pkg); }}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-xl border border-ink-200 p-4 text-left transition hover:border-brand-300 hover:bg-ink-50/40 disabled:opacity-60",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold text-ink-900">{pkg.name}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
                          <Zap className="size-3.5 text-warning-600" /> {pkg.credits.toLocaleString("vi-VN")} {pool.unit}
                          {pkg.valid_days > 0 ? ` · hạn ${pkg.valid_days} ngày` : " · không giới hạn thời gian"}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[15px] font-bold text-brand-600">{vnd(pkg.price_vnd)}</div>
                        <div className="text-xs text-ink-400">
                          {Math.round(pkg.price_vnd / pkg.credits).toLocaleString("vi-VN")} {pool.perUnit}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {error && <p className="rounded-lg bg-error-50 px-3 py-2 text-sm text-error-700">{error}</p>}
      </DialogBody>
      <DialogFooter className="justify-end">
        <Button variant="outline" onClick={onClose}>{paid ? "Đóng" : "Hủy"}</Button>
      </DialogFooter>
    </Dialog>
  );
}
