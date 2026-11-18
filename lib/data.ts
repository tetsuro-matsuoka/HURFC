// データの読み書き（Supabase とのやりとりをここにまとめる）

import { supabase } from "./supabase";
import type { AbsenceReason, Attendance, Category, DayType, Menu, WeekSetting, WeightTiming, MetricCategory, MetricDef, Members, PhysRec, Position, Practice, Role } from "./types";
import { isMinSec, isMomentum, makePractice, pickSprint, ymd } from "./calc";

function sb() {
  if (!supabase) throw new Error("Supabase の設定がありません");
  return supabase;
}

// ログイン画面用：名前の一覧（パスワードは含まない）
export type LoginEntry = { name: string; login_email: string; role: Role };
export async function loadLoginList(): Promise<LoginEntry[]> {
  const { data, error } = await sb().rpc("login_members");
  if (error) throw error;
  return (data ?? []) as LoginEntry[];
}

// 1回で取れる件数に上限（1000件）があるため、分けて全件取得する
async function fetchAll<T>(table: string, columns: string, orderBy = "id"): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await sb()
      .from(table)
      .select(columns)
      .order(orderBy)
      .range(from, from + size - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}

type UserRow = { id: string; name: string; role: Role; grade: number | null; position: Position | null; sort_order: number | null; created_at: string; category?: Category | null };
type DailyRow = {
  user_id: string;
  date: string;
  attendance: Attendance | null;
  absence_reason?: AbsenceReason | null;
  weight: number | null;
  weight_timing?: WeightTiming | null;
  weight_time?: string | null;
};
type PhysRow = { user_id: string; date: string } & PhysRec;
type MetricRecRow = { user_id: string; metric_id: number; date: string; value: number };
type TrainingRow = { user_id: string; week_start: string; score: number };

// 全メンバーと記録を読み込み、画面で使う形に変換する
export async function loadAll(): Promise<Members> {
  const [users, daily, physical, mrec, training] = await Promise.all([
    // カテゴリーの欄（追加SQL その6）がまだ無い場合は、カテゴリーなしで読み込む
    fetchAll<UserRow>("users", "id,name,role,grade,position,sort_order,created_at,category").catch(() =>
      fetchAll<UserRow>("users", "id,name,role,grade,position,sort_order,created_at"),
    ),
    // 欠席理由の欄（追加SQL その5）がまだ無い場合は、欠席理由なしで読み込む
    // 新しく追加した欄（追加SQL その5・その8）がまだ無い場合は、無い欄を外して読み込む
    fetchAll<DailyRow>("daily_records", "id,user_id,date,attendance,absence_reason,weight,weight_timing,weight_time")
      .catch(() => fetchAll<DailyRow>("daily_records", "id,user_id,date,attendance,absence_reason,weight"))
      .catch(() => fetchAll<DailyRow>("daily_records", "id,user_id,date,attendance,weight")),
    fetchAll<PhysRow>("physical_records", "id,user_id,date,bench_press,squat,deadlift"),
    // 追加SQL（2026-11）が未実行でもアプリが止まらないよう、読めなければ空として扱う
    fetchAll<MetricRecRow>("metric_records", "id,user_id,metric_id,date,value").catch(() => []),
    fetchAll<TrainingRow>("training_records", "id,user_id,week_start,score").catch(() => []),
  ]);
  const m: Members = {};
  users.forEach(
    (u) =>
      (m[u.id] = {
        id: u.id,
        name: u.name,
        role: u.role,
        grade: u.grade,
        position: u.position,
        category: u.category ?? null,
        sort_order: u.sort_order,
        joined: ymd(new Date(u.created_at)),
        daily: {},
        physical: {},
        metrics: {},
        training: {},
      }),
  );
  mrec.forEach((r) => {
    const mm = m[r.user_id];
    if (!mm) return;
    (mm.metrics[r.metric_id] ??= {})[r.date.slice(0, 10)] = Number(r.value);
  });
  training.forEach((r) => {
    if (m[r.user_id]) m[r.user_id].training[r.week_start] = Number(r.score);
  });
  daily.forEach((r) => {
    if (m[r.user_id])
      m[r.user_id].daily[r.date.slice(0, 10)] = {
        attendance: r.attendance,
        absence_reason: r.attendance === "欠席" ? r.absence_reason ?? null : null,
        weight_timing: r.weight_timing ?? null,
        weight_time: r.weight_time ?? null,
        weight: r.weight == null ? null : Number(r.weight),
      };
  });
  physical.forEach((r) => {
    if (m[r.user_id])
      m[r.user_id].physical[r.date.slice(0, 10)] = {
        bench_press: r.bench_press == null ? null : Number(r.bench_press),
        squat: r.squat == null ? null : Number(r.squat),
        deadlift: r.deadlift == null ? null : Number(r.deadlift),
      };
  });
  // 出席率を数え始める日（入部日）＝「登録した日」と「いちばん古い記録の日」の早いほう
  // ※ 必ず出欠の記録（daily）を読み込んだ「後」で決める。前で決めると記録が0件の状態で判定され、
  //    登録日より前の練習日（例：登録 11/12 → 11/11）に後から入力した出席が集計から漏れていた
  Object.values(m).forEach((mm) => {
    const first = Object.keys(mm.daily).sort()[0];
    if (first && first < mm.joined) mm.joined = first;
  });
  return m;
}

