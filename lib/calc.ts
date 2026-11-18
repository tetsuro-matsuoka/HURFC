// 日付の扱い・集計（出席率、体重、Big3など）

import type { AbsenceReason, Category, Menu, WeightTiming, LiftKey, Member, MetricDef, Members, MetricKey, Position, Practice, Unit, DayType } from "./types";

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
// 体重の測定タイミング（この順でボタンに表示）
export const WEIGHT_TIMINGS: WeightTiming[] = ["朝（起床後）", "練習前", "練習後", "夜（就寝前）"];
const TIMING_SHORT: Record<WeightTiming, string> = { "朝（起床後）": "朝", 練習前: "練習前", 練習後: "練習後", "夜（就寝前）": "夜" };
// 体重の横に小さく付ける文字：「（朝）」「（練習後）」。タイミングが無ければ空（時刻は表示しない）
export const weightNote = (r: { weight_timing?: WeightTiming | null } | undefined) =>
  r?.weight_timing ? `（${TIMING_SHORT[r.weight_timing]}）` : "";
// 吹き出し用：「朝（起床後）」「練習後」のようにタイミング名だけ（時刻は表示しない）。記録が無ければ「時間未記録」
export const timingText = (r: { weight_timing?: WeightTiming | null } | undefined) => r?.weight_timing ?? "時間未記録";
// 出欠の表示：「出席」/「欠席（体調不良）」/ 理由なしの欠席は「欠席」
export const attendLabel = (r: { attendance: string | null; absence_reason?: string | null } | undefined) =>
  !r?.attendance ? null : r.attendance === "欠席" && r.absence_reason ? `欠席（${r.absence_reason}）` : r.attendance;
// 期間内の欠席理由ごとの回数（全選手の合計）。多い順。from 省略で全期間
// only：数える日を絞る（例：試合の日だけ）
export function absenceCounts(players: Member[], from: string | null, to: string, only?: (d: string) => boolean): { reason: string; n: number }[] {
  const cnt = new Map<string, number>();
  players.forEach((m) =>
    Object.entries(m.daily).forEach(([d, r]) => {
      if ((from && d < from) || d > to || r.attendance !== "欠席" || (only && !only(d))) return;
      const k = r.absence_reason ?? "理由未入力";
      cnt.set(k, (cnt.get(k) ?? 0) + 1);
    }),
  );
  return [...ABSENCE_REASONS, "理由未入力"].map((reason) => ({ reason, n: cnt.get(reason) ?? 0 })).sort((a, b) => b.n - a.n);
}
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
// weekDays：コーチが週ごとに設定した練習日数 { その週の月曜日: 日数 }
// kinds：日付ごとの活動の種類（ない日は「練習」）
export function makePractice(days: string[], weekDays: Map<string, number> = new Map(), kinds: Map<string, DayType> = new Map()): Practice {
  return { days: new Set(days), months: new Set(days.map((d) => d.slice(0, 7))), weekDays, kinds };
}
// 活動の種類（日程調整でタップするたびに 練習 → 試合 → 合同練習 → オフ の順）
export const DAY_TYPES: DayType[] = ["練習", "試合", "合同練習"];
// その日の種類。設定していない日は null
export const dayType = (d: string, p: Practice): DayType | null => (p.days.has(d) ? p.kinds.get(d) ?? "練習" : null);
// 期間内の、種類ごとの欠席回数（全選手の合計）。from が null なら全期間
export function absenceByType(players: Member[], p: Practice, from: string | null, to: string): Record<DayType, number> {
  const c: Record<DayType, number> = { 練習: 0, 試合: 0, 合同練習: 0 };
  players.forEach((m) =>
    Object.entries(m.daily).forEach(([d, r]) => {
      if ((from && d < from) || d > to || r.attendance !== "欠席") return;
      const t = dayType(d, p);
      if (t) c[t]++;
    }),
  );
  return c;
}
export const EMPTY_PRACTICE: Practice = makePractice([]);

// その日の種類：practice＝練習日 / off＝オフ（その月は練習日を設定済みだが、この日は練習日でない）/ unset＝その月は未設定
export type DayKind = "practice" | "off" | "unset";
export function dayKind(d: string, p: Practice): DayKind {
  if (p.days.has(d)) return "practice";
  // 週の練習日数を設定した週は、どの日でも出欠を入力できるようにする（オフ扱いにしない）
  if (p.weekDays.has(weekStart(d))) return "unset";
  return p.months.has(d.slice(0, 7)) ? "off" : "unset";
}

