"use client";

// S04 チームダッシュボード（コーチ用ホーム）
//  上部：4つのメニュー（出欠席率 / 筋トレ遂行率 / 体組成 / フィジカル）。押すと詳細が開く
//  下部：選手一覧（PlayerTable.tsx）。4つのどれも選んでいないとき（トップ）だけ表示
//  選択中のボタンをもう一度押す（または下部メニューの「チーム」）とトップに戻る

import { useState } from "react";
import type { ReactNode } from "react";
import LineChart from "./LineChart";
import PlayerTable from "./PlayerTable";
import BodyPanel from "./BodyPanel";
import PhysicalPanel from "./PhysicalPanel";
import type { Ctx } from "./Shared";
import {
  addDays,
  addMonths,
  fmt0,
  fmt1,
  latestWeight,
  maxes,
  md,
  monthAttendance,
  absenceSummary,
  attendLabel,
  dayKind,
  practiceCount,
  playersOf,
  recentWeeks,
  teamTrainingAvg,
  today,
  trainingAvg,
  wd,
  weekStart,
  ymLabel,
  ymOf,
} from "@/lib/calc";
import type { Member } from "@/lib/types";

type Panel = "attend" | "training" | "body" | "physical";

const avg = (v: (number | null)[]) => {
  const x = v.filter((n): n is number => n != null);
  return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null;
};

// 前後に切り替えるバー（‹ ラベル ›）
function Stepper({ label, onPrev, onNext, nextDisabled }: { label: ReactNode; onPrev: () => void; onNext: () => void; nextDisabled: boolean }) {
  return (
    <div className="datebar">
      <button onClick={onPrev} aria-label="前へ">
        ‹
      </button>
      <b style={{ flex: 1, textAlign: "center" }}>{label}</b>
      <button onClick={onNext} disabled={nextDisabled} style={nextDisabled ? { opacity: 0.3 } : undefined} aria-label="次へ">
        ›
      </button>
    </div>
  );
}

export function TeamScreen({ ctx }: { ctx: Ctx }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const ps = playersOf(ctx.members);
  const t = today();

  // ボタンに出す概要
  const todayYes = ps.filter((m) => m.daily[t]?.attendance === "出席").length;
  const todayOff = dayKind(t, ctx.practice) === "off";
  const weekAvg = teamTrainingAvg(ps, weekStart(t));
  const wAvg = avg(ps.map((m) => latestWeight(m)?.v ?? null));
  const bigAvg = avg(ps.map((m) => maxes(m).total));

  const menus: [Panel, string, string][] = [
    ["attend", "出欠席率", todayOff ? "今日はオフ（練習日ではありません）" : `今日 出席 ${todayYes}/${ps.length}名`],
    ["training", "筋トレ遂行率", `今週平均 ${weekAvg == null ? "—" : fmt1(weekAvg)} / 10`],
    ["body", "体組成", `平均体重 ${wAvg == null ? "—" : fmt1(wAvg) + "kg"}`],
    ["physical", "フィジカル", `Big3合計 平均 ${bigAvg == null ? "—" : fmt0(bigAvg) + "kg"}`],
  ];

  return (
    <>
      <h2 className="page">チームダッシュボード</h2>
      <div className="menu4">
        {menus.map(([k, l, sub]) => (
          <button key={k} className={`m-${k} ${panel === k ? "on" : ""}`} onClick={() => setPanel(panel === k ? null : k)} aria-pressed={panel === k}>
            <b>{l}</b>
            <span>{sub}</span>
          </button>
        ))}
      </div>

      {panel === "attend" && <AttendPanel ctx={ctx} ps={ps} />}
      {panel === "training" && <TrainingPanel ctx={ctx} ps={ps} />}
      {panel === "body" && <BodyPanel ctx={ctx} ps={ps} />}
      {panel === "physical" && <PhysicalPanel ctx={ctx} ps={ps} />}

      {/* 4つのボタンをどれも選んでいないとき（トップ）だけ表示 */}
      {!panel && <PlayerTable ctx={ctx} />}
    </>
  );
}

