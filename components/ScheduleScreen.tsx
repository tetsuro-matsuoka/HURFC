"use client";

// 日程調整（コーチ用）
//  月間カレンダーの日付をタップするだけで「練習日 ON / OFF」が切り替わり、自動で保存される。
//  ここで設定した練習日をもとに、出欠席率（練習日の出席日数÷練習日数）を計算する。

import { useState } from "react";
import type { Ctx } from "./Shared";
import { addMonths, practiceCount, today, ymLabel, ymOf } from "@/lib/calc";

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
