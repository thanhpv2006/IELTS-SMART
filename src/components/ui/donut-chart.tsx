"use client";

import { PieChart, Pie, Cell } from "recharts";

export type DonutSegment = { label: string; value: number; color: string };

type DonutChartProps = {
  data: DonutSegment[];
  size?: number;
  thickness?: number;
  centerValue?: React.ReactNode;
  centerSub?: string;
};

/** A simple donut chart (recharts) — matching the design at lines 3640–3660. */
export function DonutChart({
  data,
  size = 160,
  thickness = 22,
  centerValue,
  centerSub,
}: DonutChartProps) {
  const total = data.reduce((a, b) => a + b.value, 0);
  const radius = size / 2;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <PieChart width={size} height={size}>
        <Pie
          data={total > 0 ? data : [{ label: "—", value: 1, color: "#F2F4F7" }]}
          dataKey="value"
          cx="50%"
          cy="50%"
          innerRadius={radius - thickness}
          outerRadius={radius}
          startAngle={90}
          endAngle={-270}
          stroke="none"
          paddingAngle={total > 0 ? 1.5 : 0}
        >
          {(total > 0 ? data : [{ color: "#F2F4F7" }]).map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Pie>
      </PieChart>
      {(centerValue != null || centerSub) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {centerValue != null && (
            <span className="text-2xl font-bold leading-none text-ink-900">{centerValue}</span>
          )}
          {centerSub && <span className="mt-1 text-xs text-ink-500">{centerSub}</span>}
        </div>
      )}
    </div>
  );
}
