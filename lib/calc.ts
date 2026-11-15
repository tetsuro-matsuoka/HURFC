// 日付の扱い・集計（出席率、体重、Big3など）

import type { AbsenceReason, Category, LiftKey, Member, MetricDef, Members, MetricKey, Position, Practice, Unit } from "./types";

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

export const GRADES = [1, 2, 3, 4, 5];
// カテゴリー（タップするたびに 未設定 → レギュラー → ベンチ → ベンチ外 → 未設定 と切り替え）
export const CATEGORIES: Category[] = ["レギュラー", "ベンチ", "ベンチ外"];
export const nextCategory = (c: Category | null): Category | null => (c == null ? CATEGORIES[0] : CATEGORIES[CATEGORIES.indexOf(c) + 1] ?? null);
// 欠席理由（この順番でプルダウンに表示）
export const ABSENCE_REASONS: AbsenceReason[] = ["体調不良", "学校関連", "病院・リハビリ", "冠婚葬祭", "ずる休み", "その他"];
// 出欠の表示：「出席」/「欠席（体調不良）」/ 理由なしの欠席は「欠席」
export const attendLabel = (r: { attendance: string | null; absence_reason?: string | null } | undefined) =>
  !r?.attendance ? null : r.attendance === "欠席" && r.absence_reason ? `欠席（${r.absence_reason}）` : r.attendance;
// 期間内の欠席理由の内訳（例：「体調不良2・学校関連1」）
export function absenceSummary(m: Member, from: string, to: string): string {
  const cnt = new Map<string, number>();
  Object.entries(m.daily).forEach(([d, r]) => {
    if (d < from || d > to || r.attendance !== "欠席") return;
    const k = r.absence_reason ?? "理由未入力";
    cnt.set(k, (cnt.get(k) ?? 0) + 1);
  });
  return [...ABSENCE_REASONS, "理由未入力"]
    .filter((k) => cnt.has(k))
    .map((k) => `${k}${cnt.get(k)}`)
    .join("・");
}
// 画面で選べるポジション（上から FW → BK の順）
export const FW_POSITIONS: Position[] = ["PR", "HO", "LO", "FL", "No.8"];
export const BK_POSITIONS: Position[] = ["SH", "SO", "CTB", "WTB", "FB"];
export const POSITIONS: Position[] = [...FW_POSITIONS, ...BK_POSITIONS];
// FW / BK の自動判定（以前の区分「フロント・バックロー」は FW、「バックス」は BK）
export function unitOfPosition(p: Position | null | undefined): Unit | null {
  if (!p) return null;
  if (FW_POSITIONS.includes(p) || p === "フロント" || p === "バックロー") return "FW";
  if (BK_POSITIONS.includes(p) || p === "バックス") return "BK";
  return null;
}

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

/* ---------- 練習日と出欠席率 ---------- */
export function makePractice(days: string[]): Practice {
  return { days: new Set(days), months: new Set(days.map((d) => d.slice(0, 7))) };
}
export const EMPTY_PRACTICE: Practice = makePractice([]);

// その日の種類：practice＝練習日 / off＝オフ（その月は練習日を設定済みだが、この日は練習日でない）/ unset＝その月は未設定
export type DayKind = "practice" | "off" | "unset";
export function dayKind(d: string, p: Practice): DayKind {
  if (p.days.has(d)) return "practice";
  return p.months.has(d.slice(0, 7)) ? "off" : "unset";
}

// 出欠の集計（from〜to の期間。今日より後と、その選手の登録前は数えない）
//  ・練習日を設定した月：練習日すべてが対象（出席 / 欠席 / 未入力）
//  ・練習日が未設定の月：今までどおり、出欠を記録した日だけが対象
//  出席率＝出席日数÷対象日数、欠席率＝欠席日数÷対象日数（未入力は出席に含めない）
export type AttendStats = { yes: number; no: number; none: number; days: number; rate: number | null; absentRate: number | null };
// 出欠の対象日（日付順）。attendStats と同じルール
export function attendTargets(m: Member, p: Practice, from: string, to: string): string[] {
  const end = to < today() ? to : today();
  const start = from > m.joined ? from : m.joined;
  const cand = new Set<string>();
  p.days.forEach((d) => d >= start && d <= end && cand.add(d));
  Object.entries(m.daily).forEach(([d, r]) => {
    if (d >= start && d <= end && r.attendance && dayKind(d, p) === "unset") cand.add(d);
  });
  return [...cand].sort();
}

// 連続出席回数（対象日を新しい順にさかのぼって、出席が続いている回数。今日まだ未入力なら今日は飛ばす）
export function attendStreak(m: Member, p: Practice): number {
  const days = attendTargets(m, p, "0000-01-01", today()).reverse();
  let n = 0;
  for (const d of days) {
    const a = m.daily[d]?.attendance;
    if (d === today() && !a) continue;
    if (a !== "出席") break;
    n++;
  }
  return n;
}

export function attendStats(m: Member, p: Practice, from: string, to: string): AttendStats {
  const cand = attendTargets(m, p, from, to);
  let yes = 0,
    no = 0,
    none = 0;
  cand.forEach((d) => {
    const a = m.daily[d]?.attendance;
    if (a === "出席") yes++;
    else if (a === "欠席") no++;
    else none++;
  });
  const days = cand.length;
  return { yes, no, none, days, rate: days ? (yes / days) * 100 : null, absentRate: days ? (no / days) * 100 : null };
}

