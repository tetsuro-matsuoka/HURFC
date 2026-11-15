"use client";

// S02 選手ダッシュボード（ホーム）。コーチの「チームダッシュボード」と同じ操作感
//  ・一番上：今日の記録バナー
//  ・その下：4つのメニュー（出欠席率 / 筋トレ遂行率 / 体組成 / フィジカル）。押すと詳細、もう一度押すと戻る
//  ・何も選んでいないとき：体重の推移（自分＋FW/BK平均の点線）と Big3 自己ベスト（チーム順位・FW/BK内順位）

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import LineChart from "./LineChart";
import MultiLineChart, { type Series } from "./MultiLineChart";
import { avg, valueAsOf } from "./GroupStats";
import type { Ctx } from "./Shared";
import {
  LIFTS,
  addDays,
  addMonths,
  attendLabel,
  attendStreak,
  attendTargets,
  dayKind,
  fmt0,
  fmt1,
  fmt2,
  fmtRatio,
  isLinked,
  latestWeight,
  maxes,
  md,
  metricBest,
  metricLatest,
  metricRanking,
  metricRatio,
  metricSeries,
  metricsOf,
  monthAttendance,
  phys,
  playersOf,
  ranking,
  recentWeeks,
  today,
  trainingAvg,
  unitOf,
  unitOfPosition,
  wd,
  weekStart,
  weightAgo,
  weights,
  ymLabel,
  ymOf,
} from "@/lib/calc";
import type { Unit } from "@/lib/types";

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
  const streak = attendStreak(m, ctx.practice);
  const weekScore = m.training[weekStart(t)];
  const lw = latestWeight(m),
    w30 = weightAgo(m, 30);
  const rk = ranking(ctx.members, "total"),
    pos = rk.findIndex((r) => r.id === m.id);
  const total = maxes(m).total;

  const menus: [Panel, string, string][] = [
    ["attend", "出欠席率", `今月 ${monthRate == null ? "—" : Math.round(monthRate) + "%"}${streak ? `・連続${streak}回出席中` : ""}`],
    ["training", "筋トレ遂行率", weekScore == null ? "今週 未入力" : `今週 ${weekScore} / 10`],
    ["body", "体組成", lw ? `${fmt1(lw.v)}kg${w30 ? `（30日前比 ${signed(lw.v - w30.v)}kg）` : ""}` : "体重 未入力"],
    ["physical", "フィジカル", total ? `Big3 ${fmt0(total)}kg${pos >= 0 ? `（${pos + 1}位）` : ""}` : "Big3 未測定"],
  ];

  return (
    <>
      <div className={`today ${rec || kind === "off" ? "done" : "todo"}`}>
        <div className="tx">
          {kind !== "unset" && (
            <span className={`daytag ${kind}`} style={{ marginBottom: 4, background: "#fff" }}>
              {kind === "practice" ? "今日は練習日" : "今日はオフ"}
            </span>
          )}
          {rec ? (
            <>
              <div>今日の記録は完了 ✓</div>
              <small>
                {attendLabel(rec) ?? "オフ"}
                {rec.weight ? ` ・ ${fmt1(rec.weight)}kg` : ""}
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

      {panel === "attend" && <AttendDetail ctx={ctx} />}
      {panel === "training" && <TrainingDetail ctx={ctx} />}
      {panel === "body" && <BodyDetail ctx={ctx} />}
      {panel === "physical" && <PhysicalDetail ctx={ctx} />}

      {!panel && (
        <div className="grid two">
          <div className="card">
            <h3>
              体重の推移 <small>直近30日</small>
            </h3>
            <WeightChart ctx={ctx} days={30} />
          </div>
          <Big3Card ctx={ctx} />
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
  return <MultiLineChart series={series} h={180} />;
}

/* ---------- Big3 自己ベスト（赤いアクセントライン・チーム順位・区分内順位） ---------- */
function Big3Card({ ctx }: { ctx: Ctx }) {
  const m = ctx.me;
  const mx = maxes(m),
    p = phys(m),
    lastP = p[p.length - 1];
  const rk = ranking(ctx.members, "total"),
    pos = rk.findIndex((r) => r.id === m.id);
  const unit = unitOfPosition(m.position);
  const urk = unit ? rk.filter((r) => unitOfPosition(ctx.members[r.id]?.position) === unit) : [];
  const upos = urk.findIndex((r) => r.id === m.id);

  return (
    <div className="card accent-top">
      <h3 style={{ flexWrap: "wrap" }}>
        Big3 自己ベスト
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {pos >= 0 && (
            <span className="rankpill">
              チーム {pos + 1}位 / {rk.length}人
            </span>
          )}
          {unit && upos >= 0 && (
            <span className="rankpill" style={{ background: UNIT_COLOR[unit] }}>
              {unit} {upos + 1}位 / {urk.length}人
            </span>
          )}
        </span>
      </h3>
      <div className="big3">
        {LIFTS.map(([k, l]) => (
          <div className="lift" key={k}>
            <div className="l">{l}</div>
            <div className="v num">
              {fmt0(mx[k])}
              <small>kg</small>
            </div>
            <div className="d">{lastP && lastP[k] ? "前回 " + fmt0(lastP[k]) : ""}</div>
          </div>
        ))}
      </div>
      <div className="total">
        <span className="muted">合計（Total）</span>
        <span className="v num">
          {fmt0(mx.total)}
          <small className="muted" style={{ fontSize: 14 }}>
            {" "}
            kg
          </small>
        </span>
      </div>
      {mx.ratio && (
        <div className="muted" style={{ textAlign: "right" }}>
          体重比 ×{mx.ratio.toFixed(2)}
        </div>
      )}
      <p className="muted" style={{ marginTop: 8 }}>
        {lastP ? `最終測定 ${md(lastP.d)}` : "「記録する」→「測定」から測定値を入力できます"}
      </p>
    </div>
  );
}

/* ---------- 詳細：出欠席率 ---------- */
function AttendDetail({ ctx }: { ctx: Ctx }) {
  const m = ctx.me;
  const [ym, setYm] = useState(ymOf(today()));
  const st = monthAttendance(m, ym, ctx.practice);
  const days = attendTargets(m, ctx.practice, ym + "-01", ym + "-31").reverse();
  const streak = attendStreak(m, ctx.practice);
  const pct = (v: number | null) => (v == null ? "—" : Math.round(v) + "%");
  return (
    <div className="card">
      <MonthBar ym={ym} setYm={setYm} />
      <div className="sumrow">
        <div style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>
          <div className="v num">{pct(st.rate)}</div>
          <div className="l">出席率</div>
        </div>
        <div style={{ background: "var(--bg)", color: "var(--ink)" }}>
          <div className="v num">
            {st.yes}/{st.days}
          </div>
          <div className="l">出席 / 練習日</div>
        </div>
        <div style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
          <div className="v num">{streak}</div>
          <div className="l">連続出席</div>
        </div>
      </div>
      <p className="muted" style={{ marginBottom: 8 }}>
        欠席 {st.no}回 ・ 未入力 {st.none}回
      </p>
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

function MonthBar({ ym, setYm }: { ym: string; setYm: (v: string) => void }) {
  const last = ym >= ymOf(today());
  return (
    <div className="datebar compact">
      <button onClick={() => setYm(addMonths(ym, -1))} aria-label="前の月">
        ‹
      </button>
      <b style={{ flex: 1, textAlign: "center" }}>{ymLabel(ym)}</b>
      <button onClick={() => !last && setYm(addMonths(ym, 1))} disabled={last} style={last ? { opacity: 0.3 } : undefined} aria-label="次の月">
        ›
      </button>
    </div>
  );
}

/* ---------- 詳細：筋トレ遂行率 ---------- */
function TrainingDetail({ ctx }: { ctx: Ctx }) {
  const m = ctx.me;
  const weeks = recentWeeks(8);
  const a = trainingAvg(m, 8);
  const pts = weeks.filter((w) => m.training[w] != null).map((w) => ({ d: w, v: m.training[w] }));
  return (
    <div className="card">
      <div className="sumrow" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
          <div className="v num">{m.training[weeks[weeks.length - 1]] ?? "—"}</div>
          <div className="l">今週（0〜10）</div>
        </div>
        <div style={{ background: "var(--bg)", color: "var(--ink)" }}>
          <div className="v num">{a == null ? "—" : Math.round(a * 10) + "%"}</div>
          <div className="l">達成率（直近8週）</div>
        </div>
      </div>
      <h3>
        直近8週の推移 <small>0〜10</small>
      </h3>
      <LineChart pts={pts} h={140} color="var(--warn)" />
      <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => ctx.go("input")}>
        「記録する → 筋トレ」で入力する
      </button>
    </div>
  );
}

/* ---------- 詳細：体組成 ---------- */
function BodyDetail({ ctx }: { ctx: Ctx }) {
  const m = ctx.me;
  const lw = latestWeight(m),
    w7 = weightAgo(m, 7),
    w30 = weightAgo(m, 30);
  const others = metricsOf(ctx.metrics, "体組成").filter((x) => x.key !== "weight");
  const diff = (b: { v: number } | null) =>
    lw && b ? <b className={lw.v - b.v >= 0 ? "up" : "down"}>{signed(lw.v - b.v)}kg</b> : <span className="muted">—</span>;
  return (
    <>
      <div className="card">
        <div className="sumrow">
          <div style={{ background: "#e3edf8", color: "#1d4f86" }}>
            <div className="v num">{lw ? fmt1(lw.v) : "—"}</div>
            <div className="l">体重（kg）</div>
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
          体重の推移 <small>直近90日</small>
        </h3>
        <WeightChart ctx={ctx} days={90} />
      </div>
      {others.map((x) => {
        const s = metricSeries(m, x);
        const last = s[s.length - 1];
        return (
          <MetricCard key={x.id} title={x.name} sub={last ? `最新 ${fmt2(last.v)}${unitOf(x)}（${md(last.d)}）` : "まだ記録がありません"}>
            <LineChart pts={s} h={120} color="#2563a8" />
          </MetricCard>
        );
      })}
    </>
  );
}

/* ---------- 詳細：フィジカル（全種目の記録・推移） ---------- */
function PhysicalDetail({ ctx }: { ctx: Ctx }) {
  const m = ctx.me;
  const defs = metricsOf(ctx.metrics, "フィジカル");
  if (!defs.length) return <div className="card empty">フィジカルの項目がありません</div>;
  return (
    <>
      {defs.map((x) => {
        const s = metricSeries(m, x);
        const best = metricBest(m, x);
        const last = metricLatest(m, x);
        const rows = metricRanking(ctx.members, x);
        const rpos = rows.findIndex((r) => r.id === m.id);
        const ratio = x.show_ratio ? metricRatio(m, x) : null;
        const u = unitOf(x);
        return (
          <MetricCard
            key={x.id}
            title={x.name}
            sub={
              <>
                自己ベスト <b>{fmt2(best)}{u}</b>
                {ratio != null && `（${fmtRatio(ratio)}倍）`}
                {last && ` ・ 最新 ${fmt2(last.v)}${u}`}
                {rpos >= 0 && ` ・ チーム${rpos + 1}位/${rows.length}人`}
              </>
            }
          >
            {s.length ? <LineChart pts={s} h={110} color="var(--accent)" /> : <div className="empty">まだ記録がありません</div>}
          </MetricCard>
        );
      })}
      {defs.some((x) => isLinked(x)) && (
        <p className="muted" style={{ textAlign: "center" }}>
          測定値は「記録する → 測定」から入力できます
        </p>
      )}
    </>
  );
}

function MetricCard({ title, sub, children }: { title: string; sub: ReactNode; children: ReactNode }) {
  return (
    <div className="card">
      <h3 style={{ flexWrap: "wrap" }}>
        {title} <small>{sub}</small>
      </h3>
      {children}
    </div>
  );
}

