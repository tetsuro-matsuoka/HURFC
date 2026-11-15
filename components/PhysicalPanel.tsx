"use client";

// チームダッシュボード『フィジカル』（見た目は『体組成』と共通：GroupStats.tsx）
//  1. 最上部のカード：種目のプルダウン（体重比が ON の項目は「〇〇体重比」も）＋「最新値 / 自己ベスト」→ 日付 →
//     全体・FW・BK の平均カード（基準日時点の平均、7日・30日前比、人数）を1枚にまとめて表示
//  3. 全体・FW・BK の推移グラフ（30日 / 90日 / 全期間）
//  4. 選手別ランキング（選んだ種目・基準。体重比が ON なら併記）と、自己ベスト一覧
//
// 体重比＝値 ÷ その記録の日の体重（その日の体重がなければ、それより前の最新。それも無ければ最新）

import { Fragment, useMemo, useState } from "react";
import MultiLineChart from "./MultiLineChart";
import { DateBar, GroupCards, PeriodSeg, avg, groupTrend, splitGroups, type GroupKey, type Period } from "./GroupStats";
import { RankRows, type Ctx } from "./Shared";
import { LIFTS, fmt2, fmtRatio, md, metricBest, metricRatio, metricSeries, metricsOf, phys, today, unitOf, weights, type Point, type RankRow } from "@/lib/calc";
import type { LiftKey, Member, MetricDef } from "@/lib/types";

type Mode = "latest" | "best";

// 1人分の記録（基準日時点の値をすぐ出せるよう、日付順の記録をまとめておく）
type Cache = { m: Member; pts: Point[]; w: Point[]; lifts: Record<LiftKey, Point[]> | null };

// 基準日 d 時点の「表示する記録」（値と記録日）。最新値＝d以前の最新 / 自己ベスト＝d以前のベスト
function recordAt(c: Cache, def: MetricDef, mode: Mode, d: string): Point | null {
  const upto = c.pts.filter((p) => p.d <= d);
  if (!upto.length) return null;
  if (mode === "latest") return upto[upto.length - 1];
  if (def.key === "big3_total" && c.lifts) {
    // Big3合計の自己ベスト＝種目ごとの自己ベスト（d以前）の合計。日付はその中で一番新しい日
    let total = 0,
      date = "";
    LIFTS.forEach(([k]) => {
      const ps = c.lifts![k].filter((p) => p.d <= d);
      if (!ps.length) return;
      const best = ps.reduce((a, b) => (b.v > a.v ? b : a));
      total += best.v;
      if (best.d > date) date = best.d;
    });
    return total ? { d: date, v: total } : null;
  }
  // 自己ベスト（良い向きに合わせて最大 or 最小。同じ値なら最初に出した日）
  return upto.reduce((a, b) => (def.better === "low" ? (b.v < a.v ? b : a) : b.v > a.v ? b : a));
}

// 基準日 d 時点の値（体重比なら「表示する記録 ÷ その日の体重」）
function valueAt(c: Cache, def: MetricDef, mode: Mode, ratio: boolean, d: string): number | null {
  const r = recordAt(c, def, mode, d);
  if (!r) return null;
  if (!ratio) return r.v;
  // その日の体重 → なければその日以前で最新 → それも無ければ最新（選手一覧の体重比と同じ）
  let w: number | null = null;
  for (const p of c.w) {
    if (p.d > r.d) break;
    w = p.v;
  }
  w ??= c.w.length ? c.w[c.w.length - 1].v : null;
  return w && r.v ? r.v / w : null;
}

