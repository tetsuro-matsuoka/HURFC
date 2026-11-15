// 日付の扱い・集計（出席率、体重、Big3など）

import type { LiftKey, Member, MetricDef, Members, MetricKey, Position } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const addDays = (s: string, n: number) => {
  const d = new Date(s + "T00:00:00");
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const md = (s: string) => {
  const [, m, d] = s.split("-");
  return `${Number(m)}/${Number(d)}`;
};
export const wd = (s: string) => "日月火水木金土"[new Date(s + "T00:00:00").getDay()];
export const normName = (s: string) => String(s || "").replace(/[\s　]/g, "");
export const fmt1 = (v: number | null | undefined) =>
  v == null || isNaN(v) ? "—" : (Math.round(v * 10) / 10).toFixed(1);
// 小数第2位まで（末尾の0は省く）。スプリントのタイムなど
export const fmt2 = (v: number | null | undefined) =>
  v == null || isNaN(v) ? "—" : String(Math.round(v * 100) / 100);
export const fmt0 = (v: number | null | undefined) =>
  v == null || isNaN(v) ? "—" : String(Math.round(v * 10) / 10).replace(/\.0$/, "");

export const LIFTS: [LiftKey, string, string][] = [
  ["bench_press", "ベンチプレス", "BP"],
  ["squat", "スクワット", "SQ"],
  ["deadlift", "デッドリフト", "DL"],
];
export const METRICS: [MetricKey, string][] = [
  ["total", "Big3合計"],
  ["bench_press", "ベンチ"],
  ["squat", "スクワット"],
  ["deadlift", "デッド"],
  ["ratio", "体重比"],
];

export type Point = { d: string; v: number };

export const GRADES = [1, 2, 3, 4];
export const POSITIONS: Position[] = ["フロント", "バックロー", "バックス"];

// 選手の並び順：コーチが決めた順 → 学年が上の人 → 名前順
type Sortable = { name: string; grade: number | null; sort_order: number | null };
export function byOrder(a: Sortable, b: Sortable) {
  const sa = a.sort_order ?? Infinity,
    sb = b.sort_order ?? Infinity;
  if (sa !== sb) return sa - sb;
  const ga = a.grade ?? 0,
    gb = b.grade ?? 0;
  if (ga !== gb) return gb - ga;
  return a.name.localeCompare(b.name, "ja");
}

// 選手一覧（選手管理で決めた並び順）
export const playersOf = (members: Members) =>
  Object.values(members)
    .filter((m) => m.role === "player")
    .sort(byOrder);

// 出席率（%）。days を指定すると直近◯日だけで計算
export function attendRate(m: Member, days?: number): number | null {
  const from = days ? addDays(today(), -days + 1) : "0000";
  const e = Object.entries(m.daily).filter(([d, r]) => d >= from && r.attendance);
  if (!e.length) return null;
  return (e.filter(([, r]) => r.attendance === "出席").length / e.length) * 100;
}

// 体重の推移
export function weights(m: Member, days?: number): Point[] {
  const from = days ? addDays(today(), -days + 1) : "0000";
  return Object.entries(m.daily)
    .filter(([d, r]) => d >= from && r.weight != null)
    .map(([d, r]) => ({ d, v: Number(r.weight) }))
    .sort((a, b) => (a.d < b.d ? -1 : 1));
}
export const latestWeight = (m: Member): Point | null => {
  const w = weights(m);
  return w.length ? w[w.length - 1] : null;
};
// ◯日前時点の体重
export function weightAgo(m: Member, days: number): Point | null {
  const target = addDays(today(), -days);
  const w = weights(m).filter((x) => x.d <= target);
  return w.length ? w[w.length - 1] : null;
}

export type PhysRow = { d: string; bench_press: number | null; squat: number | null; deadlift: number | null };
export const phys = (m: Member): PhysRow[] =>
  Object.entries(m.physical)
    .map(([d, r]) => ({ d, ...r }))
    .sort((a, b) => (a.d < b.d ? -1 : 1));

export const rowTotal = (r: { bench_press: number | null; squat: number | null; deadlift: number | null }) =>
  (Number(r.bench_press) || 0) + (Number(r.squat) || 0) + (Number(r.deadlift) || 0);

// 自己ベスト（MAX）
export function maxes(m: Member): Record<MetricKey, number | null> {
  const p = phys(m);
  const mx = (k: LiftKey) => {
    const v = p.map((r) => Number(r[k])).filter((v) => v > 0);
    return v.length ? Math.max(...v) : null;
  };
  const bench_press = mx("bench_press"),
    squat = mx("squat"),
    deadlift = mx("deadlift");
  const total = (bench_press || 0) + (squat || 0) + (deadlift || 0) || null;
  const lw = latestWeight(m);
  const ratio = total && lw ? total / lw.v : null;
  return { bench_press, squat, deadlift, total, ratio };
}

export type RankRow = { id: string; name: string; v: number };
export function ranking(members: Members, key: MetricKey): RankRow[] {
  return playersOf(members)
    .map((m) => ({ id: m.id, name: m.name, v: maxes(m)[key] }))
    .filter((r): r is RankRow => r.v != null && r.v > 0)
    .sort((a, b) => b.v - a.v);
}

/* ---------- 月別の出欠 ---------- */
// ym: "YYYY-MM"
export const ymOf = (d: string) => d.slice(0, 7);
export function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export const ymLabel = (ym: string) => `${Number(ym.slice(0, 4))}年${Number(ym.slice(5, 7))}月`;
export function monthAttendance(m: Member, ym: string) {
  let yes = 0,
    no = 0;
  Object.entries(m.daily).forEach(([d, r]) => {
    if (ymOf(d) !== ym) return;
    if (r.attendance === "出席") yes++;
    else if (r.attendance === "欠席") no++;
  });
  return { yes, no, rate: yes + no ? (yes / (yes + no)) * 100 : null };
}

/* ---------- 筋トレ遂行度（週ごと・0〜10） ---------- */
// その日を含む週の月曜日
export function weekStart(d: string) {
  const day = new Date(d + "T00:00:00").getDay(); // 0=日
  return addDays(d, -((day + 6) % 7));
}
export const weekLabel = (ws: string) => `${md(ws)}〜${md(addDays(ws, 6))}`;
// 直近 n 週の月曜日（古い順）
export const recentWeeks = (n: number) => {
  const cur = weekStart(today());
  return Array.from({ length: n }, (_, i) => addDays(cur, -7 * (n - 1 - i)));
};
// 直近 n 週の平均点（入力のある週だけで計算）
export function trainingAvg(m: Member, n = 4): number | null {
  const v = recentWeeks(n)
    .map((w) => m.training[w])
    .filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
// その週のチーム平均
export function teamTrainingAvg(players: Member[], ws: string): number | null {
  const v = players.map((m) => m.training[ws]).filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/* ---------- 測定項目（項目設定で追加したもの） ---------- */
export function metricSeries(m: Member, id: number): Point[] {
  return Object.entries(m.metrics[id] ?? {})
    .map(([d, v]) => ({ d, v }))
    .sort((a, b) => (a.d < b.d ? -1 : 1));
}
export function metricLatest(m: Member, id: number): Point | null {
  const s = metricSeries(m, id);
  return s.length ? s[s.length - 1] : null;
}
// 自己ベスト（良い方向に合わせて最大 or 最小）
export function metricBest(m: Member, def: MetricDef): number | null {
  const v = metricSeries(m, def.id).map((p) => p.v);
  if (!v.length) return null;
  return def.better === "low" ? Math.min(...v) : Math.max(...v);
}
// 測定項目のランキング
export function metricRanking(members: Members, def: MetricDef): RankRow[] {
  return playersOf(members)
    .map((m) => ({ id: m.id, name: m.name, v: metricBest(m, def) }))
    .filter((r): r is RankRow => r.v != null)
    .sort((a, b) => (def.better === "low" ? a.v - b.v : b.v - a.v));
}

/* ---------- 体組成の計算（BMI・LBM・FFMI） ---------- */
// 身長（cm）・体脂肪率（%）は項目設定の「身長」「体脂肪率」の最新値を使う
export function bodyComp(m: Member, metrics: MetricDef[]) {
  const hDef = metrics.find((x) => x.key === "height");
  const fDef = metrics.find((x) => x.key === "body_fat");
  const w = latestWeight(m)?.v ?? null;
  const h = hDef ? metricLatest(m, hDef.id)?.v ?? null : null;
  const fat = fDef ? metricLatest(m, fDef.id)?.v ?? null : null;
  const hm = h ? h / 100 : null;
  const bmi = w && hm ? w / (hm * hm) : null;
  const lbm = w != null && fat != null ? w * (1 - fat / 100) : null; // 除脂肪体重（kg）
  const ffmi = lbm != null && hm ? lbm / (hm * hm) : null;
  return { weight: w, bmi, lbm, ffmi };
}
