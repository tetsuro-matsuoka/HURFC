"use client";

// チームダッシュボード『体組成』
//  1. 上部：全体・FW・BK の体重の平均カード（選んだ日時点の平均と、7日前比・30日前比）
//  2. その下：全体・FW・BK の体重の推移グラフ（期間を切り替え）
//  3. 一番下：選手別の体組成（最新値）の表
// 一番下の表の列は「項目設定」の体組成の項目（体重・体脂肪率など。並び順どおり）
// カード・グラフの見た目は『フィジカル』と共通（GroupStats.tsx）

import { useMemo, useState } from "react";
import LineChart from "./LineChart";
import MultiLineChart from "./MultiLineChart";
import { DateBar, GroupCards, PeriodSeg, avg, groupTrend, splitGroups, valueAsOf, type GroupKey, type Period } from "./GroupStats";
import type { Ctx } from "./Shared";
import { fmt1, fmt2, latestWeight, metricLatest, metricsOf, today, unitOf, weightAgo, weights } from "@/lib/calc";
import type { Member } from "@/lib/types";

export default function BodyPanel({ ctx, ps }: { ctx: Ctx; ps: Member[] }) {
  const defs = metricsOf(ctx.metrics, "体組成");
  const [d, setD] = useState(today());
  const [period, setPeriod] = useState<Period>(30);
  const groups = splitGroups(ps);

  // 平均カード・推移グラフとも「体重」だけ（毎日の記録の体重。項目設定で名前を変えていればその名前で表示）
  const weightName = defs.find((x) => x.key === "weight")?.name ?? "体重";
  const weightPts = useMemo(() => new Map(ps.map((m) => [m.id, weights(m)])), [ps]);
  const at = (g: GroupKey, day: string) => avg(groups[g].map((m) => valueAsOf(weightPts.get(m.id) ?? [], day)));
  const first = [...weightPts.values()].map((p) => p[0]?.d).filter(Boolean).sort()[0] ?? null;
  const chart = groupTrend(d, period, first, at);

  return (
    <>
      <div className="card">
        {/* 見出しは『フィジカル』の種目プルダウンと同じ位置に、短く1つだけ */}
        <div className="ctl-title">{weightName}（kg）</div>
        <DateBar d={d} setD={setD} />
        <GroupCards groups={groups} d={d} unit="kg" at={at} fmt={fmt1} />
      </div>

      <div className="card">
        <h3>全体・FW・BK の{weightName}推移（kg）</h3>
        <PeriodSeg period={period} setPeriod={setPeriod} />
        <MultiLineChart series={chart} />
      </div>

      <PlayerBodyTable ctx={ctx} ps={ps} />
    </>
  );
}

// 選手別の体組成（最新値）の表
function PlayerBodyTable({ ctx, ps }: { ctx: Ctx; ps: Member[] }) {
  const defs = metricsOf(ctx.metrics, "体組成");
  const diffCell = (v: number | null) =>
    v == null ? (
      <span className="muted">—</span>
    ) : (
      <span className={v >= 0 ? "up" : "down"}>
        {v >= 0 ? "+" : ""}
        {fmt1(v)}
      </span>
    );
  return (
    <div className="card">
      <h3>
        選手別 体組成 <small>最新値 ・ 名前をタップで推移グラフ</small>
      </h3>
      <div className="scroll">
        <table className="tbl">
          <tbody>
            <tr>
              <th>選手</th>
              <th>体重の推移（30日）</th>
              <th className="r">体重7日差</th>
              <th className="r">体重30日差</th>
              {defs.map((x) => (
                <th className="r" key={x.id}>
                  {x.name}
                  {unitOf(x) && `(${unitOf(x)})`}
                </th>
              ))}
            </tr>
            {ps.map((m) => {
              const lw = latestWeight(m),
                a7 = weightAgo(m, 7),
                a30 = weightAgo(m, 30);
              return (
                <tr key={m.id} className="click" onClick={() => ctx.openPlayer(m.id)}>
                  <td style={{ whiteSpace: "nowrap" }}>{m.name}</td>
                  <td>
                    <LineChart pts={weights(m, 30)} h={30} width={110} label={false} color="var(--navy)" />
                  </td>
                  <td className="r num">{diffCell(lw && a7 ? lw.v - a7.v : null)}</td>
                  <td className="r num">{diffCell(lw && a30 ? lw.v - a30.v : null)}</td>
                  {defs.map((x) => (
                    <td className="r num" key={x.id}>
                      {fmt2(metricLatest(m, x)?.v)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        表示する項目と並び順は「項目設定」で変更できます。
      </p>
    </div>
  );
}

