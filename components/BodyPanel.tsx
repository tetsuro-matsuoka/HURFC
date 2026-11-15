"use client";

// チームダッシュボード『体組成』
//  1. 上部：全体・FW・BK の体重の平均カード（選んだ日時点の平均と、7日前比・30日前比）
//  2. その下：全体・FW・BK の推移グラフ（指標と期間を切り替え）
//  3. 一番下：選手別の体組成（最新値）の表
// 指標は「項目設定」の体組成の項目（体重・体脂肪率など。並び順どおり）

import { useMemo, useState } from "react";
import LineChart from "./LineChart";
import MultiLineChart, { type Series } from "./MultiLineChart";
import type { Ctx } from "./Shared";
import {
  addDays,
  fmt1,
  fmt2,
  latestWeight,
  metricLatest,
  metricSeries,
  metricsOf,
  today,
  unitOf,
  unitOfPosition,
  weightAgo,
  weights,
  wd,
  type Point,
} from "@/lib/calc";
import type { Member } from "@/lib/types";

type GroupKey = "all" | "FW" | "BK";
const GROUPS: { key: GroupKey; label: string; color: string }[] = [
  { key: "all", label: "全体", color: "#2b2f36" },
  { key: "FW", label: "FW", color: "#2563a8" },
  { key: "BK", label: "BK", color: "#e07b00" },
];
type Period = 30 | 90 | 0; // 0 = 全期間

// その日時点の値（その日以前で一番新しい記録）。記録がなければ null
function valueAsOf(pts: Point[], d: string): number | null {
  let v: number | null = null;
  for (const p of pts) {
    if (p.d > d) break;
    v = p.v;
  }
  return v;
}
const avg = (v: (number | null)[]) => {
  const x = v.filter((n): n is number => n != null);
  return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null;
};

export default function BodyPanel({ ctx, ps }: { ctx: Ctx; ps: Member[] }) {
  const defs = metricsOf(ctx.metrics, "体組成");
  const [d, setD] = useState(today());
  const [sel, setSel] = useState<number | null>(null);
  const [period, setPeriod] = useState<Period>(30);
  const def = defs.find((x) => x.id === sel) ?? defs[0];

  // 選手ごとの記録（項目ごと・日付順）。毎回計算しないようにまとめて作っておく
  const series = useMemo(() => {
    const out = new Map<number, Map<string, Point[]>>();
    defs.forEach((x) => out.set(x.id, new Map(ps.map((m) => [m.id, metricSeries(m, x)]))));
    return out;
  }, [defs, ps]);

  const members: Record<GroupKey, Member[]> = {
    all: ps,
    FW: ps.filter((m) => unitOfPosition(m.position) === "FW"),
    BK: ps.filter((m) => unitOfPosition(m.position) === "BK"),
  };
  // 平均カードは「体重」だけ（毎日の記録の体重。項目設定で名前を変えていればその名前で表示）
  const weightName = defs.find((x) => x.key === "weight")?.name ?? "体重";
  const weightPts = useMemo(() => new Map(ps.map((m) => [m.id, weights(m)])), [ps]);
  const weightAvg = (g: GroupKey, day: string) => avg(members[g].map((m) => valueAsOf(weightPts.get(m.id) ?? [], day)));

  // 推移グラフ：期間内の毎日について、グループの平均（その日時点の値の平均）
  const chart: Series[] = useMemo(() => {
    if (!def) return [];
    const per = series.get(def.id);
    if (!per) return [];
    let from = period ? addDays(d, -period + 1) : "9999-12-31";
    if (!period) per.forEach((pts) => pts[0] && pts[0].d < from && (from = pts[0].d));
    if (from > d) return [];
    const days: string[] = [];
    for (let x = from; x <= d; x = addDays(x, 1)) days.push(x);
    return GROUPS.map((g) => {
      const list = members[g.key].map((m) => per.get(m.id) ?? []);
      // 日付を進めながら、選手ごとに「その日までの最新の記録」を追いかける（全期間でも速く計算するため）
      const idx = list.map(() => -1);
      const pts: Point[] = [];
      days.forEach((day) => {
        const vals: number[] = [];
        list.forEach((p, i) => {
          while (idx[i] + 1 < p.length && p[idx[i] + 1].d <= day) idx[i]++;
          if (idx[i] >= 0) vals.push(p[idx[i]].v);
        });
        const v = avg(vals);
        if (v != null) pts.push({ d: day, v });
      });
      return { label: g.label, color: g.color, pts };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, series, period, d, ps]);

  const diff = (a: number | null, b: number | null) => {
    if (a == null || b == null) return <span className="muted">—</span>;
    const v = a - b;
    return (
      <span className={v >= 0 ? "up" : "down"}>
        {v >= 0 ? "+" : ""}
        {fmt1(v)}
      </span>
    );
  };

  return (
    <>
      <div className="card">
        <h3>体重の平均</h3>
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
        </div>
        <div className="bcards">
          {GROUPS.map((g) => {
            const now = weightAvg(g.key, d);
            return (
              <div key={g.key} className="bcard" style={{ borderTopColor: g.color }}>
                <div className="bc-h">
                  <b style={{ color: g.color }}>{g.label}</b>
                  <small>{members[g.key].length}名</small>
                </div>
                <div className="bc-l">{weightName}</div>
                <div className="bc-v num">
                  {now == null ? "—" : fmt1(now)}
                  <small>kg</small>
                </div>
                <div className="bc-d num">
                  <span>7日 {diff(now, weightAvg(g.key, addDays(d, -7)))}</span>
                  <span>30日 {diff(now, weightAvg(g.key, addDays(d, -30)))}</span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="muted" style={{ marginTop: 6, fontSize: 11 }}>
          選んだ日時点の各選手の最新の体重を平均（記録のない選手は除く）。7日・30日はその日数前の平均との差。
        </p>
      </div>

      {def && (
        <div className="card">
          <h3>全体・FW・BK の推移</h3>
          <div className="chips">
            {defs.map((x) => (
              <button key={x.id} className={def.id === x.id ? "on" : ""} onClick={() => setSel(x.id)}>
                {x.name}
                {unitOf(x) && `(${unitOf(x)})`}
              </button>
            ))}
          </div>
          <div className="seg" style={{ marginBottom: 10 }}>
            {([30, 90, 0] as Period[]).map((p) => (
              <button key={p} className={period === p ? "on" : ""} onClick={() => setPeriod(p)} style={{ fontSize: 14, padding: 8 }}>
                {p ? `${p}日` : "全期間"}
              </button>
            ))}
          </div>
          <MultiLineChart series={chart} />
        </div>
      )}

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

