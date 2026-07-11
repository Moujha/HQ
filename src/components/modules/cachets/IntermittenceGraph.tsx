import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { format, subDays, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { GOAL_CACHETS, GOAL_HOURS, countValidHours, type PaymentForCachets } from "@/lib/cachets";

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
  const windowStart = subDays(date, 365);
  const seen = new Set<string>();
  let total = 0;
  for (const p of payments) {
    if (!p.payment_date || !p.counts_for_intermittence) continue;
    if (!(statuses as string[]).includes(p.status)) continue;
    const pd = new Date(p.payment_date);
    if (pd < windowStart || pd > date) continue;
    if (p.batch_id) {
      if (!seen.has(p.batch_id)) {
        seen.add(p.batch_id);
        total += p.batch?.batch_count ?? 1;
      }
    } else {
      total += 1;
    }
  }
  return total;
}

const CONFIRMED_STATUSES = ["payé", "cachet_en_attente"] as const;
const ALL_STATUSES = ["payé", "cachet_en_attente", "provisoire"] as const;

function buildTimeline(payments: PaymentForCachets[]): TimelinePoint[] {
  const now = new Date();
  const start = subDays(now, 13 * 30); // ~13 months back
  const end = addDays(now, 6 * 30);    // ~6 months forward
  const STEP = 7;                       // weekly samples

  const points: TimelinePoint[] = [];
  let cur = start;
  while (cur <= end) {
    points.push({
      ts: cur.getTime(),
      confirmed: countInWindow(payments, cur, CONFIRMED_STATUSES),
      potential: countInWindow(payments, cur, ALL_STATUSES),
    });
    cur = addDays(cur, STEP);
  }
  // Ensure today is included
  const todayTs = now.getTime();
  if (!points.some((p) => Math.abs(p.ts - todayTs) < STEP * 86400000 * 0.5)) {
    points.push({
      ts: todayTs,
      confirmed: countInWindow(payments, now, CONFIRMED_STATUSES),
      potential: countInWindow(payments, now, ALL_STATUSES),
    });
    points.sort((a, b) => a.ts - b.ts);
  }
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

  const maxY = Math.max(
    GOAL_CACHETS + 4,
    ...data.map((d) => d.potential)
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
              stroke="hsl(var(--border))"
              opacity={0.5}
              vertical={false}
            />

            <XAxis
              dataKey="ts"
              type="number"
              domain={["dataMin", "dataMax"]}
              scale="time"
              tickFormatter={tickFormatter}
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              tickCount={7}
            />
            <YAxis
              domain={[0, maxY]}
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={28}
            />

            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 11,
              }}
              labelFormatter={(ts) => labelFormatter(ts as number)}
              formatter={(value: number, name: string) => [
                value,
                name === "confirmed" ? "Confirmés" : "Potentiels",
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
              stroke="hsl(var(--foreground))"
              strokeDasharray="2 2"
              strokeWidth={1}
              opacity={0.4}
              label={{
                value: "Aujourd'hui",
                position: "insideTopLeft",
                fontSize: 9,
                fill: "hsl(var(--muted-foreground))",
                dy: -4,
              }}
            />

            {/* Potential area (behind confirmed) */}
            <Area
              type="monotone"
              dataKey="potential"
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="4 2"
              fill="url(#gradPot)"
              dot={false}
              activeDot={{ r: 3 }}
              name="potential"
            />

            {/* Confirmed area (in front) */}
            <Area
              type="monotone"
              dataKey="confirmed"
              stroke="#4ade80"
              strokeWidth={2}
              fill="url(#gradConf)"
              dot={false}
              activeDot={{ r: 3 }}
              name="confirmed"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="h-0.5 w-5 rounded-full bg-green-400" />
          <span>Confirmés (payé + en attente)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="20" height="2" viewBox="0 0 20 2">
            <line
              x1="0" y1="1" x2="20" y2="1"
              stroke="#94a3b8" strokeWidth="1.5"
              strokeDasharray="4 2"
            />
          </svg>
          <span>Potentiels</span>
        </div>
      </div>
    </div>
  );
}
