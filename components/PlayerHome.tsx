"use client";

// S02 選手ダッシュボード（ホーム）。コーチの「チームダッシュボード」と同じ操作感
//  ・一番上：今日の記録バナー
//  ・その下：4つのメニュー（出欠席率 / 筋トレ遂行率 / 体組成 / フィジカル）。押すと詳細、もう一度押すと戻る
//  ・何も選んでいないときは、バナーと4つのボタンだけ（中身は各ボタンを押したときに表示）

import { Fragment, useMemo, useState } from "react";
import LineChart from "./LineChart";
import MultiLineChart, { type Series } from "./MultiLineChart";
import { MonthBar, avg, valueAsOf } from "./GroupStats";
import { CriteriaButton, TeamRanking, type Ctx } from "./Shared";
import {
  LIFTS,
  addDays,
  attendLabel,
  attendStats,
  attendStreak,
  attendTargets,
  dayKind,
  dayType,
  fmt0,
  fmt1,
  fmtRatio,
  latestWeight,
  maxes,
  md,
  metricBest,
  metricLatest,
  metricRatio,
  metricSeries,
  metricsOf,
  monthAttendance,
  phys,
  playersOf,
  allPlayersOf,
  ranking,
  trainingRate,
  teamTrainingAvg,
  DEFAULT_MENU,
  menuLabel,
  trainingMonthAvg,
  weekShort,
  summaryWeek,
  recentWeeks,
  today,
  unitOf,
  unitOfPosition,
  wd,
  weightNote,
  timingText,
  weekStart,
  weightAgo,
  weights,
  ymLabel,
  ymOf,
  weightAt,
  type Point,
  type RankRow,
  fmtMetric,
  fmtMinSec,
  isMinSec,
  basisLabel
} from "@/lib/calc";
import type { Member, Unit } from "@/lib/types";

type Panel = "attend" | "training" | "body" | "physical";
const UNIT_COLOR: Record<Unit, string> = { FW: "#2563a8", BK: "#e07b00" };

const signed = (v: number, f: (v: number) => string = fmt1) => (v >= 0 ? "+" : "") + f(v);

export function PlayerHome({ ctx }: { ctx: Ctx }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const m = ctx.me,
    t = today(),
    rec = m.daily[t],
    kind = dayKind(t, ctx.practice);

  // ボタンに出す概要
  const monthRate = monthAttendance(m, ymOf(t), ctx.practice).rate;
  const totalRate = attendStats(m, ctx.practice, "0000-01-01", t).rate; // トータル（全期間）
  const sw = summaryWeek(m.training, t); // 直近で終わった週（詳細画面のサマリーと同じ週）
  const weekScore = m.training[sw];
  const lw = latestWeight(m),
    w30 = weightAgo(m, 30);
  const rk = ranking(ctx.members, "total"),
    pos = rk.findIndex((r) => r.id === m.id);
  const total = maxes(m).total;

  const menus: [Panel, string, string][] = [
    ["attend", "出欠席率", `今月 ${monthRate == null ? "—" : Math.round(monthRate) + "%"}・トータル ${totalRate == null ? "—" : Math.round(totalRate) + "%"}`],
    ["training", "筋トレ遂行率", `${weekShort(sw)} ${weekScore == null ? "未入力" : `${fmt1(weekScore)} / 10`}`],
    ["body", "体組成", lw ? `${fmt1(lw.v)}kg${w30 ? `（30日前比 ${signed(lw.v - w30.v)}kg）` : ""}` : "体重 未入力"],
    ["physical", "フィジカル", total ? `Big3 ${fmt0(total)}kg${pos >= 0 ? `（${pos + 1}位）` : ""}` : "Big3 未測定"],
  ];

  return (
    <>
      <div className={`today ${rec || kind === "off" ? "done" : "todo"}`}>
        <div className="tx">
          {kind !== "unset" && (
            <span className={`daytag ${kind}`} style={{ marginBottom: 4, background: "#fff" }}>
              {kind === "practice" ? `今日は${dayType(t, ctx.practice)}日` : "今日はオフ"}
            </span>
          )}
          {rec ? (
            <>
              <div>今日の記録は完了 ✓</div>
              <small>
                {attendLabel(rec) ?? "オフ"}
                {rec.weight ? ` ・ ${fmt1(rec.weight)}kg${weightNote(rec)}` : ""}
              </small>
            </>
          ) : kind === "off" ? (
            <>
              <div>今日は練習日ではありません</div>
              <small>出欠の入力は不要です（体重だけ記録できます）</small>
            </>
          ) : (
            <>
              今日の記録がまだです
              <small>
                {md(t)}（{wd(t)}） 出欠と体重を入力しよう
              </small>
            </>
          )}
        </div>
        <button onClick={() => ctx.go("input")}>{rec ? "修正する" : "入力する"}</button>
      </div>

      {/* コーチ画面と同じ4つのメニュー。もう一度押すと最初の表示に戻る */}
      <div className="menu4">
        {menus.map(([k, l, sub]) => (
          <button key={k} className={`m-${k} ${panel === k ? "on" : ""}`} onClick={() => setPanel(panel === k ? null : k)} aria-pressed={panel === k}>
            <b>{l}</b>
            <span>{sub}</span>
          </button>
        ))}
      </div>

      {/* 詳細のカードの上辺に、選んでいるボタンと同じ色の線（出欠＝緑・筋トレ＝黄土・体組成＝青・フィジカル＝赤） */}
      {panel && (
        <div className={`panel-${panel}`}>
          {panel === "attend" && <AttendDetail ctx={ctx} />}
          {panel === "training" && <TrainingDetail ctx={ctx} />}
          {panel === "body" && <BodyDetail ctx={ctx} />}
          {panel === "physical" && <PhysicalDetail ctx={ctx} />}
        </div>
      )}

    </>
  );
}