/* ---------- 出欠席率 ---------- */
function AttendPanel({ ctx, ps }: { ctx: Ctx; ps: Member[] }) {
  const [d, setD] = useState(today());
  const [ym, setYm] = useState(ymOf(today()));
  const kind = dayKind(d, ctx.practice);
  // その日より後に登録した選手は数えない
  const rows = ps.filter((m) => m.joined <= d).map((m, i) => ({ m, r: m.daily[d], i }));
  const yes = rows.filter((x) => x.r?.attendance === "出席").length;
  const no = rows.filter((x) => x.r?.attendance === "欠席").length;
  const none = rows.length - yes - no;
  // 未入力 → 欠席 → 出席 の順（確認が必要な人を上に）。同じ状態の中は選手管理の並び順
  const order = (x: (typeof rows)[number]) => (!x.r ? 2 : x.r.attendance === "欠席" ? 1 : 0);
  const sorted = [...rows].sort((a, b) => order(b) - order(a) || a.i - b.i);

  // 練習日ベースの月間集計（今日より後の練習日はまだ数えない）
  const month = ps.map((m) => ({ m, ...monthAttendance(m, ym, ctx.practice) }));
  const tYes = month.reduce((a, x) => a + x.yes, 0),
    tNo = month.reduce((a, x) => a + x.no, 0),
    tNone = month.reduce((a, x) => a + x.none, 0),
    tDays = month.reduce((a, x) => a + x.days, 0);
  const pCount = practiceCount(ctx.practice, ym);
  const pct = (v: number | null) => (v == null ? "—" : Math.round(v) + "%");

  return (
    <div className="grid two">
      <div className="card">
        <h3>当日の出欠状況</h3>
        <div className="datebar">
          <button onClick={() => setD(addDays(d, -1))} aria-label="前の日">
            ‹
          </button>
          <input type="date" value={d} max={today()} onChange={(e) => e.target.value && setD(e.target.value > today() ? today() : e.target.value)} />
          <button onClick={() => d < today() && setD(addDays(d, 1))} disabled={d >= today()} style={d >= today() ? { opacity: 0.3 } : undefined} aria-label="次の日">
            ›
          </button>
          <span className="muted">
            {wd(d)}曜日{d === today() ? "（今日）" : ""}
          </span>
          {kind !== "unset" && <span className={`daytag ${kind}`}>{kind === "practice" ? "練習日" : "オフ"}</span>}
        </div>
        {kind === "off" && (
          <p className="muted" style={{ marginBottom: 10 }}>
            この日は練習日ではありません（オフ）。出欠席率の計算には含めません。
          </p>
        )}
        <div className="sumrow">
          <div style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>
            <div className="v num">{yes}</div>
            <div className="l">出席</div>
          </div>
          <div style={{ background: "var(--ng-soft)", color: "var(--ng)" }}>
            <div className="v num">{no}</div>
            <div className="l">欠席</div>
          </div>
          <div style={{ background: "var(--bg)", color: "var(--sub)" }}>
            <div className="v num">{kind === "off" ? "—" : none}</div>
            <div className="l">未入力</div>
          </div>
        </div>
        {rows.length ? (
          <table className="tbl">
            <tbody>
              {sorted.map((x) => (
                <tr key={x.m.id} className="click" onClick={() => ctx.openPlayer(x.m.id)}>
                  <td>{x.m.name}</td>
                  <td>
                    <span className={`chip ${!x.r?.attendance ? "none" : x.r.attendance === "出席" ? "yes" : "no"}`}>
                      {attendLabel(x.r) ?? (kind === "off" ? "—" : "未入力")}
                    </span>
                  </td>
                  <td className="r num">{x.r?.weight ? fmt1(x.r.weight) + "kg" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">選手が登録されていません</div>
        )}
      </div>

      <div className="card">
        <h3>月別の出欠席率</h3>
        <Stepper
          label={ymLabel(ym)}
          onPrev={() => setYm(addMonths(ym, -1))}
          onNext={() => setYm(addMonths(ym, 1))}
          nextDisabled={ym >= ymOf(today())}
        />
        <p className="muted" style={{ marginBottom: 8 }}>
          {pCount
            ? `設定練習日数：${pCount}日。出席率＝練習日の出席日数÷練習日数（今日より後の練習日と、入部前の日は数えません）`
            : "この月は練習日が未設定のため、出欠を記録した日をもとに計算しています（「日程調整」で練習日を設定できます）"}
        </p>
        <div className="scroll">
          <table className="tbl">
            <tbody>
              <tr>
                <th>選手</th>
                <th className="r">出席</th>
                <th className="r">欠席</th>
                <th className="r">未入力</th>
                <th className="r">対象日数</th>
                <th className="r">出席率</th>
                <th className="r">欠席率</th>
                <th>欠席理由</th>
              </tr>
              {month.map((x) => (
                <tr key={x.m.id} className="click" onClick={() => ctx.openPlayer(x.m.id)}>
                  <td style={{ whiteSpace: "nowrap" }}>{x.m.name}</td>
                  <td className="r num">{x.yes}</td>
                  <td className="r num">{x.no}</td>
                  <td className="r num">{x.none}</td>
                  <td className="r num">{x.days}</td>
                  <td className="r num">
                    <b>{pct(x.rate)}</b>
                  </td>
                  <td className="r num">{pct(x.absentRate)}</td>
                  <td className="muted" style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                    {absenceSummary(x.m, ym + "-01", ym + "-31") || "—"}
                  </td>
                </tr>
              ))}
              <tr>
                <td>
                  <b>チーム全体</b>
                </td>
                <td className="r num">{tYes}</td>
                <td className="r num">{tNo}</td>
                <td className="r num">{tNone}</td>
                <td className="r num">{tDays}</td>
                <td className="r num">
                  <b>{pct(tDays ? (tYes / tDays) * 100 : null)}</b>
                </td>
                <td className="r num">{pct(tDays ? (tNo / tDays) * 100 : null)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------- 筋トレ遂行率 ---------- */
function TrainingPanel({ ctx, ps }: { ctx: Ctx; ps: Member[] }) {
  const weeks = recentWeeks(8);
  const cur = weeks[weeks.length - 1];
  const teamPts = weeks.map((w) => ({ d: w, v: teamTrainingAvg(ps, w) })).filter((p): p is { d: string; v: number } => p.v != null);
  const curAvg = teamTrainingAvg(ps, cur);
  const entered = ps.filter((m) => m.training[cur] != null).length;
  const criteria = ctx.settings.training_criteria;

  return (
    <>
      <div className="grid two">
        <div className="card">
          <h3>
            チーム平均 <small>今週（{md(cur)}〜）</small>
          </h3>
          <div className="kpi" style={{ padding: 0 }}>
            <div className="v num">
              {curAvg == null ? "—" : fmt1(curAvg)}
              <small>/ 10</small>
            </div>
            <div className="s">
              遂行率 {curAvg == null ? "—" : Math.round(curAvg * 10) + "%"} ・ 入力 {entered}/{ps.length}名
            </div>
          </div>
          <h3 style={{ marginTop: 14 }}>
            チーム平均の推移 <small>直近8週</small>
          </h3>
          <LineChart pts={teamPts} h={130} color="var(--ok)" />
        </div>
        <div className="card">
          <h3>評価基準</h3>
          <p className="muted" style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>
            {criteria || "まだ設定されていません（「項目設定」から入力できます）"}
          </p>
        </div>
      </div>
      <div className="card">
        <h3>
          選手ごとの週次推移 <small>0〜10 ・ 遂行率＝直近8週の平均÷10</small>
        </h3>
        <div className="scroll">
          <table className="tbl">
            <tbody>
              <tr>
                <th>選手</th>
                {weeks.map((w) => (
                  <th className="r" key={w}>
                    {md(w)}〜
                  </th>
                ))}
                <th className="r">遂行率</th>
              </tr>
              {ps.map((m) => {
                const a = trainingAvg(m, 8);
                return (
                  <tr key={m.id} className="click" onClick={() => ctx.openPlayer(m.id)}>
                    <td style={{ whiteSpace: "nowrap" }}>{m.name}</td>
                    {weeks.map((w) => (
                      <td className="r num" key={w}>
                        {m.training[w] ?? <span className="muted">—</span>}
                      </td>
                    ))}
                    <td className="r num">
                      <b>{a == null ? "—" : Math.round(a * 10) + "%"}</b>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
