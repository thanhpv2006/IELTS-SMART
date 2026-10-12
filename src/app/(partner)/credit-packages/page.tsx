"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet, Plus, Zap } from "lucide-react";
import {
  smartCreditApi,
  smartSeatApi,
  type CreditPack,
  type CreditPurchaseItem,
  type CreditUnitType,
} from "@/features/partner/api";
import {
  PACK_WARNING_LABELS,
  POOL_LABELS,
  POOL_UNITS,
  packWarning,
} from "@/features/partner/credit-pools";
import { CreditTopupDialog } from "@/features/partner/credit-topup-dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Nhãn hiển thị: tên gói thật, fallback "Gói {N} {đơn vị}" khi pack chưa có tên. */
function packLabel(p: CreditPack) {
  return p.name?.trim() || `Gói ${p.credits_total.toLocaleString("vi-VN")} ${POOL_UNITS[p.unit_type] ?? "credit"}`;
}

function statusBadge(status: string) {
  switch (status) {
    case "active":
      return <Badge tone="success">Còn hiệu lực</Badge>;
    case "expired":
      return <Badge tone="gray">Hết hạn</Badge>;
    case "depleted":
      return <Badge tone="gray">Đã dùng hết</Badge>;
    default:
      return <Badge tone="gray">{status}</Badge>;
  }
}

function purchaseStatusLabel(status: string) {
  switch (status) {
    case "paid":
      return <Badge tone="success">Đã thanh toán</Badge>;
    case "pending":
      return <Badge tone="warning">Chờ thanh toán</Badge>;
    case "cancelled":
      return <Badge tone="gray">Đã huỷ</Badge>;
    default:
      return <Badge tone="gray">{status}</Badge>;
  }
}

