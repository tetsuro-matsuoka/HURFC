// データの読み書き（Supabase とのやりとりをここにまとめる）

import { supabase } from "./supabase";
import type { Attendance, Members, PhysRec, Position, Role } from "./types";

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
async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await sb()
      .from(table)
      .select(columns)
      .order("id")
      .range(from, from + size - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}

type UserRow = { id: string; name: string; role: Role; grade: number | null; position: Position | null; sort_order: number | null };
type DailyRow = { user_id: string; date: string; attendance: Attendance | null; weight: number | null };
type PhysRow = { user_id: string; date: string } & PhysRec;

// 全メンバーと記録を読み込み、画面で使う形に変換する
export async function loadAll(): Promise<Members> {
  const [users, daily, physical] = await Promise.all([
    fetchAll<UserRow>("users", "id,name,role,grade,position,sort_order"),
    fetchAll<DailyRow>("daily_records", "id,user_id,date,attendance,weight"),
    fetchAll<PhysRow>("physical_records", "id,user_id,date,bench_press,squat,deadlift"),
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
        sort_order: u.sort_order,
        daily: {},
        physical: {},
      }),
  );
  daily.forEach((r) => {
    if (m[r.user_id])
      m[r.user_id].daily[r.date] = {
        attendance: r.attendance,
        weight: r.weight == null ? null : Number(r.weight),
      };
  });
  physical.forEach((r) => {
    if (m[r.user_id])
      m[r.user_id].physical[r.date] = {
        bench_press: r.bench_press == null ? null : Number(r.bench_press),
        squat: r.squat == null ? null : Number(r.squat),
        deadlift: r.deadlift == null ? null : Number(r.deadlift),
      };
  });
  return m;
}

// 日次データの保存（同じ日付があれば上書き）
export async function saveDaily(userId: string, date: string, attendance: Attendance, weight: number | null) {
  const { error } = await sb()
    .from("daily_records")
    .upsert({ user_id: userId, date, attendance, weight }, { onConflict: "user_id,date" });
  if (error) throw error;
}

// フィジカルデータの保存（同じ日付があれば上書き）
export async function savePhysical(userId: string, date: string, rec: PhysRec) {
  const { error } = await sb()
    .from("physical_records")
    .upsert({ user_id: userId, date, ...rec }, { onConflict: "user_id,date" });
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
