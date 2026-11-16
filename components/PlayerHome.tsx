"use client";

// S02 選手ダッシュボード（ホーム）。コーチの「チームダッシュボード」と同じ操作感
//  ・一番上：今日の記録バナー
//  ・その下：4つのメニュー（出欠席率 / 筋トレ遂行率 / 体組成 / フィジカル）。押すと詳細、もう一度押すと戻る
//  ・何も選んでいないときは、バナーと4つのボタンだけ（中身は各ボタンを押したときに表示）

import { useMemo, useState } from "react";
import LineChart from "./LineChart";
import MultiLineChart, { type Series } from "./MultiLineChart";
import { MonthBar, avg, valueAsOf } from "./GroupStats";
import type { Ctx } from "./Shared";
import {
  LIFTS,
  addDays,
  attendLabel,
  attendStats,
  attendStreak,
  attendTargets,
  dayKind,
  fmt0,
  fmt1,
  fmtRatio,
  latestWeight,
  maxes,
  md,
  metricBest,
  metricRanking,
  metricRatio,
  metricSeries,
  metricsOf,
  monthAttendance,
  phys,
  playersOf,
  ranking,
  trainingRate,
  trainingMonthAvg,
  weekShort,
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
    ["training", "筋トレ遂行率", `${weekShort(weekStart(t))} ${weekScore == null ? "未入力" : `${fmt1(weekScore)} / 10`}`],
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
  const from30 = weekStart(addDays(today(), -29)); // 直近30日＝この30日にかかる週（4〜5週）
  const rows: [string, string | undefined][] = [
    [weekShort(thisWeek), thisWeek],
    ["直近30日", from30],
    ["全期間", undefined],
  ];
  const weeks = recentWeeks(8);
  const pts = weeks.filter((w) => m.training[w] != null).map((w) => ({ d: w, v: m.training[w] }));
  const [ym, setYm] = useState(ymOf(today()));
  const myMonth = trainingMonthAvg(m, ym);
  const teamMonth = avg(ps.map((x) => trainingMonthAvg(x, ym)));
  const fmtScore = (v: number | null) => (v == null ? "—" : `${fmt1(v)} / 10`);
  return (
    <div className="card">
      <h3>筋トレ遂行率</h3>
      <table className="tbl cmp-tbl" style={{ marginBottom: 10 }}>
        <tbody>
          <tr>
            <th />
            <th className="r">自分</th>
            <th className="r">チーム平均</th>
            <th className="r">差</th>
          </tr>
          {rows.map(([l, from]) => {
            // 1行目（その週：月曜〜日曜）はその週の分だけ、それ以外は from 以降の週
            const pick = (x: (typeof ps)[number]) => (from === thisWeek ? (x.training[thisWeek] ?? null) : trainingRate(x, from));
            const mine = pick(m);
            const team = avg(ps.map(pick));
            return (
              <tr key={l}>
                <td>{l}</td>
                <td className="r num">
                  <b style={{ fontSize: 18 }}>{fmtScore(mine)}</b>
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
      {/* 月別：選んだ月の自分とチーム平均（0〜10） */}
      <MonthBar ym={ym} setYm={setYm} />
      <div className="mrow2">
        <div>
          <span className="l">自分</span>
          <b className="num">{fmtScore(myMonth)}</b>
        </div>
        <div>
          <span className="l">チーム平均</span>
          <b className="num">{fmtScore(teamMonth)}</b>
        </div>
        <div>
          <span className="l">差</span>
          {myMonth == null || teamMonth == null ? (
            <span className="muted">—</span>
          ) : (
            <b className={`num ${myMonth - teamMonth >= 0 ? "up" : "down"}`}>
              {myMonth - teamMonth >= 0 ? "▲+" : "▼"}
              {fmt1(myMonth - teamMonth)}
            </b>
          )}
        </div>
      </div>
      {pts.length >= 2 && <LineChart pts={pts} h={100} color="var(--warn)" />}
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
function PhysicalDetail({ ctx }: { ctx: Ctx }) {
  const m = ctx.me;
  const defs = metricsOf(ctx.metrics, "フィジカル");
  const first = defs.find((x) => x.key === "big3_total") ?? defs[0];
  const [sel, setSel] = useState<string | null>(null);
  const key = sel ?? (first ? "m" + first.id : "");
  const def = defs.find((x) => "m" + x.id === key || "r" + x.id === key);
  if (!def) return <div className="card empty">フィジカルの項目がありません</div>;
  const ratio = key === "r" + def.id;

  const options: [string, string][] = defs.flatMap((x) => {
    const o: [string, string][] = [["m" + x.id, x.name]];
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
  const last = series[series.length - 1] ?? null;
  const latestV = ratio ? toRatio(last) : last?.v ?? null;
  const bestV = ratio ? metricRatio(m, def) : metricBest(m, def);
  const f = (v: number | null) => (v == null ? "—" : ratio ? fmtRatio(v) : fmtMetric(def, v));
  const u = ratio ? "倍" : unitOf(def);

  // 順位（自己ベストで）
  const rows: RankRow[] = ratio
    ? playersOf(ctx.members)
        .map((x) => ({ id: x.id, name: x.name, v: metricRatio(x, def) }))
        .filter((r): r is RankRow => r.v != null)
        .sort((a, b) => b.v - a.v)
    : metricRanking(ctx.members, def);
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
      {def.key === "big3_total" && !ratio ? (
        <Big3Block ctx={ctx} />
      ) : (
      <div className="mine2">
        <div>
          <div className="l">最新値</div>
          <div className="v num">
            {f(latestV)}
            <small>{u}</small>
          </div>
          {!ratio && def.show_ratio && toRatio(last) != null && <div className="s">{fmtRatio(toRatio(last))}倍</div>}
          {last && <div className="s">{md(last.d)}</div>}
        </div>
        <div>
          <div className="l">自己ベスト</div>
          <div className="v num">
            {f(bestV)}
            <small>{u}</small>
          </div>
          {!ratio && def.show_ratio && metricRatio(m, def) != null && <div className="s">{fmtRatio(metricRatio(m, def))}倍</div>}
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

      {/* 下段：選んだ種目のチームランキング */}
      <div className="card">
        <h3>
          チームランキング <small>{options.find(([k]) => k === key)?.[1]}・自己ベスト</small>
        </h3>
        <TeamRanking
          ctx={ctx}
          rows={rows}
          fmtV={(v) => (ratio ? `${fmtRatio(v)}倍` : `${fmtMetric(def, v)}${u}`)}
        />
      </div>

      <PhysHistory ctx={ctx} />
    </>
  );
}

// チームランキング一覧：1位・2位・3位は文字を段階的に大きく太く、4位以下は同じ大きさ。自分の行は色付き＋「あなた」
function TeamRanking({ ctx, rows, fmtV }: { ctx: Ctx; rows: RankRow[]; fmtV: (v: number) => string }) {
  if (!rows.length) return <div className="empty">まだ記録がありません</div>;
  return (
    <ol className="trank">
      {rows.map((r, i) => {
        const tier = i < 3 ? `t${i + 1}` : "tn";
        const me = r.id === ctx.me.id;
        return (
          <li key={r.id} className={`${tier} ${me ? "me" : ""}`}>
            <span className="tp num">{i === 0 ? "👑" : i + 1}</span>
            <span className="tn-name">
              {r.name}
              {me && <em className="you">あなた</em>}
            </span>
            <span className="tv num">{fmtV(r.v)}</span>
          </li>
        );
      })}
    </ol>
  );
}

// 『Big3合計』を選んだとき：3種目の自己ベスト（横3列）＋合計・体重比
// 3種目の名前は「項目設定」で変えていればその名前。各種目の下は「前回」の記録（体重比が ON の種目は体重比も）
function Big3Block({ ctx }: { ctx: Ctx }) {
  const m = ctx.me;
  const mx = maxes(m);
  const p = phys(m);
  const lastOf = (k: (typeof LIFTS)[number][0]) => [...p].reverse().find((r) => r[k] != null)?.[k] ?? null;
  const totalDef = ctx.metrics.find((x) => x.key === "big3_total");
  const totalRatio = totalDef ? metricRatio(m, totalDef) : mx.ratio;
  return (
    <>
      <div className="big3" style={{ marginBottom: 8 }}>
        {LIFTS.map(([k, l]) => {
          const def = ctx.metrics.find((x) => x.key === k);
          const r = def?.show_ratio ? metricRatio(m, def) : null;
          const last = lastOf(k);
          return (
            <div className="lift" key={k}>
              <div className="l">{def?.name ?? l}</div>
              <div className="v num">
                {fmt0(mx[k])}
                <small>kg</small>
              </div>
              <div className="d">
                {r != null ? `${fmtRatio(r)}倍` : last != null ? `前回 ${fmt0(last)}` : "—"}
              </div>
            </div>
          );
        })}
      </div>
      <div className="total" style={{ marginTop: 0, marginBottom: 10 }}>
        <span className="muted">合計（Total）</span>
        <span className="v num">
          {fmt0(mx.total)}
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
                    return (
                      <td key={x.id} className="num">
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
    </div>
  );
}
