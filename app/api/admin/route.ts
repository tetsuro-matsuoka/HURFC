// コーチ専用の操作をサーバー側で行う窓口
// ・setup  : 最初のコーチ作成（メンバーが0人のときだけ）＋サンプルデータ投入
// ・add    : メンバー追加
// ・reset  : 合言葉（パスワード）のリセット
// ・delete : メンバー削除（その人の記録も消えます）
// 秘密鍵（SUPABASE_SECRET_KEY）はこのサーバー側でのみ使い、ブラウザには送りません。

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateSample, SAMPLE_PASSWORD } from "@/lib/sample";

export const dynamic = "force-dynamic";

type Body = {
  action?: string;
  name?: string;
  password?: string;
  role?: string;
  id?: string;
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

async function createMember(admin: SupabaseClient, name: string, password: string, role: "player" | "coach") {
  const email = loginEmail();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(error?.message.includes("Password") ? "合言葉は6文字以上にしてください" : error?.message || "作成に失敗しました");
  const { error: e2 } = await admin.from("users").insert({ id: data.user.id, name, role, login_email: email });
  if (e2) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(e2.code === "23505" ? "同じ名前のメンバーがいます" : e2.message);
  }
  return data.user.id;
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
          const id = await createMember(admin, p.name, SAMPLE_PASSWORD, "player");
          await admin.from("daily_records").insert(p.daily.map((d) => ({ user_id: id, ...d })));
          await admin.from("physical_records").insert(p.physical.map((d) => ({ user_id: id, ...d })));
        }
      }
      return json({ ok: true });
    }

    // ---- ここから下はコーチだけが使える ----
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return fail("ログインが必要です", 401);
    const { data: who, error: whoErr } = await admin.auth.getUser(token);
    if (whoErr || !who.user) return fail("ログインが必要です", 401);
    const { data: me } = await admin.from("users").select("role").eq("id", who.user.id).single();
    if (!me || me.role !== "coach") return fail("コーチのみ実行できます", 403);

    if (body.action === "add") {
      if (!name || password.length < 6) return fail("名前と6文字以上の合言葉を入力してください");
      const role = body.role === "coach" ? "coach" : "player";
      await createMember(admin, name, password, role);
      return json({ ok: true });
    }

    if (body.action === "reset") {
      if (!body.id || password.length < 6) return fail("6文字以上の合言葉を入力してください");
      const { error } = await admin.auth.admin.updateUserById(body.id, { password });
      if (error) throw new Error(error.message);
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