/* ---------- 体重の推移（自分＋自分の区分 FW/BK の平均を点線で） ---------- */
function WeightChart({ ctx, days }: { ctx: Ctx; days: number }) {
  const m = ctx.me;
  const unit = unitOfPosition(m.position);
  const series = useMemo(() => {
    const from = addDays(today(), -days + 1);
    const mine = weights(m, days);
    const out: Series[] = [{ label: "自分", color: "var(--accent)", pts: mine }];
    if (unit) {
      // 同じ区分（FW / BK）の選手全員の、その日時点の最新体重の平均
      const mates = playersOf(ctx.members)
        .filter((x) => unitOfPosition(x.position) === unit)
        .map((x) => weights(x));
      const pts = [];
      for (let d = from; d <= today(); d = addDays(d, 1)) {
        const v = avg(mates.map((w) => valueAsOf(w, d)));
        if (v != null) pts.push({ d, v });
      }
      if (pts.length) {
        out.push({ label: `${unit}平均 ${fmt1(pts[pts.length - 1].v)}kg`, color: UNIT_COLOR[unit], pts, dash: true });
      }
    }
    return out;
  }, [ctx.members, m, unit, days]);
  // 吹き出し：日付・自分の体重・測ったタイミング（例：練習後）
  return <MultiLineChart series={series} h={180} unit="kg" note={(d) => timingText(m.daily[d])} />;
}

