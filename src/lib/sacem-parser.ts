export type SupportType = "streaming" | "plateforme_web" | "live" | "radio_tv" | "sync" | "autre";

export interface SacemParsedLine {
  sacem_code: string;
  raw_title: string;
  support_type: SupportType;
  amount: number;
}

export interface SacemParseResult {
  repartition: string;
  periods: string[];
  lines: SacemParsedLine[];
  total: number;
}

function parseAmount(raw: string): number {
  return parseFloat(raw.replace(",", ".").trim()) || 0;
}

function mapSupportType(famille: string, typeUtil: string): SupportType {
  const f = famille.trim().toLowerCase();
  const t = typeUtil.trim().toLowerCase();
  if (f === "online" && t === "streaming") return "streaming";
  if (f === "online" && t === "plateforme web") return "plateforme_web";
  if (f === "spectacle") return "live";
  if (f === "radiodiffusion") return "radio_tv";
  if (f === "synchronisation") return "sync";
  return "autre";
}

export function parseSacemCsv(csvText: string): SacemParseResult {
  const allLines = csvText.split("\n");
  const dataLines = allLines.slice(1).filter((l) => l.trim());

  let repartition = "";
  const periodSet = new Set<string>();
  const grouped = new Map<string, SacemParsedLine>();

  for (const line of dataLines) {
    const cols = line.split(";");
    if (cols.length < 41) continue;

    const rep = cols[0].trim();
    if (rep && !repartition) repartition = rep;

    const raw_title = cols[1].trim();
    const sacem_code = cols[2].trim();
    const famille = cols[5].trim();
    const typeUtil = cols[6].trim();
    const period = cols[9].trim();
    const amountRaw = cols[40].trim();

    if (!sacem_code || !amountRaw) continue;
    if (period) periodSet.add(period);

    const support_type = mapSupportType(famille, typeUtil);
    const amount = parseAmount(amountRaw);
    const key = `${sacem_code}|${support_type}`;

    const existing = grouped.get(key);
    if (existing) {
      existing.amount = Math.round((existing.amount + amount) * 1000000) / 1000000;
    } else {
      grouped.set(key, { sacem_code, raw_title, support_type, amount });
    }
  }

  const lines = Array.from(grouped.values())
    .filter((l) => l.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const total = Math.round(lines.reduce((sum, l) => sum + l.amount, 0) * 100) / 100;

  return { repartition, periods: Array.from(periodSet), lines, total };
}
