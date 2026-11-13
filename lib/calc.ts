// 日付の扱い・集計（出席率、体重、Big3など）

import type { LiftKey, Member, Members, MetricKey } from "./types";

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

// 選手一覧（名前順）
export const playersOf = (members: Members) =>
  Object.values(members)
    .filter((m) => m.role === "player")
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

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