// 日次データの保存（同じ日付があれば上書き）
// attendance が null のとき：オフの日（練習日ではない日）に体重だけ記録する場合
// 欠席理由は「欠席」のときだけ保存し、出席・オフのときは空（null）にする
export async function saveDaily(
  userId: string,
  date: string,
  attendance: Attendance | null,
  weight: number | null,
  absenceReason: AbsenceReason | null = null,
  timing: { weight_timing: WeightTiming | null; weight_time: string | null } = { weight_timing: null, weight_time: null },
) {
  const absence_reason = attendance === "欠席" ? absenceReason : null;
  const base = { user_id: userId, date, attendance, weight };
  // 新しい欄がまだデータベースに無い場合に備えて、多い順に試す（無い欄は外して保存し直す）
  const tries: Record<string, unknown>[] = [
    { ...base, absence_reason, ...timing },
    { ...base, absence_reason },
    base,
  ];
  let last: { message?: string; code?: string } | null = null;
  for (const [i, row] of tries.entries()) {
    const { error } = await sb().from("daily_records").upsert(row, { onConflict: "user_id,date" });
    // 戻り値 timingSaved：測った時間を保存できたか（データベースに欄が無く、外して保存した場合は false）
    if (!error) {
      // 保存できたかを読み直して確認（出欠が入っていない／日付が違う などを見逃さないため）
      const { data: back, error: e2 } = await sb()
        .from("daily_records")
        .select("date,attendance,weight")
        .eq("user_id", userId)
        .eq("date", date)
        .maybeSingle();
      if (e2) throw e2;
      if (!back) throw new Error(`${date} の記録が見つかりません（保存の権限を確認してください）`);
      if ((back.attendance ?? null) !== (attendance ?? null)) {
        throw new Error(`${date} の出欠が保存されていません（保存した値：${back.attendance ?? "空"}）`);
      }
      return { timingSaved: i === 0 };
    }
    last = error;
    const missingColumn =
      error.code === "PGRST204" || error.code === "42703" || /absence_reason|weight_timing|weight_time/.test(error.message ?? "");
    if (!missingColumn) break;
  }
  throw last;
}

// 保存に失敗したときに画面に出す文（原因が分かるように、Supabase からのメッセージも添える）
export function saveErrorText(e: unknown): string {
  const err = e as { message?: string; code?: string } | null;
  const msg = err?.message ?? "";
  if (!msg || /fetch|network|Failed to/i.test(msg)) return "保存に失敗しました。通信を確認してください";
  if (/row-level security|permission denied/i.test(msg)) return "保存に失敗しました（保存する権限がありません）。コーチに連絡してください";
  return `保存に失敗しました（原因：${msg}${err?.code ? ` / ${err.code}` : ""}）。この文をコーチに伝えてください`;
}

