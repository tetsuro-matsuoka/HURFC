"use client";

// アプリ全体の切り替え（ログイン状態・画面・下部メニュー・通知）

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { configOk, supabase } from "@/lib/supabase";
import { adminCall, loadAll, loadMeta, saveWeekSetting, setPracticeDay, type Meta } from "@/lib/data";
import { EMPTY_PRACTICE, makePractice } from "@/lib/calc";
import type { Category, Members, WeekSetting } from "@/lib/types";
import Login from "./Login";
import { PlayerModal, type Ctx, type View } from "./Shared";
import { InputScreen } from "./PlayerScreens";
import { PlayerHome } from "./PlayerHome";
import { TeamScreen } from "./Dashboard";
import { ManageScreen } from "./ManageScreen";
import { SettingsScreen } from "./SettingsScreen";
import { ScheduleScreen } from "./ScheduleScreen";

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
  gear: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <circle cx="12" cy="15.5" r="1.6" fill="currentColor" />
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
  const [meta, setMeta] = useState<Meta>({ metrics: [], settings: {}, practice: EMPTY_PRACTICE, weeks: {} });
  const [loadErr, setLoadErr] = useState("");
  const [view, setView] = useState<View | null>(null);
  const [navKey, setNavKey] = useState(0);
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
      const [mem, mt] = await Promise.all([loadAll(), loadMeta()]);
      setMeta(mt);
      setMembers(mem);
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
    // 長い文（エラーの原因など）は読めるように長めに表示
    toastTimer.current = setTimeout(() => setToastMsg(null), msg.length > 30 ? 7000 : 2600);
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
    setNavKey((k) => k + 1); // 下部メニューを押したら、その画面を最初の状態に戻す（チーム画面ならトップの選手一覧）
    setPlayerId(null);
    window.scrollTo(0, 0);
  };
  // 練習日の ON / OFF（タップした瞬間に画面へ反映し、裏で保存。失敗したら元に戻す）
  const togglePractice = async (d: string) => {
    const before = meta.practice;
    const on = !before.days.has(d);
    const next = new Set(before.days);
    if (on) next.add(d);
    else next.delete(d);
    setMeta((cur) => ({ ...cur, practice: makePractice([...next], cur.practice.weekDays) }));
    try {
      await setPracticeDay(d, on);
    } catch {
      setMeta((cur) => ({ ...cur, practice: before }));
      toast("保存できませんでした。データベースの更新（追加SQL その4）が済んでいるか確認してください");
    }
  };
  // 選手のカテゴリー変更（押した瞬間に画面へ反映し、裏で保存。失敗したら元に戻す）
  const setCategory = async (id: string, category: Category | null) => {
    const before = members[id]?.category ?? null;
    const apply = (c: Category | null) => setMembers((cur) => (cur && cur[id] ? { ...cur, [id]: { ...cur[id], category: c } } : cur));
    apply(category);
    try {
      await adminCall("category", { id, category });
    } catch (e) {
      apply(before);
      toast(e instanceof Error ? e.message : "カテゴリーを保存できませんでした");
    }
  };
  // 週ごとの設定（筋トレメニュー）。押した瞬間に反映し、裏で保存。失敗したら元に戻す
  const setWeek = async (ws: string, v: WeekSetting) => {
    const before = meta;
    const apply = (weeks: Record<string, WeekSetting>) =>
      setMeta((cur) => ({ ...cur, weeks }));
    apply({ ...meta.weeks, [ws]: v });
    try {
      await saveWeekSetting(ws, v);
    } catch {
      apply(before.weeks);
      toast("保存できませんでした。データベースの更新（追加SQL その9）が済んでいるか確認してください");
    }
  };
  const ctx: Ctx = {
    members,
    setCategory,
    metrics: meta.metrics,
    settings: meta.settings,
    practice: meta.practice,
    togglePractice,
    weeks: meta.weeks,
    setWeek,
    me,
    readOnly: false,
    reload,
    toast,
    openPlayer: setPlayerId,
    go,
  };

  const tabs: [View, string, ReactNode][] = coach
    ? [
        ["team", "チーム", ICON.team],
        ["settings", "項目設定", ICON.gear],
        ["manage", "選手管理", ICON.users],
        ["schedule", "日程調整", ICON.calendar],
      ]
    : [
        ["home", "ホーム", ICON.home],
        ["input", "記録する", ICON.edit],
      ];

  const screen = (() => {
    switch (current) {
      case "home":
        return <PlayerHome ctx={ctx} />;
      case "input":
        return <InputScreen ctx={ctx} />;
      case "team":
        return <TeamScreen ctx={ctx} />;
      case "settings":
        return <SettingsScreen ctx={ctx} />;
      case "schedule":
        return <ScheduleScreen ctx={ctx} />;
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
      <main key={navKey}>{screen}</main>
      <nav className="nav">
        {tabs.map(([v, l, icon]) => (
          <button key={v} className={current === v ? "on" : ""} onClick={() => go(v)}>
            {icon}
            {l}
          </button>
        ))}
      </nav>
      {modalMember && <PlayerModal m={modalMember} metrics={meta.metrics} practice={meta.practice} onClose={() => setPlayerId(null)} />}
      {toastEl}
    </div>
  );
}