export default function PhysicalPanel({ ctx, ps }: { ctx: Ctx; ps: Member[] }) {
  const defs = metricsOf(ctx.metrics, "フィジカル");
  const [d, setD] = useState(today());
  const [period, setPeriod] = useState<Period>(30);
  const [mode, setMode] = useState<Mode>("latest");
  const first = defs.find((x) => x.key === "big3_total") ?? defs[0];
  const [sel, setSel] = useState<string | null>(null);
  const key = sel ?? (first ? "m" + first.id : "");
  const def = defs.find((x) => "m" + x.id === key || "r" + x.id === key);
  const ratio = !!def && key === "r" + def.id;
  const groups = splitGroups(ps);

  const caches = useMemo(() => {
    const out = new Map<string, Cache>();
    if (!def) return out;
    ps.forEach((m) => {
      const pts = metricSeries(m, def);
      const lifts =
        def.key === "big3_total"
          ? (Object.fromEntries(
              LIFTS.map(([k]) => [
                k,
                phys(m)
                  .filter((r) => r[k] != null)
                  .map((r) => ({ d: r.d, v: Number(r[k]) })),
              ]),
            ) as Record<LiftKey, Point[]>)
          : null;
      out.set(m.id, { m, pts, w: weights(m), lifts });
    });
    return out;
  }, [def, ps]);

  if (!def) {
    return (
      <div className="card">
        <div className="empty">「項目設定」にフィジカルの項目がありません</div>
      </div>
    );
  }

  const unit = ratio ? "倍" : unitOf(def);
  const fmtV = (v: number) => (ratio ? fmtRatio(v) : fmt2(v));
  const at = (g: GroupKey, day: string) =>
    avg(groups[g].map((m) => {
      const c = caches.get(m.id);
      return c ? valueAt(c, def, mode, ratio, day) : null;
    }));
  const firstDay = [...caches.values()].map((c) => c.pts[0]?.d).filter(Boolean).sort()[0] ?? null;
  const chart = groupTrend(d, period, firstDay, at);
  const label = `${def.name}${ratio ? "体重比" : ""}（${mode === "latest" ? "最新値" : "自己ベスト"}）`;

  // ランキング：体重比は大きい順、それ以外は良い向きの順。値が無い選手は除く
  const rows: RankRow[] = ps
    .map((m) => {
      const c = caches.get(m.id);
      return { id: m.id, name: m.name, v: c ? valueAt(c, def, mode, ratio, d) : null };
    })
    .filter((r): r is RankRow => r.v != null)
    .sort((a, b) => (!ratio && def.better === "low" ? a.v - b.v : b.v - a.v));
  const rankV = (r: RankRow) => {
    if (ratio) return fmtRatio(r.v) + "倍";
    const c = caches.get(r.id);
    const rr = def.show_ratio && c ? valueAt(c, def, mode, true, d) : null;
    return (
      <>
        {fmt2(r.v)}
        <small> {unitOf(def)}</small>
        {rr != null && <small className="rk-ratio">（{fmtRatio(rr)}倍）</small>}
      </>
    );
  };

  const options: [string, string][] = defs.flatMap((x) => {
    const c: [string, string][] = [["m" + x.id, x.name]];
    if (x.show_ratio) c.push(["r" + x.id, `${x.name}体重比`]);
    return c;
  });

  return (
    <>
      {/* 1枚のカードに：最上段に「種目（プルダウン）」と「最新値 / 自己ベスト」→ 日付 → 全体・FW・BK の平均カード */}
      <div className="card">
        <div className="phys-top">
          <select className="t phys-sel" value={key} onChange={(e) => setSel(e.target.value)} aria-label="種目を選ぶ">
            {options.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <div className="seg mini" role="group" aria-label="集計の基準">
            <button className={mode === "latest" ? "on" : ""} onClick={() => setMode("latest")}>
              最新値
            </button>
            <button className={mode === "best" ? "on" : ""} onClick={() => setMode("best")}>
              自己ベスト
            </button>
          </div>
        </div>
        <h3 style={{ marginTop: 12 }}>{label}の平均</h3>
        <DateBar d={d} setD={setD} />
        <GroupCards groups={groups} d={d} label={label} unit={unit} at={at} fmt={fmtV} />
        <p className="muted" style={{ marginTop: 6, fontSize: 11 }}>
          選んだ日時点の各選手の{mode === "latest" ? "最新の記録" : "自己ベスト"}を平均（記録のない選手は除く）。7日・30日はその日数前の平均との差。
          {ratio && "体重比＝値÷その記録の日の体重。"}
        </p>
      </div>

      <div className="card">
        <h3>全体・FW・BK の推移 <small>{label}</small></h3>
        <PeriodSeg period={period} setPeriod={setPeriod} />
        <MultiLineChart series={chart} digits={ratio ? 2 : 1} minRange={ratio ? 0.2 : 1} />
      </div>

      <div className="card">
        <h3>
          選手別ランキング <small>{label}・{md(d)}時点</small>
        </h3>
        <RankRows ctx={ctx} rows={rows} fmtV={rankV} low={!ratio && def.better === "low"} />
      </div>

      <BestTable ctx={ctx} ps={ps} defs={defs} />
    </>
  );
}

// 自己ベスト一覧（全種目。体重比が ON の項目はすぐ右に体重比の列）
function BestTable({ ctx, ps, defs }: { ctx: Ctx; ps: Member[]; defs: MetricDef[] }) {
  return (
    <div className="card">
      <h3>
        自己ベスト一覧 <small>名前をタップで推移グラフ</small>
      </h3>
      <div className="scroll">
        <table className="tbl">
          <tbody>
            <tr>
              <th>選手</th>
              {defs.map((x) => (
                <Fragment key={x.id}>
                  <th className="r">
                    {x.name}
                    {unitOf(x) && `(${unitOf(x)})`}
                  </th>
                  {x.show_ratio && <th className="r ratio">{x.name}体重比</th>}
                </Fragment>
              ))}
              <th className="r">最終測定</th>
            </tr>
            {ps.map((m) => {
              const p = phys(m);
              return (
                <tr key={m.id} className="click" onClick={() => ctx.openPlayer(m.id)}>
                  <td style={{ whiteSpace: "nowrap" }}>{m.name}</td>
                  {defs.map((x) => (
                    <Fragment key={x.id}>
                      <td className="r num">{fmt2(metricBest(m, x))}</td>
                      {x.show_ratio && <td className="r num ratio">{fmtRatio(metricRatio(m, x))}</td>}
                    </Fragment>
                  ))}
                  <td className="r muted">{p.length ? md(p[p.length - 1].d) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