// フィジカルデータの保存（同じ日付があれば上書き）
export async function savePhysical(userId: string, date: string, rec: PhysRec) {
  const { error } = await sb()
    .from("physical_records")
    .upsert({ user_id: userId, date, ...rec }, { onConflict: "user_id,date" });
  if (error) throw error;
}

// 測定項目と設定（評価基準の説明文など）の読み込み
export type Meta = { metrics: MetricDef[]; settings: Record<string, string>; practice: Practice; weeks: Record<string, WeekSetting> };
export async function loadMeta(): Promise<Meta> {
  const [metrics, settings, practice, weeks] = await Promise.all([
    // 体重比の設定（追加SQL その7）がまだ無い場合は、体重比なしで読み込む
    fetchAll<MetricDef>("metrics", "id,key,name,unit,category,better,sort_order,show_ratio")
      .catch(() => fetchAll<MetricDef>("metrics", "id,key,name,unit,category,better,sort_order"))
      .catch(() => []),
    fetchAll<{ key: string; value: string }>("app_settings", "key,value", "key").catch(() => []),
    // 追加SQL（その4）が未実行なら「練習日の設定なし」として扱う
    //   活動の種類（追加SQL その10）が未実行なら、すべて「練習」として読む
    fetchAll<{ date: string; kind?: DayType | null }>("practice_days", "date,kind", "date")
      .catch(() => fetchAll<{ date: string; kind?: DayType | null }>("practice_days", "date", "date"))
      .catch(() => []),
    // 週ごとの設定（追加SQL その9）が未実行なら「設定なし」
    fetchAll<{ week_start: string; practice_days: number | null; menu: Menu | null }>("week_settings", "week_start,practice_days,menu", "week_start").catch(
      () => [],
    ),
  ]);
  const weekMap: Record<string, WeekSetting> = Object.fromEntries(weeks.map((w) => [w.week_start, { days: w.practice_days, menu: w.menu }]));
  metrics.forEach((x) => {
    x.show_ratio = x.show_ratio === true;
    if (isMinSec(x)) x.better = "low"; // タイム種目（分:秒）は小さいほど上位
  });
  // スプリントモメンタムは、体重とスプリントタイムから自動計算（大きいほど上位）
  const sprint = pickSprint(metrics);
  metrics.forEach((x) => {
    if (isMomentum(x) && sprint) {
      x.derived = sprint;
      x.better = "high";
    }
  });
  metrics.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  return {
    metrics,
    settings: Object.fromEntries(settings.map((x) => [x.key, x.value])),
    // 週ごとの練習日数の設定は使わない（出席率はカレンダーの練習日で計算）
    practice: makePractice(
      practice.map((x) => x.date.slice(0, 10)),
      new Map(),
      new Map(practice.map((x) => [x.date.slice(0, 10), (x.kind ?? "練習") as DayType])),
    ),
    weeks: weekMap,
  };
}

// 週ごとの設定から「練習日数を設定した週」だけを取り出す
export const weekDaysOf = (weeks: Record<string, WeekSetting>) =>
  new Map(Object.entries(weeks).flatMap(([ws, w]) => (w.days != null ? [[ws, w.days] as [string, number]] : [])));