// 出席率（%）。days を指定すると直近◯日だけで計算
export function attendRate(m: Member, p: Practice, days?: number): number | null {
  return attendStats(m, p, days ? addDays(today(), -days + 1) : "0000-01-01", today()).rate;
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
export const monthAttendance = (m: Member, ym: string, p: Practice) => attendStats(m, p, ym + "-01", ym + "-31");
// その月の練習日数（設定した日すべて）
export const practiceCount = (p: Practice, ym: string) => [...p.days].filter((d) => d.startsWith(ym)).length;

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
// 筋トレ遂行率（0〜10）：週の月曜日が from 以降の週の点数の平均（入力のある週だけ）。from 省略で全期間
export function trainingRate(m: Member, from?: string): number | null {
  const v = Object.entries(m.training)
    .filter(([w]) => !from || w >= from)
    .map(([, s]) => s);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
// 月別の筋トレ遂行度：週の月曜日がその月に入る週の点数の平均（0〜10。入力のある週だけ）
export function trainingMonthAvg(m: Member, ym: string): number | null {
  const v = Object.entries(m.training)
    .filter(([w]) => w.slice(0, 7) === ym)
    .map(([, s]) => s);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
// その週のチーム平均
export function teamTrainingAvg(players: Member[], ws: string): number | null {
  const v = players.map((m) => m.training[ws]).filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/* ---------- 測定項目（項目設定） ---------- */
// 今までの入力欄の値を使う項目（key で判定）。測定画面に入力欄は出さない
//   weight=毎日の記録の体重 / bench_press・squat・deadlift=測定のBig3 / big3_total=Big3合計（自動計算）
export const LINKED_KEYS = ["weight", "bench_press", "squat", "deadlift", "big3_total"];
export const isLinked = (def: MetricDef) => def.key != null && LINKED_KEYS.includes(def.key);

// 単位の表示（空欄・「なし」は表示しない）
export const unitOf = (def: { unit: string }) => {
  const u = (def.unit ?? "").trim();
  return u === "" || u === "なし" ? "" : u;
};

export function metricSeries(m: Member, def: MetricDef): Point[] {
  if (def.key === "weight") return weights(m);
  if (def.key === "bench_press" || def.key === "squat" || def.key === "deadlift") {
    const k = def.key;
    return phys(m)
      .filter((r) => r[k] != null)
      .map((r) => ({ d: r.d, v: Number(r[k]) }));
  }
  if (def.key === "big3_total") return phys(m).map((r) => ({ d: r.d, v: rowTotal(r) })).filter((p) => p.v > 0);
  return Object.entries(m.metrics[def.id] ?? {})
    .map(([d, v]) => ({ d, v }))
    .sort((a, b) => (a.d < b.d ? -1 : 1));
}
export function metricLatest(m: Member, def: MetricDef): Point | null {
  const s = metricSeries(m, def);
  return s.length ? s[s.length - 1] : null;
}
// 自己ベスト（良い方向に合わせて最大 or 最小）
export function metricBest(m: Member, def: MetricDef): number | null {
  // Big3合計は、種目ごとの自己ベストの合計（ランキングと同じ考え方）
  if (def.key === "big3_total") return maxes(m).total;
  const v = metricSeries(m, def).map((p) => p.v);
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
// カテゴリごとの項目（項目設定の並び順）
export const metricsOf = (metrics: MetricDef[], c: MetricDef["category"]) => metrics.filter((x) => x.category === c);

/* ---------- 体重比（相対値） ---------- */
// 選手一覧に表示している値と、その記録日（体組成＝最新値 / フィジカル＝自己ベスト）
export function metricShownPoint(m: Member, def: MetricDef): Point | null {
  if (def.category === "体組成") return metricLatest(m, def);
  if (def.key === "big3_total") {
    // Big3合計＝種目ごとの自己ベストの合計。日付は、その中でいちばん新しい自己ベストの日
    const total = maxes(m).total;
    if (total == null) return null;
    const dates = LIFTS.map(([k]) => {
      const best = maxes(m)[k];
      return phys(m).find((r) => best != null && Number(r[k]) === best)?.d ?? "";
    }).filter(Boolean);
    return { d: dates.sort().pop() ?? today(), v: total };
  }
  const best = metricBest(m, def);
  if (best == null) return null;
  // 自己ベストを最初に出した日
  return metricSeries(m, def).find((p) => p.v === best) ?? null;
}
// その日時点の体重：同じ日の体重 → なければその日以前で最新 → それもなければ最新の体重
export function weightAt(m: Member, d: string): number | null {
  const w = weights(m);
  let v: number | null = null;
  for (const p of w) {
    if (p.d > d) break;
    v = p.v;
  }
  return v ?? (w.length ? w[w.length - 1].v : null);
}
// 体重比＝値 ÷ その記録日時点の体重（値・体重が無いか0なら null）
export function metricRatio(m: Member, def: MetricDef): number | null {
  const p = metricShownPoint(m, def);
  if (!p || !p.v) return null;
  const w = weightAt(m, p.d);
  return w ? p.v / w : null;
}
export const fmtRatio = (v: number | null | undefined) => (v == null || isNaN(v) ? "—" : v.toFixed(2));
