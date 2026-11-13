// サーバー側で行う操作の窓口
// ・setup        : 最初のコーチ作成（メンバーが0人のときだけ）＋サンプルデータ投入
// ・player_login : 選手のログイン（選手は合言葉なし。名前だけでログインできる）
// --- ここから下はコーチのみ ---
// ・add     : メンバー追加（選手：名前・学年・ポジション / コーチ：名前・合言葉）
// ・update  : 選手の名前・学年・ポジションの変更
// ・reorder : 選手の並び順の変更
// ・delete  : メンバー削除（その人の記録も消えます）
// 秘密鍵（SUPABASE_SECRET_KEY）はこのサーバー側でのみ使い、ブラウザには送りません。

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateSample } from "@/lib/sample";
import { byOrder, GRADES, POSITIONS } from "@/lib/calc";

export const dynamic = "force-dynamic";

type Body = {
  action?: string;
  name?: string;
  password?: string;
  role?: string;
  id?: string;
  ids?: string[];
  grade?: number | null;
  position?: string | null;
  sample?: boolean;
};

const json = (data: unknown, status = 200) => Response.json(data, { status });
const fail = (msg: string, status = 400) => json({ error: msg }, status);

function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null;
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

// ログインに使う内部用メールアドレス（実際にメールは送りません）
const loginEmail = () => `m-${crypto.randomUUID()}@hurfc-members.local`;

// 日本時間の今日
function todayJST() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

// 選手用のパスワード（誰にも知らせない。選手は合言葉なしでログインするため）
const randomPassword = () => crypto.randomUUID() + crypto.randomUUID();

// 学年・ポジションの入力値チェック（不正な値は「未設定」にする）
const toGrade = (v: unknown) => (GRADES.includes(Number(v)) ? Number(v) : null);
const toPosition = (v: unknown) => (POSITIONS.includes(v as never) ? (v as string) : null);

type Extra = { grade?: number | null; position?: string | null; sort_order?: number | null };

async function createMember(admin: SupabaseClient, name: string, password: string, role: "player" | "coach", extra: Extra = {}) {
  const email = loginEmail();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(error?.message.includes("Password") ? "合言葉は6文字以上にしてください" : error?.message || "作成に失敗しました");
  const { error: e2 } = await admin.from("users").insert({ id: data.user.id, name, role, login_email: email, ...extra });
  if (e2) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(e2.code === "23505" ? "同じ名前のメンバーがいます" : e2.message);
  }
  return data.user.id;
}

// 選手を今の並び順で取得
async function loadPlayers(admin: SupabaseClient) {
  const { data, error } = await admin.from("users").select("id,name,grade,sort_order").eq("role", "player");
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; name: string; grade: number | null; sort_order: number | null }[]).sort(byOrder);
}

// 並び順を保存（ids の順に 0, 1, 2, …）
async function saveOrder(admin: SupabaseClient, ids: string[]) {
  const results = await Promise.all(ids.map((id, i) => admin.from("users").update({ sort_order: i }).eq("id", id)));
  const bad = results.find((r) => r.error);
  if (bad?.error) throw new Error(bad.error.message);
}