/* ---------- 詳細：出欠席率 ---------- */
function AttendDetail({ ctx }: { ctx: Ctx }) {
  const m = ctx.me;
  const [ym, setYm] = useState(ymOf(today()));
  const st = monthAttendance(m, ym, ctx.practice);
  const days = attendTargets(m, ctx.practice, ym + "-01", ym + "-31").reverse();
  const streak = attendStreak(m, ctx.practice);
  const pct = (v: number | null) => (v == null ? "—" : Math.round(v) + "%");
  // 一番上：今月とトータル（最初の練習日から今日まで）の2列
  const now = monthAttendance(m, ymOf(today()), ctx.practice);
  const total = attendStats(m, ctx.practice, "0000-01-01", today());
  return (
    <div className="card">
      <div className="sum2 att2">
        {(
          [
            ["今月", now],
            ["トータル", total],
          ] as const
        ).map(([l, x]) => (
          <div key={l} className={l === "今月" ? "now" : "alltime"}>
            <div className="l">{l}</div>
            <div className="v num">{x.days ? pct(x.rate) : "—"}</div>
            <div className="s num">
              {x.yes} / {x.days}回
            </div>
          </div>
        ))}
      </div>
      {streak > 0 && <p className="muted" style={{ margin: "-4px 0 10px", fontSize: 12 }}>連続 {streak}回出席中</p>}

      {/* 月ごとの振り返り */}
      <MonthBar ym={ym} setYm={setYm} />
      <p className="muted" style={{ marginBottom: 8 }}>
        出席率 <b style={{ color: "var(--ok)" }}>{pct(st.rate)}</b> ・ 出席 {st.yes}/{st.days}回 ・ 欠席 {st.no}回 ・ 未入力 {st.none}回
      </p>
      <TeamCompare ctx={ctx} ym={ym} />
      {days.length ? (
        <table className="tbl">
          <tbody>
            {days.map((d) => {
              const r = m.daily[d];
              return (
                <tr key={d}>
                  <td>
                    {md(d)}（{wd(d)}）
                  </td>
                  <td className="r">
                    <span className={`chip ${!r?.attendance ? "none" : r.attendance === "出席" ? "yes" : "no"}`}>{attendLabel(r) ?? "未入力"}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="empty">この月の記録はありません</div>
      )}
    </div>
  );
}

// 自分とチーム全体（選手全員の出席率の平均）の比較：選んだ月 / 直近30日
function TeamCompare({ ctx, ym }: { ctx: Ctx; ym: string }) {
  const m = ctx.me;
  const ps = playersOf(ctx.members);
  const from30 = addDays(today(), -29);
  const rows: [string, number | null, number | null][] = [
    [ymLabel(ym), monthAttendance(m, ym, ctx.practice).rate, avg(ps.map((x) => monthAttendance(x, ym, ctx.practice).rate))],
    ["直近30日", attendStats(m, ctx.practice, from30, today()).rate, avg(ps.map((x) => attendStats(x, ctx.practice, from30, today()).rate))],
  ];
  const pct = (v: number | null) => (v == null ? "—" : Math.round(v) + "%");
  return (
    <table className="tbl cmp-tbl" style={{ marginBottom: 12 }}>
      <tbody>
        <tr>
          <th />
          <th className="r">自分</th>
          <th className="r">チーム平均</th>
          <th className="r">差</th>
        </tr>
        {rows.map(([l, mine, team]) => (
          <tr key={l}>
            <td>{l}</td>
            <td className="r num">
              <b>{pct(mine)}</b>
            </td>
            <td className="r num">{pct(team)}</td>
            <td className="r num">
              {mine == null || team == null ? (
                <span className="muted">—</span>
              ) : (
                <b className={mine - team >= 0 ? "up" : "down"}>
                  {mine - team >= 0 ? "▲+" : "▼"}
                  {Math.round(mine - team)}
                </b>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------- 詳細：筋トレ遂行率 ---------- */
function TrainingDetail({ ctx }: { ctx: Ctx }) {
  const m = ctx.me;
  const ps = playersOf(ctx.members);
  const thisWeek = weekStart(today());
  const from4 = recentWeeks(4)[0]; // 直近4週の最初の週（月曜日）
  const [ym, setYm] = useState(ymOf(today()));
  const fmtScore = (v: number | null) => (v == null ? "—" : `${fmt1(v)} / 10`);
  // 1. 一番上のサマリー：直近で終わった週（前週の月曜〜日曜）の遂行率と、トータル平均（全期間）
  //    ホームのボタンと同じ週（summaryWeek）を使う
  const sumWeek = summaryWeek(m.training);
  const weekScore = m.training[sumWeek] ?? null;
  const totalAvg = trainingRate(m);
  const menuOf = (w: string) => ctx.weeks[w]?.menu ?? DEFAULT_MENU;
  // 3. 比較表：選んだ月・直近4週を、自分とチーム平均（選手ごとの平均の平均）で
  const rows: [string, (x: Member) => number | null][] = [
    [ymLabel(ym), (x) => trainingMonthAvg(x, ym)],
    ["直近4週", (x) => trainingRate(x, from4)],
  ];
  // 4. 推移グラフ（直近8週）：自分と、各週のチーム平均（入力した選手の平均）
  const pts = recentWeeks(8)
    .filter((w) => m.training[w] != null)
    .map((w) => ({ d: w, v: m.training[w] }));
  const teamPts = recentWeeks(8)
    .map((w) => ({ d: w, v: teamTrainingAvg(ps, w) }))
    .filter((p): p is { d: string; v: number } => p.v != null);
  // 5. 週ごとの一覧：この週から、いちばん古い記録の週まで（新しい週が上。未入力の週も表示）
  const recorded = Object.keys(m.training).sort();
  const weeksList: string[] = [];
  if (recorded.length) for (let w = thisWeek; w >= recorded[0]; w = addDays(w, -7)) weeksList.push(w);
  else weeksList.push(thisWeek);

  return (
    <div className="card">
      {/* 見出しの右に「評価基準」ボタン（押すとメニューごとの評価基準の一覧） */}
      <h3 className="crit-head">
        筋トレ遂行率 <small>0〜10</small>
        <CriteriaButton ctx={ctx} />
      </h3>
      <div className="sum2 tr2">
        <div>
          <div className="l">{weekShort(sumWeek)}</div>
          <div className="v num">
            {weekScore == null ? "—" : fmt1(weekScore)}
            <small>/ 10</small>
          </div>
          <div className="s">メニュー {menuLabel(menuOf(sumWeek))}</div>
        </div>
        <div>
          <div className="l">トータル平均</div>
          <div className="v num">
            {totalAvg == null ? "—" : fmt1(totalAvg)}
            <small>/ 10</small>
          </div>
          <div className="s">全期間</div>
        </div>
      </div>

      <MonthBar ym={ym} setYm={setYm} />

      <table className="tbl cmp-tbl" style={{ marginBottom: 12 }}>
        <tbody>
          <tr>
            <th />
            <th className="r">自分</th>
            <th className="r">チーム平均</th>
            <th className="r">差</th>
          </tr>
          {rows.map(([l, pick]) => {
            const mine = pick(m);
            const team = avg(ps.map(pick));
            return (
              <tr key={l}>
                <td>{l}</td>
                <td className="r num">
                  <b>{fmtScore(mine)}</b>
                </td>
                <td className="r num">{fmtScore(team)}</td>
                <td className="r num">
                  {mine == null || team == null ? (
                    <span className="muted">—</span>
                  ) : (
                    <b className={mine - team >= 0 ? "up" : "down"}>
                      {mine - team >= 0 ? "▲+" : "▼"}
                      {fmt1(mine - team)}
                    </b>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {pts.length >= 1 && (
        <div style={{ marginBottom: 12 }}>
          <MultiLineChart
            h={150}
            minRange={2}
            series={[
              { label: "自分", color: "#a16207", pts, dots: true },
              { label: "チーム平均", color: "#8a929c", pts: teamPts, dash: true },
            ]}
            note={(w) => `メニュー ${menuLabel(menuOf(w))}`}
            noteAny
            weekly
          />
        </div>
      )}

      <table className="tbl">
        <tbody>
          {weeksList.map((w) => {
            const v = m.training[w];
            return (
              <Fragment key={w}>
              <tr>
                <td>
                  {weekShort(w)} <span className="muted">{menuOf(w)}</span>
                </td>
                <td className="r">
                  <span className={`chip ${v == null ? "none" : "tr"}`}>{v == null ? "未入力" : `${fmt1(v)} / 10`}</span>
                </td>
              </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 詳細：体組成（体重のみ） ---------- */
function BodyDetail({ ctx }: { ctx: Ctx }) {
  const m = ctx.me;
  const lw = latestWeight(m),
    w7 = weightAgo(m, 7),
    w30 = weightAgo(m, 30);
  const diff = (b: { v: number } | null) =>
    lw && b ? <b className={lw.v - b.v >= 0 ? "up" : "down"}>{signed(lw.v - b.v)}</b> : <span className="muted">—</span>;
  return (
    <div className="card">
      <div className="sumrow">
        <div style={{ background: "#e3edf8", color: "#1d4f86" }}>
          <div className="v num">{lw ? fmt1(lw.v) : "—"}</div>
          <div className="l">
            体重（kg）
            {lw && m.daily[lw.d] && weightNote(m.daily[lw.d]) && <span style={{ display: "block", fontWeight: 400 }}>{weightNote(m.daily[lw.d])}</span>}
          </div>
        </div>
        <div style={{ background: "var(--bg)", color: "var(--ink)" }}>
          <div className="v num" style={{ fontSize: 22 }}>
            {diff(w7)}
          </div>
          <div className="l">7日前比</div>
        </div>
        <div style={{ background: "var(--bg)", color: "var(--ink)" }}>
          <div className="v num" style={{ fontSize: 22 }}>
            {diff(w30)}
          </div>
          <div className="l">30日前比</div>
        </div>
      </div>
      <h3>
        体重の推移 <small>直近30日</small>
      </h3>
      <WeightChart ctx={ctx} days={30} />
    </div>
  );
}

/* ---------- 詳細：フィジカル（プルダウンで種目を選ぶ・1画面に収める） ---------- */
// 選択肢：項目設定のフィジカル項目。体重比が ON の項目は「〇〇体重比」も
// 順位は自己ベスト（体重比は自己ベスト÷その日の体重）で、チーム内と自分の区分（FW/BK）内
// topOnly：上のカード（種目選択・自己ベスト/最新値・自分の記録・順位・推移）だけ。コーチの選手詳細で使う
export function PhysicalDetail({ ctx, topOnly = false }: { ctx: Ctx; topOnly?: boolean }) {
  const m = ctx.me;
  const defs = metricsOf(ctx.metrics, "フィジカル");
  const first = defs.find((x) => x.key === "big3_total") ?? defs[0];
  const [sel, setSel] = useState<string | null>(null);
  // 表示の基準：自己ベスト／最新値（上の自分の記録・順位と、下のランキングが連動）
  const [mode, setMode] = useState<"best" | "latest">("best");
  const key = sel ?? (first ? "m" + first.id : "");
  const def = defs.find((x) => "m" + x.id === key || "r" + x.id === key);
  if (!def) return <div className="card empty">フィジカルの項目がありません</div>;
  const ratio = key === "r" + def.id;

  const options: [string, string][] = defs.flatMap((x) => {
    const o: [string, string][] = [["m" + x.id, x.name + basisLabel(x)]];
    if (x.show_ratio) o.push(["r" + x.id, `${x.name}体重比`]);
    return o;
  });

  // 値（体重比なら、その記録の日の体重で割る）
  const toRatio = (p: Point | null) => {
    if (!p || !p.v) return null;
    const w = weightAt(m, p.d);
    return w ? p.v / w : null;
  };
  const series = metricSeries(m, def);
  const f = (v: number | null) => (v == null ? "—" : ratio ? fmtRatio(v) : fmtMetric(def, v));
  const u = ratio ? "倍" : unitOf(def);

  // 選手1人の値（基準に合わせて）。表示しているのと同じ記録の体重比も返す
  //  自己ベスト：タイム系は最小・それ以外は最大（項目の「良い向き」）。体重比はその記録の日の体重で割る
  //  最新値：いちばん新しい記録。Big3合計は3種目それぞれの最新の記録の合計
  const valueOf = (x: Member): { v: number | null; d: string | null; r: number | null } => {
    const w = (pt: Point | null) => {
      const wt = pt && pt.v ? weightAt(x, pt.d) : null;
      return pt && wt ? pt.v / wt : null;
    };
    if (mode === "best") {
      const v = metricBest(x, def);
      const r = metricRatio(x, def);
      return ratio ? { v: r, d: null, r: null } : { v, d: null, r };
    }
    let pt: Point | null;
    if (def.key === "big3_total") {
      const lp = LIFTS.map(([k]) => [...phys(x)].reverse().find((row) => row[k] != null)).filter(Boolean);
      const vals = LIFTS.map(([k]) => [...phys(x)].reverse().find((row) => row[k] != null)?.[k] ?? null);
      const sum = vals.reduce<number>((a, b) => a + (Number(b) || 0), 0);
      const d = lp.map((row) => row!.d).sort().pop() ?? null;
      pt = sum > 0 && d ? { d, v: sum } : null;
    } else pt = metricLatest(x, def);
    return ratio ? { v: w(pt), d: pt?.d ?? null, r: null } : { v: pt?.v ?? null, d: pt?.d ?? null, r: w(pt) };
  };
  const mine = valueOf(m);

  // 順位（選んだ基準で）。体重比は大きい順、それ以外は良い向きの順
  const rows: RankRow[] = playersOf(ctx.members)
    .map((x) => ({ id: x.id, name: x.name, v: valueOf(x).v }))
    .filter((r): r is RankRow => r.v != null)
    .sort((a, b) => (!ratio && def.better === "low" ? a.v - b.v : b.v - a.v));
  const pos = rows.findIndex((r) => r.id === m.id);
  const unit = unitOfPosition(m.position);
  const urows = unit ? rows.filter((r) => unitOfPosition(ctx.members[r.id]?.position) === unit) : [];
  const upos = urows.findIndex((r) => r.id === m.id);

  const chart = ratio ? series.map((p) => ({ d: p.d, v: toRatio(p) })).filter((p): p is Point => p.v != null) : series;

  return (
    <>
      <div className="card accent-top">
      <select className="t phys-sel" style={{ width: "100%", marginBottom: 10 }} value={key} onChange={(e) => setSel(e.target.value)} aria-label="種目を選ぶ">
        {options.map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
      <div className="seg" style={{ marginBottom: 10 }}>
        <button className={mode === "best" ? "on" : ""} onClick={() => setMode("best")}>
          自己ベスト
        </button>
        <button className={mode === "latest" ? "on" : ""} onClick={() => setMode("latest")}>
          最新値
        </button>
      </div>
      {def.key === "big3_total" && !ratio ? (
        <Big3Block ctx={ctx} mode={mode} />
      ) : (
      <div className="mine1">
        <div className="l">{mode === "best" ? "自己ベスト" : "最新値"}</div>
        <div className="v num">
          {f(mine.v)}
          {u && <small>{u}</small>}
        </div>
        <div className="s">
          {!ratio && def.show_ratio && mine.r != null && `${fmtRatio(mine.r)}倍`}
          {mine.d && `${!ratio && def.show_ratio && mine.r != null ? " ・ " : ""}${md(mine.d)}`}
        </div>
      </div>
      )}
      <div className="rankrow">
        <span className="rankpill">{pos >= 0 ? `チーム ${pos + 1}位 / ${rows.length}人` : "チーム —"}</span>
        {unit && (
          <span className="rankpill" style={{ background: UNIT_COLOR[unit] }}>
            {upos >= 0 ? `${unit} ${upos + 1}位 / ${urows.length}人` : `${unit} —`}
          </span>
        )}
      </div>
      {chart.length >= 2 && (
        <LineChart pts={chart} h={110} color="var(--accent)" minRange={ratio ? 0.2 : 2} digits={ratio ? 2 : 1} fmt={!ratio && isMinSec(def) ? fmtMinSec : undefined} />
      )}
      </div>

      {!topOnly && (
      <>
      {/* 下段：選んだ種目のチームランキング */}
      <div className="card">
        <h3>
          {mode === "best" ? "自己ベストランキング" : "最新値ランキング"} <small>{options.find(([k]) => k === key)?.[1]}</small>
        </h3>
        <TeamRanking
          ctx={ctx}
          rows={rows}
          fmtV={(r) => (
            // 単位（kg・秒・m/s*kg など）は数値より小さく
            <>
              {ratio ? fmtRatio(r.v) : fmtMetric(def, r.v)}
              {u && <small>{u}</small>}
            </>
          )}
        />
      </div>

      <PhysHistory ctx={ctx} />
      </>
      )}
    </>
  );
}

// 『Big3合計』を選んだとき：3種目（横3列）＋合計・体重比
//  自己ベスト：種目ごとの自己ベストと、その合計 / 最新値：種目ごとのいちばん新しい記録と、その合計
// 3種目の名前は「項目設定」で変えていればその名前
function Big3Block({ ctx, mode }: { ctx: Ctx; mode: "best" | "latest" }) {
  const m = ctx.me;
  const mx = maxes(m);
  const p = phys(m);
  const lastRow = (k: (typeof LIFTS)[number][0]) => [...p].reverse().find((r) => r[k] != null) ?? null;
  const vals = LIFTS.map(([k]) => (mode === "best" ? mx[k] : lastRow(k)?.[k] ?? null));
  const total = vals.reduce<number>((a, b) => a + (Number(b) || 0), 0) || null;
  // 体重比：自己ベストは各記録の日の体重、最新値はいちばん新しい記録の日の体重
  const totalDef = ctx.metrics.find((x) => x.key === "big3_total");
  const latestDay = LIFTS.map(([k]) => lastRow(k)?.d ?? "").sort().pop();
  const totalRatio =
    mode === "best"
      ? totalDef
        ? metricRatio(m, totalDef)
        : mx.ratio
      : total && latestDay && weightAt(m, latestDay)
        ? total / (weightAt(m, latestDay) as number)
        : null;
  return (
    <>
      <div className="big3" style={{ marginBottom: 8 }}>
        {LIFTS.map(([k, l], i) => {
          const def = ctx.metrics.find((x) => x.key === k);
          const r = mode === "best" && def?.show_ratio ? metricRatio(m, def) : null;
          const row = lastRow(k);
          return (
            <div className="lift" key={k}>
              <div className="l">{def?.name ?? l}</div>
              <div className="v num">
                {fmt0(vals[i])}
                <small>kg</small>
              </div>
              <div className="d">{r != null ? `${fmtRatio(r)}倍` : mode === "latest" && row ? md(row.d) : ""}</div>
            </div>
          );
        })}
      </div>
      <div className="total" style={{ marginTop: 0, marginBottom: 10 }}>
        <span className="muted">合計（Total）</span>
        <span className="v num">
          {fmt0(total)}
          <small className="muted" style={{ fontSize: 14 }}>
            {" "}
            kg
          </small>
          {totalRatio != null && (
            <small className="muted" style={{ fontSize: 14, marginLeft: 8 }}>
              ×{fmtRatio(totalRatio)}
            </small>
          )}
        </span>
      </div>
    </>
  );
}

// 測定履歴（全種目）：日付ごとに、項目設定のフィジカル種目すべて（Big3・Big3合計・ブロンコなど）を横に並べた表
// 左端の「測定日」の列は固定。横にスライドすると、その日に測った全種目の数値が見られる（新しい日が上）
function PhysHistory({ ctx }: { ctx: Ctx }) {
  const m = ctx.me;
  const defs = metricsOf(ctx.metrics, "フィジカル");
  const hist = new Map(defs.map((x) => [x.id, new Map(metricSeries(m, x).map((pt) => [pt.d, pt.v]))]));
  const dates = [...new Set([...hist.values()].flatMap((mp) => [...mp.keys()]))].sort().reverse();

  // 👑：その測定日までに記録されたチーム全員の全記録の中で1位（同率1位を含む）
  //  タイム系など「小さいほど良い」項目は最小、それ以外（重量・距離・モメンタムなど）は最大
  //  OB も含めて判定する（引退した選手が抜けても、過去の👑が書き換わらないように）
  const team = new Map(
    defs.map((x) => [
      x.id,
      allPlayersOf(ctx.members)
        .flatMap((p) => metricSeries(p, x))
        .sort((a, b) => (a.d < b.d ? -1 : 1)),
    ]),
  );
  const isTeamTop = (x: (typeof defs)[number], d: string, v: number) => {
    const low = x.better === "low";
    let best: number | null = null;
    for (const pt of team.get(x.id) ?? []) {
      if (pt.d > d) break;
      if (best == null || (low ? pt.v < best : pt.v > best)) best = pt.v;
    }
    return best != null && Math.abs(v - best) < 1e-9;
  };
  return (
    <div className="card">
      <h3>
        測定履歴 <small>全種目・横にスライド</small>
      </h3>
      {dates.length ? (
        <div className="ph-wrap">
          <table className="ph">
            <thead>
              <tr>
                <th className="ph-d">測定日</th>
                {defs.map((x) => (
                  <th key={x.id}>
                    {x.name}
                    {unitOf(x) && <small>({unitOf(x)})</small>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates.map((d) => (
                <tr key={d}>
                  <td className="ph-d">{md(d)}</td>
                  {defs.map((x) => {
                    const v = hist.get(x.id)?.get(d);
                    const top = v != null && isTeamTop(x, d, v);
                    return (
                      <td key={x.id} className={`num ${top ? "ph-top" : ""}`}>
                        {top && <span className="crown">👑</span>}
                        {x.key === "big3_total" ? <b>{fmtMetric(x, v)}</b> : fmtMetric(x, v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">まだ記録がありません</div>
      )}
      {dates.length > 0 && <p className="muted" style={{ marginTop: 6, fontSize: 11 }}>👑 その測定日時点のチーム内トップ記録</p>}
    </div>
  );
}