// 週ごとの設定を保存（コーチのみ。データベース側の権限でも確認）
export async function saveWeekSetting(weekStart: string, v: WeekSetting) {
  const { error } = await sb().from("week_settings").upsert({ week_start: weekStart, practice_days: v.days, menu: v.menu, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// 日程の設定（コーチのみ。データベース側の権限でも確認）。kind が null ならオフ（行を消す）
export async function setPracticeDay(date: string, kind: DayType | null) {
  if (!kind) {
    const { error } = await sb().from("practice_days").delete().eq("date", date);
    if (error) throw error;
    return;
  }
  const { error } = await sb().from("practice_days").upsert({ date, kind }, { onConflict: "date" });
  if (!error) return;
  // 種類の列（追加SQL その10）がまだ無いときは、「練習」だけ今までどおり保存できる
  const noCol = error.code === "PGRST204" || error.code === "42703" || /kind/.test(error.message ?? "");
  if (noCol && kind === "練習") {
    const r = await sb().from("practice_days").upsert({ date }, { onConflict: "date" });
    if (r.error) throw r.error;
    return;
  }
  throw error;
}

// 測定項目の記録を保存（value が null ならその日の記録を消す）
export async function saveMetricValues(userId: string, date: string, values: { metricId: number; value: number | null }[]) {
  const up = values.filter((v) => v.value != null).map((v) => ({ user_id: userId, metric_id: v.metricId, date, value: v.value }));
  const del = values.filter((v) => v.value == null).map((v) => v.metricId);
  if (up.length) {
    const { error } = await sb().from("metric_records").upsert(up, { onConflict: "user_id,metric_id,date" });
    if (error) throw error;
  }
  if (del.length) {
    const { error } = await sb().from("metric_records").delete().eq("user_id", userId).eq("date", date).in("metric_id", del);
    if (error) throw error;
  }
}

// 筋トレ遂行度の保存（同じ週があれば上書き）
export async function saveTraining(userId: string, weekStart: string, score: number) {
  const { error } = await sb()
    .from("training_records")
    .upsert({ user_id: userId, week_start: weekStart, score }, { onConflict: "user_id,week_start" });
  if (error) throw error;
}

// ---- 項目設定（コーチのみ。データベース側の権限でも確認）----
export type MetricInput = { name: string; unit: string; category: MetricCategory; better: "high" | "low"; show_ratio: boolean };
// 体重比の欄（追加SQL その7）がまだ無いときは、その欄を外してもう一度保存する
const withoutRatio = ({ show_ratio: _r, ...rest }: Partial<MetricInput>) => rest; // eslint-disable-line @typescript-eslint/no-unused-vars
const noRatioColumn = (e: { message?: string } | null) => !!e?.message?.includes("show_ratio");
export async function addMetric(v: MetricInput, sortOrder: number) {
  let { error } = await sb().from("metrics").insert({ ...v, sort_order: sortOrder });
  if (noRatioColumn(error)) ({ error } = await sb().from("metrics").insert({ ...withoutRatio(v), sort_order: sortOrder }));
  if (error) throw error;
}
export async function updateMetric(id: number, v: Partial<MetricInput>) {
  let { error } = await sb().from("metrics").update(v).eq("id", id);
  if (noRatioColumn(error)) {
    if (Object.keys(withoutRatio(v)).length === 0) throw new Error("体重比の設定を保存できません。データベースの更新（追加SQL その7）が済んでいるか確認してください");
    ({ error } = await sb().from("metrics").update(withoutRatio(v)).eq("id", id));
  }
  if (error) throw error;
}
// 項目の並び順を保存（ids の順に 0, 1, 2, …）
export async function saveMetricOrder(ids: number[]) {
  const res = await Promise.all(ids.map((id, i) => sb().from("metrics").update({ sort_order: i }).eq("id", id)));
  const bad = res.find((r) => r.error);
  if (bad?.error) throw bad.error;
}
export async function deleteMetric(id: number) {
  const { error } = await sb().from("metrics").delete().eq("id", id);
  if (error) throw error;
}
export async function saveSetting(key: string, value: string) {
  const { error } = await sb().from("app_settings").upsert({ key, value });
  if (error) throw error;
}

// コーチ専用の操作（メンバー追加・編集・並び替え・削除・初期設定）と選手のログインはサーバー側で実行
export async function adminCall(action: string, payload: Record<string, unknown>) {
  const { data } = await sb().auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch("/api/admin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error || "処理に失敗しました");
  return json;
}