// 筋トレメニュー構成（未設定の週は A〜C）
export const MENUS: Menu[] = ["A〜B", "A〜C", "A〜D"];
export const DEFAULT_MENU: Menu = "A〜C";
export const menuItems = (menu: Menu) => ["A", "B", "C", "D"].slice(0, menu === "A〜B" ? 2 : menu === "A〜C" ? 3 : 4);
export const menuLabel = (menu: Menu) => menuItems(menu).join("・"); // 例：「A・B・C」
// 筋トレ遂行率の評価基準の保存先（項目設定）。A〜C は以前からの基準をそのまま使う
export const CRITERIA_KEY: Record<Menu, string> = { "A〜B": "training_criteria_ab", "A〜C": "training_criteria", "A〜D": "training_criteria_ad" };
export const MENU_TIMES: Record<Menu, string> = { "A〜B": "週2回", "A〜C": "週3回", "A〜D": "週4回" };

// その週の練習日数（コーチが設定していればその日数、なければカレンダーの練習日の数）
export function weekPracticeCount(p: Practice, ws: string): number {
  const set = p.weekDays.get(ws);
  if (set != null) return set;
  let n = 0;
  for (let i = 0; i < 7; i++) if (p.days.has(addDays(ws, i))) n++;
  return n;
}

// 出欠の集計（from〜to の期間。今日より後と、その選手の登録前は数えない）
//  ・コーチが「週の練習日数」を設定した週：その日数が分母（下の attendStats を参照）
//  ・練習日を設定した月：練習日すべてが対象（出席 / 欠席 / 未入力）
//  ・練習日が未設定の月：今までどおり、出欠を記録した日だけが対象
//  出席率＝出席日数÷対象日数、欠席率＝欠席日数÷対象日数（未入力は出席に含めない）
export type AttendStats = { yes: number; no: number; none: number; days: number; rate: number | null; absentRate: number | null };
// 出欠の対象日（日付順。出欠の履歴・連続出席に使う）
// 週の練習日数を設定した週は、カレンダーの練習日＋出欠を記録した日
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