export default function CreditPackagesPage() {
  const [topupOpen, setTopupOpen] = useState(false);
  const { data: balance } = useQuery({
    queryKey: ["smart-credit-balance"],
    queryFn: smartCreditApi.balance,
  });
  const { data: usage } = useQuery({
    queryKey: ["smart-credit-usage"],
    queryFn: () => smartCreditApi.usage(),
  });
  const { data: packData, isLoading } = useQuery({
    queryKey: ["smart-credit-packs"],
    queryFn: smartCreditApi.packs,
  });
  const { data: purchaseData, isLoading: purchasesLoading } = useQuery({
    queryKey: ["smart-credit-purchases"],
    queryFn: smartCreditApi.purchases,
  });
  const packs: CreditPack[] = packData?.items ?? [];
  const purchases: CreditPurchaseItem[] = purchaseData?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[23px] font-bold tracking-tight text-ink-900">Quản lý gói credit</h1>
          <p className="mt-1 text-sm text-ink-500">Số dư từng loại lượt và các gói trung tâm đang sở hữu.</p>
        </div>
        <Button onClick={() => setTopupOpen(true)}>
          <Plus className="size-4" /> Mua thêm gói
        </Button>
      </div>

      <SeatContractCard />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(["fulltest", "speaking_part", "writing_task"] as const).map((poolKey) => (
          <BalanceCard
            key={poolKey}
            pool={poolKey}
            value={balance?.balances?.[poolKey] ?? 0}
            used={usage?.usage?.[poolKey]}
            onTopup={() => setTopupOpen(true)}
          />
        ))}
        {(balance?.balances?.legacy ?? 0) > 0 && (
          <BalanceCard
            pool="legacy"
            value={balance!.balances.legacy}
            used={usage?.usage?.legacy}
            note="Sẽ được tiêu trước."
            onTopup={() => setTopupOpen(true)}
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-bold text-ink-700">Các gói đã mua</h2>
        <Card className="p-0">
          {isLoading ? (
            <p className="py-10 text-center text-sm text-ink-400">Đang tải…</p>
          ) : packs.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-400">Chưa có gói nào.</p>
          ) : (
            <ul className="divide-y divide-ink-50">
              {packs.map((p) => {
                const warning = packWarning(p);
                return (
                  <li key={p.id} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[15px] font-semibold text-ink-900">{packLabel(p)}</span>
                        {statusBadge(p.status)}
                        {warning && <Badge tone="warning">{PACK_WARNING_LABELS[warning]}</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                        <span className="inline-flex items-center gap-1">
                          <Zap className="size-3.5 text-warning-600" />
                          Còn {p.credits_remaining.toLocaleString("vi-VN")}/{p.credits_total.toLocaleString("vi-VN")}{" "}
                          {POOL_UNITS[p.unit_type] ?? "credit"}
                        </span>
                        <span>·</span>
                        <span>{POOL_LABELS[p.unit_type] ?? p.unit_type}</span>
                        <span>·</span>
                        <span>{p.expires_at ? `Hết hạn ${fmtDate(p.expires_at)}` : "Không giới hạn hạn"}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-bold text-ink-700">Lịch sử mua</h2>
        <Card className="p-0">
          {purchasesLoading ? (
            <p className="py-10 text-center text-sm text-ink-400">Đang tải…</p>
          ) : purchases.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-400">Chưa có đơn mua nào.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-ink-400">
                  <tr className="border-b border-ink-50">
                    <th className="px-5 py-3 font-semibold">Thời điểm</th>
                    <th className="px-5 py-3 font-semibold">Loại lượt</th>
                    <th className="px-5 py-3 text-right font-semibold">Số lượt</th>
                    <th className="px-5 py-3 text-right font-semibold">Số tiền</th>
                    <th className="px-5 py-3 font-semibold">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-50">
                  {purchases.map((item) => (
                    <tr key={item.id}>
                      <td className="whitespace-nowrap px-5 py-3 text-ink-600">{fmtDateTime(item.created_at)}</td>
                      <td className="px-5 py-3 text-ink-700">{POOL_LABELS[item.unit_type] ?? item.unit_type}</td>
                      <td className="px-5 py-3 text-right font-mono text-ink-700">
                        {item.credits.toLocaleString("vi-VN")}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-ink-900">
                        {item.price_vnd.toLocaleString("vi-VN")}đ
                      </td>
                      <td className="px-5 py-3">{purchaseStatusLabel(item.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {topupOpen && <CreditTopupDialog onClose={() => setTopupOpen(false)} />}
    </div>
  );
}

function BalanceCard({
  pool,
  value,
  used,
  note,
  onTopup,
}: {
  pool: CreditUnitType;
  value: number;
  used?: number;
  note?: string;
  onTopup: () => void;
}) {
  const unit = POOL_UNITS[pool];
  return (
    <Card className="flex items-center gap-4 p-5">
      <span className="flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Wallet className="size-6" />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-ink-400">{POOL_LABELS[pool]}</div>
        <div className="mt-0.5 text-3xl font-extrabold text-ink-900">{value.toLocaleString("vi-VN")}</div>
        {used !== undefined && (
          <div className="mt-0.5 text-xs text-ink-500">
            Đã tiêu tháng này: {used.toLocaleString("vi-VN")} {unit}
          </div>
        )}
        {note && <div className="mt-0.5 text-xs text-ink-400">{note}</div>}
        {value === 0 && (
          <button onClick={onTopup} className="mt-1 text-xs font-medium text-brand-600 hover:underline">
            Chưa có {unit} nào — mua thêm gói
          </button>
        )}
      </div>
    </Card>
  );
}

const seatDate = (iso: string) => new Date(iso).toLocaleDateString("vi-VN");

function SeatContractCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["smart-seat-contract"],
    queryFn: smartSeatApi.current,
  });

  if (isLoading) {
    return (
      <Card className="p-5">
        <p className="text-sm text-ink-400">Đang tải gói tài khoản…</p>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="p-5">
        <h2 className="text-sm font-bold text-ink-700">Gói tài khoản</h2>
        <p className="mt-1 text-sm text-ink-500">
          Trung tâm chưa có gói tài khoản — mọi lượt chấm đều trừ vào credit bên dưới. Liên hệ
          quản trị viên để đăng ký gói theo tài khoản học viên.
        </p>
      </Card>
    );
  }

  const { contract, student_count } = data;
  const quotas: { label: string; value: number }[] = [
    { label: "lượt Fulltest", value: contract.quota_fulltest },
    { label: "Part Speaking", value: contract.quota_speaking_part },
    { label: "câu Writing", value: contract.quota_writing_task },
  ].filter((q) => q.value > 0);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink-700">Gói tài khoản</h2>
          <p className="mt-0.5 text-[19px] font-bold text-ink-900">{contract.plan_name}</p>
        </div>
        <Badge tone={contract.status === "active" ? "success" : "gray"}>
          {contract.status === "active" ? "Đang hiệu lực" : contract.status === "expired" ? "Hết hạn" : "Đã huỷ"}
        </Badge>
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">Số tài khoản</dt>
          <dd className="mt-0.5 text-sm font-bold text-ink-800">
            {contract.seats.toLocaleString("vi-VN")}
            <span className="ml-1 font-medium text-ink-500">(đang dùng {student_count.toLocaleString("vi-VN")})</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">Kỳ hạn</dt>
          <dd className="mt-0.5 text-sm font-bold text-ink-800">
            {seatDate(contract.starts_at)} – {seatDate(contract.ends_at)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-400">
            Quota mỗi học viên / tháng
          </dt>
          <dd className="mt-0.5 text-sm font-bold text-ink-800">
            {quotas.length ? quotas.map((q) => `${q.value} ${q.label}`).join(" · ") : "Không kèm quota"}
          </dd>
        </div>
      </dl>

      {student_count > contract.seats && (
        <p className="mt-3 rounded-[10px] bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Trung tâm đang có {student_count} học viên, vượt {student_count - contract.seats} tài khoản so với hợp đồng.
        </p>
      )}
    </Card>
  );
}
