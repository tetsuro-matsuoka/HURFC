"use client";

// 日程調整（コーチ用）
//  月間カレンダーの日付をタップするたびに「オフ → 練習 → 試合 → 合同練習 → オフ」と切り替わり、自動で保存される。
//  ここで設定した練習日をもとに、出欠席率（練習日の出席日数÷練習日数）を計算する。
//  上の「週の設定」では、週ごとの筋トレメニュー（A〜B / A〜C / A〜D）をワンタップで設定する。

import { useState } from "react";
import type { Ctx } from "./Shared";
import { DAY_TYPES, DEFAULT_MENU, MENUS, dayType, addDays, addMonths, practiceCount, today, weekLabel, weekStart, ymLabel, ymOf } from "@/lib/calc";
import type { DayType, Menu } from "@/lib/types";

// カレンダーの色：練習＝緑、試合＝赤、合同練習＝青
const DAY_CLS: Record<DayType, string> = { 練習: "t-practice", 試合: "t-game", 合同練習: "t-joint" };
const pad = (n: number) => String(n).padStart(2, "0");
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

export function ScheduleScreen({ ctx }: { ctx: Ctx }) {
  const [ym, setYm] = useState(ymOf(today()));
  const t = today();
  const [y, mo] = ym.split("-").map(Number);
  const first = new Date(y, mo - 1, 1).getDay(); // 1日の曜日（0=日）
  const last = new Date(y, mo, 0).getDate(); // 月末の日
  const cells: (string | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length: last }, (_, i) => `${ym}-${pad(i + 1)}`),
  ];
  while (cells.length % 7) cells.push(null);

  const count = practiceCount(ctx.practice, ym);
  // 種類ごとの日数（練習・試合・合同練習）
  const byType = DAY_TYPES.map((k) => [k, [...ctx.practice.days].filter((d) => d.startsWith(ym) && dayType(d, ctx.practice) === k).length] as const);

  return (
    <>
      <h2 className="page">日程調整</h2>
      <WeekCard ctx={ctx} />
      <div className="card cal-card">
        <div className="datebar" style={{ marginBottom: 10 }}>
          <button onClick={() => setYm(addMonths(ym, -1))} aria-label="前の月">
            ‹
          </button>
          <b style={{ flex: 1, textAlign: "center", fontSize: 18 }}>{ymLabel(ym)}</b>
          <button onClick={() => setYm(addMonths(ym, 1))} aria-label="次の月">
            ›
          </button>
        </div>

        <div className="pcount">
          今月の活動日数：<b className="num">{count}</b>日
          <div className="pcount-sub">
            {byType.map(([k, n]) => (
              <span key={k} className={DAY_CLS[k]}>
                {k} {n}
              </span>
            ))}
          </div>
        </div>

        <div className="cal">
          {WEEK.map((w, i) => (
            <div key={w} className={`cal-w ${i === 0 ? "sun" : i === 6 ? "sat" : ""}`}>
              {w}
            </div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={"e" + i} />;
            const k = dayType(d, ctx.practice);
            return (
              <button
                key={d}
                className={`cal-d ${k ? "on " + DAY_CLS[k] : ""} ${d === t ? "today" : ""} ${i % 7 === 0 ? "sun" : i % 7 === 6 ? "sat" : ""}`}
                onClick={() => ctx.togglePractice(d)}
                aria-label={`${Number(d.slice(8))}日 ${k ?? "オフ"}`}
              >
                <span>{Number(d.slice(8))}</span>
                {k && (
                  <>
                    <small>{k}</small>
                    <i className="dot" />
                  </>
                )}
              </button>
            );
          })}
        </div>

        <p className="muted" style={{ marginTop: 12, lineHeight: 1.7 }}>
          日付をタップするたびに「練習 → 試合 → 合同練習 → オフ」の順に切り替わり、自動で保存されます。練習・試合・合同練習の日はどれも出欠の対象日です。
          <br />
          出欠席率は「活動日の出席日数 ÷ 活動日数」で計算します（今日より後の練習日はまだ数えません）。
          練習日を1日も設定していない月は、今までどおり出欠を記録した日をもとに計算します。
        </p>
      </div>
    </>
  );
}

// 週の設定：筋トレメニュー（A〜B / A〜C / A〜D）。押すとすぐ保存。未設定の週は A〜C
function WeekCard({ ctx }: { ctx: Ctx }) {
  const cur = weekStart(today());
  const [ws, setWs] = useState(cur);
  const w = ctx.weeks[ws] ?? { days: null, menu: null };
  const menu: Menu = w.menu ?? DEFAULT_MENU;
  return (
    <div className="card">
      <div className="datebar compact" style={{ marginBottom: 8 }}>
        <button onClick={() => setWs(addDays(ws, -7))} aria-label="前の週">
          ‹
        </button>
        <b style={{ flex: 1, textAlign: "center" }}>
          {weekLabel(ws)}
        </b>
        <button onClick={() => setWs(addDays(ws, 7))} aria-label="次の週">
          ›
        </button>
      </div>
      <div className="wk-l">筋トレメニュー</div>
      <div className="seg" style={{ marginBottom: 0 }}>
        {MENUS.map((x) => (
          <button key={x} className={menu === x ? "on" : ""} onClick={() => ctx.setWeek(ws, { days: null, menu: x })}>
            {x}
          </button>
        ))}
      </div>
    </div>
  );
}
