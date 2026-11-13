"use client";

// S01 ログイン画面（選手名 ＋ 合言葉）
// メンバーが1人もいないときは「初期設定」（最初のコーチ作成）を表示します。

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { adminCall, loadLoginList, type LoginEntry } from "@/lib/data";
import { normName } from "@/lib/calc";

export default function Login() {
  const [list, setList] = useState<LoginEntry[] | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [sample, setSample] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadLoginList()
      .then(setList)
      .catch(() => setLoadErr("データベースに接続できません。公開手順の「SQLの実行」が済んでいるか確認してください。"));
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // ログイン成功後の画面切り替えは App 側が自動で行う
  };

  const onLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr("");
    const hit = (list ?? []).find((m) => normName(m.name) === normName(name));
    if (!hit) return setErr("名前または合言葉が違います");
    setBusy(true);
    try {
      await signIn(hit.login_email, pw);
    } catch {
      setErr("名前または合言葉が違います");
      setBusy(false);
    }
  };

  const onSetup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr("");
    if (pw.length < 6) return setErr("合言葉は6文字以上にしてください");
    setBusy(true);
    try {
      await adminCall("setup", { name: name.trim(), password: pw, sample });
      const fresh = await loadLoginList();
      const me = fresh.find((m) => m.role === "coach" && normName(m.name) === normName(name));
      if (me) await signIn(me.login_email, pw);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "初期設定に失敗しました");
      setBusy(false);
    }
  };

  const sorted = (list ?? []).slice().sort((a, b) =>
    a.role === b.role ? a.name.localeCompare(b.name, "ja") : a.role === "coach" ? -1 : 1,
  );

  return (
    <div className="login">
      <div className="hero">
        <div className="brand">
          NUM<b>B</b>ERS
        </div>
        <p>数字を意識して、強くなる。</p>
      </div>

      {loadErr && <div className="err-msg">{loadErr}</div>}
      {!loadErr && list === null && <div className="loading" style={{ padding: 20 }}>読み込み中…</div>}

      {list !== null && list.length === 0 && (
        <div className="card">
          <h3>初期設定</h3>
          <p className="muted">まだメンバーが登録されていません。最初にコーチのアカウントを作成してください。</p>
          <form onSubmit={onSetup}>
            <label className="f">コーチ名</label>
            <input className="t" value={name} onChange={(e) => setName(e.target.value)} required />
            <label className="f">合言葉（6文字以上）</label>
            <input className="t" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required autoComplete="new-password" />
            <label className="f" style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500 }}>
              <input type="checkbox" checked={sample} onChange={(e) => setSample(e.target.checked)} style={{ width: 20, height: 20 }} />
              お試し用のサンプル選手（8名分の記録）も入れる
            </label>
            <button className="btn navy" type="submit" disabled={busy}>
              {busy ? "作成中…（30秒ほどかかります）" : "コーチを作成"}
            </button>
            <div className="err-msg">{err}</div>
          </form>
        </div>
      )}

      {list !== null && list.length > 0 && (
        <form onSubmit={onLogin}>
          <label className="f" htmlFor="ln">
            名前
          </label>
          <select className="t" id="ln" value={name} onChange={(e) => setName(e.target.value)} required>
            <option value="">選んでください</option>
            {sorted.map((m) => (
              <option key={m.login_email}>{m.name}</option>
            ))}
          </select>
          <label className="f" htmlFor="lp">
            合言葉
          </label>
          <input className="t" id="lp" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "ログイン中…" : "ログイン"}
          </button>
          <div className="err-msg">{err}</div>
        </form>
      )}
    </div>
  );
}
