"use client";

// OB（引退した選手）のフィジカル自己ベスト（コーチ用）
//  ・種目プルダウン（Big3合計・各種目・体重比・スプリントモメンタムなど）で、歴代OBの自己ベストランキング
//    （選手画面と同じ見た目：1位👑・2位銀・3位銅で段階的に大きく）
//  ・体重比とスプリントモメンタムは、その自己ベストを記録した当時の体重を「（75.4kg時）」と併記
//    （その日の体重記録がなければ、それより前の直近の体重）
//  ・下に、OB全員の自己ベスト一覧（全種目）
//  現役の集計・順位には OB は入らない（選手管理で「引退」にした選手だけがここに出る）

import { Fragment, useState, type ReactNode } from "react";
import { TeamRanking, type Ctx } from "./Shared";
import { basisLabel, fmt1, fmtMetric, fmtRatio, metricBest, metricRatio, metricShownPoint, metricsOf, obsOf, retiredYear, unitOf, weightAt, type RankRow } from "@/lib/calc";
import type { Member, MetricDef } from "@/lib/types";

// 自己ベストを記録した当時の体重（その日の記録がなければ直近の体重）
const weightWhen = (m: Member, def: MetricDef) => {
  const p = metricShownPoint(m, def);
  return p ? weightAt(m, p.d) : null;
};
// OB の小さな補足（引退年度・ポジション）
const obInfo = (m: Member) => [m.retired_on ? `${retiredYear(m.retired_on)}年度引退` : null, m.position].filter(Boolean).join("・");

export function OBScreen({ ctx }: { ctx: Ctx }) {
  const obs = obsOf(ctx.members);
  const defs = metricsOf(ctx.metrics, "フィジカル");
  const first = defs.find((x) => x.key === "big3_total") ?? defs[0];
  const [sel, setSel] = useState<string | null>(null);
  const key = sel ?? (first ? "m" + first.id : "");
  const def = defs.find((x) => "m" + x.id === key || "r" + x.id === key);
  const ratio = !!def && key === "r" + def.id;

  const options: [string, string][] = defs.flatMap((x) => {
    const o: [string, string][] = [["m" + x.id, x.name + basisLabel(x)]];
    if (x.show_ratio) o.push(["r" + x.id, `${x.name}体重比`]);
    return o;
  });

  if (!obs.length)
    return (
      <>
        <h2 className="page">OB</h2>
        <div className="card empty">
          OBはまだいません。「選手管理」で選手の「引退」を押すと、ここにフィジカルの自己ベストが表示されます。
        </div>
      </>
    );
  if (!def)
    return (
      <>
        <h2 className="page">OB</h2>
        <div className="card empty">フィジカルの項目がありません</div>
      </>
    );

  // 体重が関係する種目（体重比・スプリントモメンタム）は、記録したときの体重を併記
  const withWeight = ratio || !!def.derived;
  const u = ratio ? "倍" : unitOf(def);
  const rows: RankRow[] = obs
    .map((m) => ({ id: m.id, name: m.name, v: ratio ? metricRatio(m, def) : metricBest(m, def) }))
    .filter((r): r is RankRow => r.v != null)
    .sort((a, b) => (!ratio && def.better === "low" ? a.v - b.v : b.v - a.v));
  const fmtV = (r: RankRow): ReactNode => {
    const w = withWeight ? weightWhen(ctx.members[r.id], def) : null;
    return (
      <>
        {ratio ? fmtRatio(r.v) : fmtMetric(def, r.v)}
        {u && <small> {u}</small>}
        {w != null && <small className="rk-ratio">（{fmt1(w)}kg時）</small>}
      </>
    );
  };

  return (
    <>
      <h2 className="page">OB</h2>
      <div className="card accent-top">
        <select className="t phys-sel" style={{ width: "100%", marginBottom: 10 }} value={key} onChange={(e) => setSel(e.target.value)} aria-label="種目を選ぶ">
          {options.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <h3>
          OB 自己ベストランキング <small>{options.find(([k]) => k === key)?.[1]}・{obs.length}名</small>
        </h3>
        <TeamRanking ctx={ctx} rows={rows} fmtV={fmtV} sub={(r) => obInfo(ctx.members[r.id])} />
      </div>
      <OBBestTable ctx={ctx} obs={obs} defs={defs} />
    </>
  );
}

// OB 全員の自己ベスト一覧（全種目。体重比が ON の項目はすぐ右に体重比と記録時の体重）
function OBBestTable({ ctx, obs, defs }: { ctx: Ctx; obs: Member[]; defs: MetricDef[] }) {
  return (
    <div className="card">
      <h3>
        OB 自己ベスト一覧 <small>名前をタップで詳細</small>
      </h3>
      <div className="scroll">
        <table className="tbl">
          <tbody>
            <tr>
              <th>選手</th>
              <th>引退</th>
              <th>ポジション</th>
              {defs.map((x) => (
                <Fragment key={x.id}>
                  <th className="r">
                    {x.name}
                    {basisLabel(x)}
                    {unitOf(x) && `(${unitOf(x)})`}
                  </th>
                  {x.show_ratio && <th className="r ratio">{x.name}体重比</th>}
                </Fragment>
              ))}
            </tr>
            {obs.map((m) => (
              <tr key={m.id} className="click" onClick={() => ctx.openPlayer(m.id)}>
                <td style={{ whiteSpace: "nowrap" }}>{m.name}</td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>
                  {m.retired_on ? `${retiredYear(m.retired_on)}年度` : "—"}
                </td>
                <td className="muted">{m.position ?? "—"}</td>
                {defs.map((x) => {
                  const w = x.derived ? weightWhen(m, x) : null;
                  const r = x.show_ratio ? metricRatio(m, x) : null;
                  const rw = r != null ? weightWhen(m, x) : null;
                  return (
                    <Fragment key={x.id}>
                      <td className="r num" style={{ whiteSpace: "nowrap" }}>
                        {fmtMetric(x, metricBest(m, x))}
                        {w != null && <small className="rk-ratio">（{fmt1(w)}kg時）</small>}
                      </td>
                      {x.show_ratio && (
                        <td className="r num ratio" style={{ whiteSpace: "nowrap" }}>
                          {fmtRatio(r)}
                          {rw != null && <small className="rk-ratio">（{fmt1(rw)}kg時）</small>}
                        </td>
                      )}
                    </Fragment>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
