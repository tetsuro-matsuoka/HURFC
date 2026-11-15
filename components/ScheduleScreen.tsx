"use client";

// 日程調整（コーチ用）
//  月間カレンダーの日付をタップするだけで「練習日 ON / OFF」が切り替わり、自動で保存される。
//  ここで設定した練習日をもとに、出欠席率（練習日の出席日数÷練習日数）を計算する。
//  上の「週の設定」では、週ごとの練習日数（1〜7日・自動）と筋トレメニュー構成（A〜B / A〜C / A〜D）をワンタップで設定する。
//  練習日数を設定した週は、その日数を出席率の分母にする（カレンダーより優先）。

import { useState } from "react";
import type { Ctx } from "./Shared";
import { DEFAULT_MENU, MENUS, addDays, addMonths, md, menuLabel, practiceCount, today, weekLabel, weekPracticeCount, weekStart, ymLabel, ymOf } from "@/lib/calc";
import type { Menu } from "@/lib/types";

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
          今月の設定練習日数：<b className="num">{count}</b>日
        </div>

        <div className="cal">
          {WEEK.map((w, i) => (
            <div key={w} className={`cal-w ${i === 0 ? "sun" : i === 6 ? "sat" : ""}`}>
              {w}
            </div>
          ))}
          {cells.map((d, i) =>
            d ? (
              <button
                key={d}
                className={`cal-d ${ctx.practice.days.has(d) ? "on" : ""} ${d === t ? "today" : ""} ${i % 7 === 0 ? "sun" : i % 7 === 6 ? "sat" : ""}`}
                onClick={() => ctx.togglePractice(d)}
                aria-pressed={ctx.practice.days.has(d)}
                aria-label={`${Number(d.slice(8))}日 ${ctx.practice.days.has(d) ? "練習日" : "練習日ではない"}`}
              >
                <span>{Number(d.slice(8))}</span>
                {ctx.practice.days.has(d) && (
                  <>
                    <small>練習</small>
                    <i className="dot" />
                  </>
                )}
              </button>
            ) : (
              <div key={"e" + i} />
            ),
          )}
        </div>

        <p className="muted" style={{ marginTop: 12, lineHeight: 1.7 }}>
          日付をタップすると「練習日」の ON / OFF が切り替わり、自動で保存されます。
          <br />
          出欠席率は「練習日の出席日数 ÷ 練習日数」で計算します（今日より後の練習日はまだ数えません）。
          練習日を1日も設定していない月は、今までどおり出欠を記録した日をもとに計算します。
        </p>
      </div>
    </>
  );
}

// 週の設定：練習日数（自動＝カレンダーの練習日の数 / 1〜7日）と筋トレメニュー構成。押すとすぐ保存
function WeekCard({ ctx }: { ctx: Ctx }) {
  const cur = weekStart(today());
  const [ws, setWs] = useState(cur);
  const w = ctx.weeks[ws] ?? { days: null, menu: null };
  const auto = w.days == null;
  const calCount = (() => {
    let n = 0;
    for (let i = 0; i < 7; i++) if (ctx.practice.days.has(addDays(ws, i))) n++;
    return n;
  })();
  const menu: Menu = w.menu ?? DEFAULT_MENU;
  return (
    <div className="card">
      <div className="datebar compact" style={{ marginBottom: 6 }}>
        <button onClick={() => setWs(addDays(ws, -7))} aria-label="前の週">
          ‹
        </button>
        <b style={{ flex: 1, textAlign: "center" }}>
          {ws === cur ? "今週" : ws === addDays(cur, 7) ? "来週" : ""} {weekLabel(ws)}
        </b>
        <button onClick={() => setWs(addDays(ws, 7))} aria-label="次の週">
          ›
        </button>
      </div>

      <div className="wk-l">
        練習日数 <b className="num">{weekPracticeCount(ctx.practice, ws)}日</b>
        <small>{auto ? `（自動：カレンダーの練習日 ${calCount}日）` : "（手動で設定）"}</small>
      </div>
      <div className="wk-days">
        <button className={auto ? "on" : ""} onClick={() => ctx.setWeek(ws, { ...w, days: null })}>
          自動
        </button>
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <button key={n} className={w.days === n ? "on" : ""} onClick={() => ctx.setWeek(ws, { ...w, days: n })}>
            {n}日
          </button>
        ))}
      </div>

      <div className="wk-l" style={{ marginTop: 12 }}>
        筋トレメニュー <b>{menuLabel(menu)}</b>
        {!w.menu && <small>（未設定のため {DEFAULT_MENU}）</small>}
      </div>
      <div className="seg" style={{ marginBottom: 0 }}>
        {MENUS.map((x) => (
          <button key={x} className={menu === x ? "on" : ""} onClick={() => ctx.setWeek(ws, { ...w, menu: x })} style={{ fontSize: 14 }}>
            {x}
            <small style={{ display: "block", fontSize: 10, fontWeight: 400 }}>{x === "A〜B" ? "2種目" : x === "A〜C" ? "3種目" : "4種目"}</small>
          </button>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 8, fontSize: 11 }}>
        練習日数を選んだ週は、その日数で出席率を計算します（{md(ws)}〜の週）。メニューは選手の「記録する → 筋トレ遂行率」に表示されます。
      </p>
    </div>
  );
}
