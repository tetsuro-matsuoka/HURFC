// ブラウザから Supabase に接続するための設定
// 値はソースコードに書かず、Vercel の「環境変数」から読み込みます。

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// 環境変数が設定されているかどうか（未設定なら画面に案内を出す）
export const configOk = Boolean(url && key);

export const supabase: SupabaseClient | null = configOk ? createClient(url as string, key as string) : null;