// 週の練習日数を設定した週の数え方（その週の月曜日が期間内の週）：
//  分母＝設定した日数（今週はまだ途中なので「設定した日数」と「今日までの日数」の少ない方）
//  出席＝その週の出席日数（分母が上限）、欠席＝欠席日数（残りが上限）、未入力＝残り
export function attendStats(m: Member, p: Practice, from: string, to: string): AttendStats {
  const end = to < today() ? to : today();
  const cand = attendTargets(m, p, from, to).filter((d) => !p.weekDays.has(weekStart(d)));
  let yes = 0,
    no = 0,
    none = 0;
  cand.forEach((d) => {
    const a = m.daily[d]?.attendance;
    if (a === "出席") yes++;
    else if (a === "欠席") no++;
    else none++;
  });
  let days = cand.length;
  p.weekDays.forEach((n, ws) => {
    const sun = addDays(ws, 6);
    if (ws < from || ws > end || sun < m.joined) return;
    const elapsed = Math.min(7, Math.round((new Date(end + "T00:00:00").getTime() - new Date(ws + "T00:00:00").getTime()) / 86400000) + 1);
    const total = Math.min(n, elapsed);
    let y = 0,
      x = 0;
    for (let i = 0; i < 7; i++) {
      const a = m.daily[addDays(ws, i)]?.attendance;
      if (a === "出席") y++;
      else if (a === "欠席") x++;
    }
    y = Math.min(y, total);
    x = Math.min(x, total - y);
    yes += y;
    no += x;
    none += total - y - x;
    days += total;
  });
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
// 週の表記（月曜〜日曜）：「11月16日〜11月22日」/ 狭い場所用「11/16〜11/22」
const mdJ = (s: string) => `${Number(s.slice(5, 7))}月${Number(s.slice(8, 10))}日`;
export const weekLabel = (ws: string) => `${mdJ(ws)}〜${mdJ(addDays(ws, 6))}`;
export const weekShort = (ws: string) => `${md(ws)}〜${md(addDays(ws, 6))}`;
// サマリーに出す週：直近で終わった週（前週の月曜〜日曜）。
// 前週の記録がないときは、記録がある一番新しい週（今週も含む）。記録が1件もなければ前週（— を表示）
export function summaryWeek(training: Record<string, number>, d = today()) {
  const prev = addDays(weekStart(d), -7);
  if (training[prev] != null) return prev;
  const cur = weekStart(d);
  const done = Object.keys(training).filter((w) => w <= cur && training[w] != null).sort();
  return done.length ? done[done.length - 1] : prev;
}
// 直近 n 週の月曜日（古い順）
export const recentWeeks = (n: number) => {
  const cur = weekStart(today());
  return Array.from({ length: n }, (_, i) => addDays(cur, -7 * (n - 1 - i)));
};
// チーム全体のサマリー週：全選手の記録をまとめて summaryWeek と同じ決め方（コーチ画面用）
export function teamSummaryWeek(players: Member[], d = today()) {
  const all: Record<string, number> = {};
  players.forEach((m) => Object.entries(m.training).forEach(([w, v]) => v != null && (all[w] = v)));
  return summaryWeek(all, d);
}
// 直近で終わった n 週（前週まで。進行中の今週は含めない）の月曜日（古い順）
export const doneWeeks = (n: number) => {
  const prev = addDays(weekStart(today()), -7);
  return Array.from({ length: n }, (_, i) => addDays(prev, -7 * (n - 1 - i)));
};
// 直近で終わった n 週の平均点（入力のある週だけで計算。進行中の今週は含めない）
export function trainingAvg(m: Member, n = 4): number | null {
  const v = doneWeeks(n)
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

// タイム種目（分:秒）：単位が「分:秒」または種目名に「ブロンコ」を含む。値は総秒数で保存し、小さいほど上位
export const isMinSec = (def: { name: string; unit: string }) => /^分\s*[:：]\s*秒$/.test((def.unit ?? "").trim()) || def.name.includes("ブロンコ");
// 秒数 → 「4:50」（マイナスは差の表示用：「-0:05」）
export function fmtMinSec(sec: number | null | undefined): string {
  if (sec == null || isNaN(sec)) return "—";
  const sign = sec < 0 ? "-" : "";
  const t = Math.round(Math.abs(sec));
  return `${sign}${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
// 項目の値の表示（タイム種目は 4:50、それ以外は小数第2位まで）
// 自動計算の項目（スプリントモメンタム）は小数第1位
export const fmtMetric = (def: { name: string; unit: string; derived?: unknown }, v: number | null | undefined) =>
  isMinSec(def) ? fmtMinSec(v) : def.derived ? fmt1(v) : fmt2(v);

// 単位の表示（空欄・「なし」は表示しない。タイム種目は 4:50 で分かるので単位を出さない）
export const unitOf = (def: { name: string; unit: string }) => {
  if (isMinSec(def)) return "";
  const u = (def.unit ?? "").trim();
  return u === "" || u === "なし" ? "" : u;
};

// スプリントモメンタム（自動計算）：名前に「モメンタム」を含む項目
export const isMomentum = (def: { name: string }) => def.name.includes("モメンタム");
// 基準にするスプリント項目を選ぶ：項目名に「30m」「10m」を含むフィジカルの項目（両方あれば 30m を優先）
export function pickSprint(metrics: MetricDef[]): { sprintId: number; dist: number } | undefined {
  const c = metrics
    .filter((x) => !isMomentum(x) && x.category === "フィジカル")
    .map((x) => ({ x, dist: Number(x.name.match(/(\d+(?:\.\d+)?)\s*[mｍＭM](?![a-zA-Z])/)?.[1]) }));
  const pick = c.find((y) => y.dist === 30) ?? c.find((y) => y.dist === 10);
  return pick ? { sprintId: pick.x.id, dist: pick.dist } : undefined;
}

export function metricSeries(m: Member, def: MetricDef): Point[] {
  if (def.key === "weight") return weights(m);
  if (def.derived) {
    // スプリントモメンタム＝その日の体重(kg) × 距離(m) ÷ その日のタイム(秒)
    // 体重は「スプリントを測った日と同じ日付」の記録だけを使う（別の日の体重は使わない。無ければ計算しない＝—）
    // 日付は年月日（YYYY-MM-DD）だけで比べる
    const { sprintId, dist } = def.derived;
    const sameDayWeight = new Map(
      Object.entries(m.daily)
        .filter(([, r]) => r.weight != null && r.weight > 0)
        .map(([d, r]) => [d.slice(0, 10), Number(r.weight)]),
    );
    return Object.entries(m.metrics[sprintId] ?? {})
      .map(([d, t]) => {
        const day = d.slice(0, 10);
        const w = sameDayWeight.get(day);
        return w && t > 0 ? { d: day, v: (w * dist) / t } : null;
      })
      .filter((p): p is Point => p != null)
      .sort((a, b) => (a.d < b.d ? -1 : 1));
  }
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

/* ---------- グラフの縦軸：キリの良い目盛り ---------- */
// lo〜hi を、1・2・2.5・5 × 10のべき乗 の間隔で区切る（例：350, 400, 450 / 70, 70.5, 71）
// 返り値：目盛りに合わせて広げた lo・hi、目盛りの値、表示する小数の桁数
export function niceScale(lo: number, hi: number, n = 3) {
  const raw = (hi - lo) / n || 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  const a = Math.floor(lo / step + 1e-9) * step,
    b = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = a; v <= b + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  const str = String(Number(step.toFixed(10)));
  const dec = str.includes(".") ? str.split(".")[1].length : 0;
  return { lo: a, hi: b, ticks, dec };
}