export async function POST(req: Request) {
  const admin = adminClient();
  if (!admin) return fail("サーバーの環境変数（SUPABASE_SECRET_KEY）が設定されていません", 500);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return fail("リクエストが正しくありません");
  }
  const name = String(body.name ?? "").trim();
  const password = String(body.password ?? "");

  try {
    // ---- 初期設定（メンバーが0人のときだけ実行できる）----
    if (body.action === "setup") {
      const { count, error } = await admin.from("users").select("id", { count: "exact", head: true });
      if (error) throw new Error("データベースの準備ができていません（SQLの実行を確認してください）");
      if ((count ?? 0) > 0) return fail("初期設定はすでに完了しています", 409);
      if (!name || password.length < 6) return fail("名前と6文字以上の合言葉を入力してください");
      await createMember(admin, name, password, "coach");
      if (body.sample) {
        for (const p of generateSample(todayJST())) {
          const id = await createMember(admin, p.name, randomPassword(), "player", { grade: p.grade, position: p.position });
          await admin.from("daily_records").insert(p.daily.map((d) => ({ user_id: id, ...d })));
          await admin.from("physical_records").insert(p.physical.map((d) => ({ user_id: id, ...d })));
        }
      }
      return json({ ok: true });
    }

    // ---- 選手のログイン（合言葉なし）----
    // 名前から選手を探し、ログイン用の使い捨ての鍵を発行してブラウザに返す（メールは送らない）
    if (body.action === "player_login") {
      if (!name) return fail("名前を選んでください");
      const { data: u } = await admin.from("users").select("login_email").eq("name", name).eq("role", "player").maybeSingle();
      if (!u) return fail("選手が見つかりません", 404);
      const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: u.login_email });
      if (error || !data.properties) throw new Error("ログインに失敗しました");
      return json({ token_hash: data.properties.hashed_token, type: data.properties.verification_type });
    }

    // ---- ここから下はコーチだけが使える ----
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return fail("ログインが必要です", 401);
    const { data: who, error: whoErr } = await admin.auth.getUser(token);
    if (whoErr || !who.user) return fail("ログインが必要です", 401);
    const { data: me } = await admin.from("users").select("role").eq("id", who.user.id).single();
    if (!me || me.role !== "coach") return fail("コーチのみ実行できます", 403);

    if (body.action === "add") {
      if (!name) return fail("名前を入力してください");
      if (body.role === "coach") {
        if (password.length < 6) return fail("コーチの合言葉は6文字以上にしてください");
        await createMember(admin, name, password, "coach");
        return json({ ok: true });
      }
      const grade = toGrade(body.grade);
      const position = toPosition(body.position);
      if (!grade || !position) return fail("学年とポジションを選んでください");
      // 並び順：同じ学年以上の選手のすぐ後ろに入れる（学年が上の人が上になるように）
      const players = await loadPlayers(admin);
      let at = 0;
      players.forEach((p, i) => {
        if ((p.grade ?? 0) >= grade) at = i + 1;
      });
      const ids = players.map((p) => p.id);
      const newId = await createMember(admin, name, randomPassword(), "player", { grade, position, sort_order: at });
      ids.splice(at, 0, newId);
      await saveOrder(admin, ids);
      return json({ ok: true });
    }

    if (body.action === "update") {
      if (!body.id || !name) return fail("名前を入力してください");
      const grade = toGrade(body.grade);
      const position = toPosition(body.position);
      if (!grade || !position) return fail("学年とポジションを選んでください");
      const { error } = await admin.from("users").update({ name, grade, position }).eq("id", body.id).eq("role", "player");
      if (error) throw new Error(error.code === "23505" ? "同じ名前のメンバーがいます" : error.message);
      return json({ ok: true });
    }

    if (body.action === "reorder") {
      if (!Array.isArray(body.ids)) return fail("並び順が指定されていません");
      // 送られてきた順番を保存（送られてこなかった選手は後ろに付ける）
      const players = await loadPlayers(admin);
      const known = new Set(players.map((p) => p.id));
      const ids = body.ids.filter((id) => known.has(id));
      players.forEach((p) => !ids.includes(p.id) && ids.push(p.id));
      await saveOrder(admin, ids);
      return json({ ok: true });
    }

    if (body.action === "delete") {
      if (!body.id) return fail("対象が指定されていません");
      if (body.id === who.user.id) return fail("自分自身は削除できません");
      // auth のユーザーを消すと、users・記録も連動して消えます（SQLで設定済み）
      const { error } = await admin.auth.admin.deleteUser(body.id);
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }

    return fail("不明な操作です");
  } catch (e) {
    return fail(e instanceof Error ? e.message : "処理に失敗しました", 500);
  }
}
