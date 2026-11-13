"use client";

// アプリ全体の切り替え（ログイン状態・画面・下部メニュー・通知）

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { configOk, supabase } from "@/lib/supabase";
import { loadAll } from "@/lib/data";
import type { Members } from "@/lib/types";
import Login from "./Login";
import { PlayerModal, type Ctx, type View } from "./Shared";
import { InputScreen, PlayerHome, RankScreen } from "./PlayerScreens";
import { PhysicalScreen, TeamScreen } from "./CoachScreens";
import { ManageScreen } from "./ManageScreen";

const ICON = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </svg>
  ),
  edit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  ),
  team: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M17 14c2.5 0 4.2 1.6 4.6 4.5" />
    </svg>
  ),
  trophy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 21h8" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9h10M7 13h10M7 17h6" />
    </svg>
  ),
};

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined); // undefined = 確認中
  const [members, setMembers] = useState<Members | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [view, setView] = useState<View | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ msg: string; pr: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ログイン状態の監視
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id ?? null;

  const reload = useCallback(async () => {
    try {
      setMembers(await loadAll());
      setLoadErr("");
    } catch {
      setLoadErr("データを読み込めませんでした。通信状況を確認してください。");
    }
  }, []);

  // ログインしたらデータを読み込む
  useEffect(() => {
    if (!uid) {
      setMembers(null);
      setView(null);
      return;
    }
    reload();
  }, [uid, reload]);

  // アプリに戻ってきたときに最新データに更新
  useEffect(() => {
    if (!uid) return;
    const onVis = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [uid, reload]);

  const toast = useCallback((msg: string, pr = false) => {
    setToastMsg({ msg, pr });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const logout = async () => {
    await supabase?.auth.signOut();
    setPlayerId(null);
  };

  const toastEl = toastMsg && <div className={`toast ${toastMsg.pr ? "pr" : ""}`}>{toastMsg.msg}</div>;

  /* ---- 設定前・読み込み中・未ログイン ---- */
  if (!configOk) {
    return (
      <div className="login">
        <div className="card">
          <h3>設定が必要です</h3>
          <p className="muted">
            Vercel の環境変数（NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY）が設定されていません。
            DEPLOYMENT.md の手順に沿って設定し、再デプロイしてください。
          </p>
        </div>
      </div>
    );
  }
  if (session === undefined) return <div className="loading">読み込み中…</div>;
  if (!session) return <Login />;
  if (!members) {
    return (
      <div className="loading">
        {loadErr || "読み込み中…"}
        {loadErr && (
          <div>
            <button className="btn ghost small" style={{ marginTop: 16 }} onClick={logout}>
              ログアウト
            </button>
          </div>
        )}
      </div>
    );
  }

  const me = uid ? members[uid] : undefined;
  if (!me) {
    return (
      <div className="login">
        <div className="card">
          <h3>メンバー登録が見つかりません</h3>
          <p className="muted">コーチにメンバー登録を確認してください。</p>
          <button className="btn ghost" onClick={logout}>
            ログアウト
          </button>
        </div>
      </div>
    );
  }

  const coach = me.role === "coach";
  const current: View = view ?? (coach ? "team" : "home");
  const go = (v: View) => {
    setView(v);
    setPlayerId(null);
    window.scrollTo(0, 0);
  };
  const ctx: Ctx = { members, me, readOnly: false, reload, toast, openPlayer: setPlayerId, go };

  const tabs: [View, string, ReactNode][] = coach
    ? [
        ["team", "チーム", ICON.team],
        ["physical", "フィジカル", ICON.trophy],
        ["manage", "選手管理", ICON.users],
      ]
    : [
        ["home", "ホーム", ICON.home],
        ["input", "記録する", ICON.edit],
        ["rank", "ランキング", ICON.trophy],
      ];

  const screen = (() => {
    switch (current) {
      case "home":
        return <PlayerHome ctx={ctx} />;
      case "input":
        return <InputScreen ctx={ctx} />;
      case "rank":
        return <RankScreen ctx={ctx} />;
      case "team":
        return <TeamScreen ctx={ctx} />;
      case "physical":
        return <PhysicalScreen ctx={ctx} />;
      case "manage":
        return <ManageScreen ctx={ctx} />;
    }
  })();

  const modalMember = playerId ? members[playerId] : undefined;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          ALL-<b>IN</b>
        </div>
        <div className="who">
          {me.name}
          <br />
          <span style={{ fontSize: 11 }}>{coach ? "コーチ" : "選手"}</span>
        </div>
        <button className="out" onClick={logout}>
          ログアウト
        </button>
      </header>
      {loadErr && <div className="modebar err">{loadErr}</div>}
      <main>{screen}</main>
      <nav className="nav">
        {tabs.map(([v, l, icon]) => (
          <button key={v} className={current === v ? "on" : ""} onClick={() => go(v)}>
            {icon}
            {l}
          </button>
        ))}
      </nav>
      {modalMember && <PlayerModal m={modalMember} onClose={() => setPlayerId(null)} />}
      {toastEl}
    </div>
  );
}
