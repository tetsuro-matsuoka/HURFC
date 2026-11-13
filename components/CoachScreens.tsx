"use client";

// コーチ・管理者向け画面
//  S04 チームダッシュボード / S05 フィジカル管理・ランキング
//  （選手管理は ManageScreen.tsx）

import { useState } from "react";
import LineChart from "./LineChart";
import { RankList, type Ctx } from "./Shared";
import {
  LIFTS,
  METRICS,
  addDays,
  fmt0,
  fmt1,
  latestWeight,
  maxes,
  md,
  phys,
  playersOf,
  today,
  wd,
  weightAgo,
  weights,
} from "@/lib/calc";
import type { MetricKey } from "@/lib/types";

/* ---------- S04 チームダッシュボード ---------- */
export function TeamScreen({ ctx }: { ctx: Ctx }) {
  const [d, setD] = useState(today());
  const ps = playersOf(ctx.members);
  const rows = ps.map((m) => ({ m, r: m.daily[d] }));
  const yes = rows.filter((x) => x.r?.attendance === "出席").length;
  const no = rows.filter((x) => x.r?.attendance === "欠席").length;
  const none = rows.length - yes - no;
  // 未入力 → 欠席 → 出席 の順に並べる（確認が必要な人を上に）
  const order = (x: (typeof rows)[number]) => (!x.r ? 2 : x.r.attendance === "欠席" ? 1 : 0);
  // 同じ状態の中は、選手管理で決めた並び順（ps の順）
  const sorted = rows.map((x, i) => ({ ...x, i })).sort((a, b) => order(b) - order(a) || a.i - b.i);
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
    <>
      <h2 className="page">チームダッシュボード</h2>
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
      <div className="sumrow">
        <div style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>
          <div className="v num">{yes}</div>
          <div className="l">出席</div>
        </div>
        <div style={{ background: "var(--ng-soft)", color: "var(--ng)" }}>
          <div className="v num">{no}</div>
          <div className="l">欠席</div>
        </div>
        <div style={{ background: "#fff", color: "var(--sub)" }}>
          <div className="v num">{none}</div>
          <div className="l">未入力</div>
        </div>
      </div>
      <div className="grid two">
        <div className="card">
          <h3>
            出席状況{" "}
            <small>
              {md(d)} ・ {rows.length}名
            </small>
          </h3>
          {rows.length ? (
            <table className="tbl">
              <tbody>
                {sorted.map((x) => (
                  <tr key={x.m.id} className="click" onClick={() => ctx.openPlayer(x.m.id)}>
                    <td>{x.m.name}</td>
                    <td>
                      <span className={`chip ${!x.r ? "none" : x.r.attendance === "出席" ? "yes" : "no"}`}>
                        {x.r ? x.r.attendance ?? "—" : "未入力"}
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
          <h3>
            体重推移一覧 <small>直近30日</small>
          </h3>
          <div className="scroll">
            <table className="tbl">
              <tbody>
                <tr>
                  <th>選手</th>
                  <th>推移</th>
                  <th className="r">最新</th>
                  <th className="r">7日差</th>
                  <th className="r">30日差</th>
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
                      <td className="r num">
                        <b>{lw ? fmt1(lw.v) : "—"}</b>
                      </td>
                      <td className="r num">{diffCell(lw && a7 ? lw.v - a7.v : null)}</td>
                      <td className="r num">{diffCell(lw && a30 ? lw.v - a30.v : null)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- S05 フィジカルデータ管理・ランキング ---------- */
export function PhysicalScreen({ ctx }: { ctx: Ctx }) {
  const [metric, setMetric] = useState<MetricKey>("total");
  const ps = playersOf(ctx.members);
  return (
    <>
      <h2 className="page">フィジカル管理</h2>
      <div className="grid two">
        <div className="card">
          <h3>ランキング</h3>
          <div className="seg">
            {METRICS.map(([k, l]) => (
              <button key={k} className={metric === k ? "on" : ""} onClick={() => setMetric(k)} style={{ fontSize: 12, padding: "9px 2px" }}>
                {l}
              </button>
            ))}
          </div>
          <RankList ctx={ctx} metric={metric} />
        </div>
        <div className="card">
          <h3>
            選手別 自己ベスト一覧 <small>タップで詳細</small>
          </h3>
          <div className="scroll">
            <table className="tbl">
              <tbody>
                <tr>
                  <th>選手</th>
                  {LIFTS.map((l) => (
                    <th className="r" key={l[0]}>
                      {l[2]}
                    </th>
                  ))}
                  <th className="r">合計</th>
                  <th className="r">最終測定</th>
                </tr>
                {ps.map((m) => {
                  const x = maxes(m),
                    p = phys(m);
                  return (
                    <tr key={m.id} className="click" onClick={() => ctx.openPlayer(m.id)}>
                      <td style={{ whiteSpace: "nowrap" }}>{m.name}</td>
                      {LIFTS.map(([k]) => (
                        <td className="r num" key={k}>
                          {fmt0(x[k])}
                        </td>
                      ))}
                      <td className="r num">
                        <b>{fmt0(x.total)}</b>
                      </td>
                      <td className="r muted">{p.length ? md(p[p.length - 1].d) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
