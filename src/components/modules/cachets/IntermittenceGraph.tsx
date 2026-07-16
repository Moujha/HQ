import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";
import { format, subMonths, addDays, addMonths } from "date-fns";
import { fr } from "date-fns/locale";
import { GOAL_CACHETS, GOAL_HOURS, countValidHours, cachetCountFor, type PaymentForCachets } from "@/lib/cachets";

interface TimelinePoint {
  ts: number;
  confirmed: number;
  potential: number;
}

function countInWindow(
  payments: PaymentForCachets[],
  date: Date,
  statuses: readonly string[]
): number {
  const seen = new Set<string>();
  let total = 0;
  for (const p of payments) {
    if (!p.counts_for_intermittence) continue;
    if (!(statuses as string[]).includes(p.status)) continue;

    if (p.expires_at) {
      // expires_at is set by DB trigger as payment_date + 12 months
      const expiresAt = new Date(p.expires_at);
      if (expiresAt <= date) continue; // expired before this sample date
      // Exclude cachets earned after the sample date
      if (p.payment_date && new Date(p.payment_date) > date) continue;
    } else if (p.payment_date) {
      // Future/pending cachets without expires_at: use 12-month rolling window
      const pd = new Date(p.payment_date);
      const windowStart = subMonths(date, 12);
      if (pd < windowStart || pd > date) continue;
    } else {
      continue;
    }

    if (p.batch_id) {
      if (!seen.has(p.batch_id)) {
        seen.add(p.batch_id);
        total += cachetCountFor(p);
      }
    } else {
      total += cachetCountFor(p);
    }
  }
  return total;
}

const CONFIRMED_STATUSES = ["payé", "cachet_en_attente", "facturé"] as const;
const TBC_STATUSES = ["provisoire", "tbc"] as const;

function buildTimeline(payments: PaymentForCachets[]): TimelinePoint[] {
  const now = new Date();
  const start = subMonths(now, 13);
  const end = addMonths(now, 6);
  const STEP = 7; // weekly samples

  const points: TimelinePoint[] = [];
  let cur = start;
  while (cur <= end) {
    points.push({
      ts: cur.getTime(),
      confirmed: countInWindow(payments, cur, CONFIRMED_STATUSES),
      potential: countInWindow(payments, cur, TBC_STATUSES),
    });
    cur = addDays(cur, STEP);
  }
  // Always add an exact "today" point — with weekly sampling, the nearest
  // sampled point is never more than 3.5 days from now, so a distance-based
  // guard here would almost always skip this and let todayPoint (below)
  // pick a stale nearby sample instead of the true current count.
  points.push({
    ts: now.getTime(),
    confirmed: countInWindow(payments, now, CONFIRMED_STATUSES),
    potential: countInWindow(payments, now, TBC_STATUSES),
  });
  points.sort((a, b) => a.ts - b.ts);
  return points;
}

interface Props {
  count: number;
  payments: PaymentForCachets[];
}

export function IntermittenceGraph({ count, payments }: Props) {
  const hours = countValidHours(payments);
  const data = useMemo(() => buildTimeline(payments), [payments]);
  const todayTs = Date.now();

  const todayPoint = data.reduce((closest, d) =>
    Math.abs(d.ts - todayTs) < Math.abs(closest.ts - todayTs) ? d : closest
  );

  const maxY = Math.max(
    GOAL_CACHETS + 4,
    ...data.map((d) => d.confirmed + d.potential)
  );

  const tickFormatter = (ts: number) =>
    format(new Date(ts), "MMM yy", { locale: fr });

  const labelFormatter = (ts: number) =>
    format(new Date(ts), "d MMM yyyy", { locale: fr });

  return (
    <div className="rounded-2xl border border-border bg-card px-5 py-4 space-y-4">
      {/* Stats summary */}
      <div className="flex gap-6">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Cachets
          </p>
          <p className="mt-0.5 font-display text-2xl font-bold text-foreground leading-none">
            {count}
            <span className="text-sm font-normal text-muted-foreground"> / {GOAL_CACHETS}</span>
          </p>
          <div className="mt-1.5 h-1 w-20 rounded-full bg-border overflow-hidden">
            <div
              className="h-full rounded-full bg-green-400 transition-all duration-500"
              style={{ width: `${Math.min((count / GOAL_CACHETS) * 100, 100)}%` }}
            />
          </div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Heures
          </p>
          <p className="mt-0.5 font-display text-2xl font-bold text-foreground leading-none">
            {hours}
            <span className="text-sm font-normal text-muted-foreground"> h / {GOAL_HOURS} h</span>
          </p>
          <div className="mt-1.5 h-1 w-20 rounded-full bg-border overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-400 transition-all duration-500"
              style={{ width: `${Math.min((hours / GOAL_HOURS) * 100, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Timeline chart */}
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="gradConf" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4ade80" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradPot" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              opacity={0.5}
              vertical={false}
            />

            <XAxis
              dataKey="ts"
              type="number"
              domain={["dataMin", "dataMax"]}
              scale="time"
              tickFormatter={tickFormatter}
              tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              tickCount={7}
            />
            <YAxis
              domain={[0, maxY]}
              tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={28}
            />

            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 11,
              }}
              labelFormatter={(ts) => labelFormatter(ts as number)}
              formatter={(value: number, name: string) => [
                value,
                name === "confirmed" ? "Confirmés" : "TBC",
              ]}
            />

            {/* Goal line */}
            <ReferenceLine
              y={GOAL_CACHETS}
              stroke="#f59e0b"
              strokeDasharray="4 2"
              strokeWidth={1.5}
              label={{
                value: `Objectif ${GOAL_CACHETS}`,
                position: "insideTopRight",
                fontSize: 9,
                fill: "#f59e0b",
                dy: -4,
              }}
            />

            {/* Today line */}
            <ReferenceLine
              x={todayTs}
              stroke="var(--foreground)"
              strokeDasharray="2 2"
              strokeWidth={1}
              opacity={0.4}
            />

            {/* Today dot on confirmed curve */}
            <ReferenceDot
              x={todayPoint.ts}
              y={todayPoint.confirmed}
              r={5}
              fill="#4ade80"
              stroke="var(--card)"
              strokeWidth={2}
              label={{
                value: `${todayPoint.confirmed} auj.`,
                position: "top",
                fontSize: 9,
                fill: "#4ade80",
                dy: -4,
              }}
            />

            {/* Confirmed area (base layer) */}
            <Area
              type="monotone"
              dataKey="confirmed"
              stackId="cachets"
              stroke="#4ade80"
              strokeWidth={2}
              fill="url(#gradConf)"
              dot={false}
              activeDot={{ r: 3 }}
              name="confirmed"
            />

            {/* TBC area, stacked on top of confirmed — the combined top edge
                shows whether confirmed + TBC would reach the goal line */}
            <Area
              type="monotone"
              dataKey="potential"
              stackId="cachets"
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              fill="url(#gradPot)"
              dot={false}
              activeDot={{ r: 3 }}
              name="potential"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="h-0.5 w-5 rounded-full bg-green-400" />
          <span>Confirmés (payé, en attente, facturé)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="20" height="2" viewBox="0 0 20 2">
            <line
              x1="0" y1="1" x2="20" y2="1"
              stroke="#94a3b8" strokeWidth="1.5"
              strokeDasharray="4 2"
            />
          </svg>
          <span>TBC</span>
        </div>
      </div>
    </div>
  );
}
