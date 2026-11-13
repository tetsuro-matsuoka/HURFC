"use client";

// 選手向け画面
//  S02 選手ダッシュボード（ホーム） / S03 データ入力 / ランキング

import { useState } from "react";
import LineChart from "./LineChart";
import { RankList, type Ctx } from "./Shared";
import {
  LIFTS,
  METRICS,
  attendRate,
  fmt0,
  fmt1,
  latestWeight,
  maxes,
  md,
  phys,
  ranking,
  rowTotal,
  today,
  wd,
  weightAgo,
  weights,
} from "@/lib/calc";
import { saveDaily, savePhysical } from "@/lib/data";
import type { Attendance, LiftKey, MetricKey, PhysRec } from "@/lib/types";

/* ---------- S02 選手ダッシュボード ---------- */
export function PlayerHome({ ctx }: { ctx: Ctx }) {
  const m = ctx.me,
    t = today(),
    rec = m.daily[t];
  const rate = attendRate(m),
    rate30 = attendRate(m, 30);
  const lw = latestWeight(m),
    w7 = weightAgo(m, 7);
  const dW = lw && w7 ? lw.v - w7.v : null;
  const mx = maxes(m),
    p = phys(m),
    lastP = p[p.length - 1];
  const rk = ranking(ctx.members, "total"),
    pos = rk.findIndex((r) => r.id === m.id);

  return (
    <>
      <div className={`today ${rec ? "done" : "todo"}`}>
        <div className="tx">
          {rec ? (
            <>
              今日の記録は完了 ✓
              <small>
                {rec.attendance}
                {rec.weight ? ` ・ ${fmt1(rec.weight)}kg` : ""}
              </small>
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

      <div className="kpis">
        <div className="kpi">
          <div className="l">出席率</div>
          <div className="v num">
            {rate == null ? "—" : Math.round(rate)}
            <small>%</small>
          </div>
          <div className="s">直近30日 {rate30 == null ? "—" : Math.round(rate30) + "%"}</div>
        </div>
        <div className="kpi">
          <div className="l">体重</div>
          <div className="v num">
            {lw ? fmt1(lw.v) : "—"}
            <small>kg</small>
          </div>
          <div className="s">
            {dW == null ? (
              lw ? (
                `${md(lw.d)} 時点`
              ) : (
                "未入力"
              )
            ) : (
              <>
                1週間で{" "}
                <b className={dW >= 0 ? "up" : "down"}>
                  {dW >= 0 ? "+" : ""}
                  {fmt1(dW)}kg
                </b>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h3>
            体重の推移 <small>直近30日</small>
          </h3>
          <LineChart pts={weights(m, 30)} />
        </div>
        <div className="card">
          <h3>
            Big3 自己ベスト
            {pos >= 0 && (
              <span className="rankpill" style={{ marginLeft: "auto" }}>
                チーム {pos + 1}位 / {rk.length}人
              </span>
            )}
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
            {lastP ? `最終測定 ${md(lastP.d)}` : "「記録する」→「フィジカル測定」から測定値を入力できます"}
          </p>
        </div>
      </div>
    </>
  );
}

/* ---------- S03 データ入力 ---------- */
export function InputScreen({ ctx }: { ctx: Ctx }) {
  const [tab, setTab] = useState<"daily" | "phys">("daily");
  return (
    <>
      <h2 className="page">記録する</h2>
      <div className="seg">
        <button className={tab === "daily" ? "on" : ""} onClick={() => setTab("daily")}>
          毎日の記録
        </button>
        <button className={tab === "phys" ? "on" : ""} onClick={() => setTab("phys")}>
          フィジカル測定
        </button>
      </div>
      {tab === "daily" ? <DailyForm ctx={ctx} /> : <PhysForm ctx={ctx} />}
    </>
  );
}

function DailyForm({ ctx }: { ctx: Ctx }) {
  const m = ctx.me;
  const initial = (d: string) => {
    const rec = m.daily[d];
    const before = weights(m).filter((x) => x.d < d);
    const prev = before.length ? before[before.length - 1] : latestWeight(m);
    return {
      att: (rec?.attendance ?? null) as Attendance | null,
      w: rec?.weight != null ? fmt1(rec.weight) : prev ? fmt1(prev.v) : "",
      prev,
    };
  };
  const [date, setDate] = useState(today());
  const [att, setAtt] = useState<Attendance | null>(initial(today()).att);
  const [w, setW] = useState(initial(today()).w);
  const [busy, setBusy] = useState(false);
  const prev = initial(date).prev;

  const changeDate = (d: string) => {
    const v = initial(d);
    setDate(d);
    setAtt(v.att);
    setW(v.w);
  };
  const step = (n: number) => setW((cur) => Math.max(0, Math.round(((parseFloat(cur) || 0) + n) * 10) / 10).toFixed(1));

  const save = async () => {
    if (!att) return ctx.toast("出席か欠席を選んでください");
    const weight = w.trim() === "" ? null : parseFloat(w);
    if (weight != null && (isNaN(weight) || weight < 30 || weight > 250)) return ctx.toast("体重の数値を確認してください");
    setBusy(true);
    try {
      await saveDaily(m.id, date, att, weight);
      await ctx.reload();
      ctx.toast("保存しました ✓");
      ctx.go("home");
    } catch {
      ctx.toast("保存に失敗しました。通信を確認してください");
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <label className="f" style={{ marginTop: 0 }}>
        日付
      </label>
      <input className="t" type="date" value={date} max={today()} onChange={(e) => e.target.value && changeDate(e.target.value)} />
      <label className="f">出欠</label>
      <div className="att">
        <button className={`yes ${att === "出席" ? "on" : ""}`} onClick={() => setAtt("出席")}>
          出席
        </button>
        <button className={`no ${att === "欠席" ? "on" : ""}`} onClick={() => setAtt("欠席")}>
          欠席
        </button>
      </div>
      <label className="f">体重</label>
      <div className="stepper">
        <button onClick={() => step(-0.1)}>−</button>
        <input className="t" type="number" inputMode="decimal" step="0.1" value={w} onChange={(e) => setW(e.target.value)} />
        <span className="unit">kg</span>
        <button onClick={() => step(0.1)}>＋</button>
      </div>
      <div className="prev">{prev ? `前回 ${fmt1(prev.v)}kg（${md(prev.d)}）` : ""}</div>
      <button className="btn" onClick={save} disabled={busy || ctx.readOnly}>
        {busy ? "保存中…" : "保存する"}
      </button>
    </div>
  );
}

function PhysForm({ ctx }: { ctx: Ctx }) {
  const m = ctx.me;
  const p = phys(m),
    mx = maxes(m);
  const initial = (d: string): Record<LiftKey, string> => {
    const src = m.physical[d] ?? p[p.length - 1] ?? null;
    const v = (k: LiftKey) => (src && src[k] != null ? String(src[k]) : "");
    return { bench_press: v("bench_press"), squat: v("squat"), deadlift: v("deadlift") };
  };
  const [date, setDate] = useState(today());
  const [vals, setVals] = useState<Record<LiftKey, string>>(initial(today()));
  const [busy, setBusy] = useState(false);

  const step = (k: LiftKey, n: number) =>
    setVals((cur) => ({ ...cur, [k]: String(Math.max(0, Math.round(((parseFloat(cur[k]) || 0) + n) * 10) / 10)) }));

  const save = async () => {
    const rec: PhysRec = { bench_press: null, squat: null, deadlift: null };
    let bad = false;
    LIFTS.forEach(([k]) => {
      const s = vals[k].trim();
      const n = s === "" ? null : parseFloat(s);
      if (n != null && (isNaN(n) || n < 0 || n > 500)) bad = true;
      rec[k] = n;
    });
    if (bad) return ctx.toast("数値を確認してください");
    if (LIFTS.every(([k]) => rec[k] == null)) return ctx.toast("少なくとも1種目を入力してください");
    setBusy(true);
    try {
      await savePhysical(m.id, date, rec);
      await ctx.reload();
      const prs = LIFTS.filter(([k]) => {
        const v = rec[k];
        const best = mx[k];
        return v != null && (best == null || v > best);
      }).map((l) => l[1]);
      if (prs.length) ctx.toast("🔥 自己ベスト更新！ " + prs.join("・"), true);
      else ctx.toast("保存しました ✓");
      ctx.go("home");
    } catch {
      ctx.toast("保存に失敗しました。通信を確認してください");
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card">
        <label className="f" style={{ marginTop: 0 }}>
          測定日
        </label>
        <input
          className="t"
          type="date"
          value={date}
          max={today()}
          onChange={(e) => {
            if (!e.target.value) return;
            setDate(e.target.value);
            setVals(initial(e.target.value));
          }}
        />
        {LIFTS.map(([k, l]) => (
          <div key={k}>
            <label className="f">{l}</label>
            <div className="stepper">
              <button onClick={() => step(k, -2.5)}>−</button>
              <input
                className="t"
                type="number"
                inputMode="decimal"
                step="2.5"
                value={vals[k]}
                onChange={(e) => setVals((cur) => ({ ...cur, [k]: e.target.value }))}
              />
              <span className="unit">kg</span>
              <button onClick={() => step(k, 2.5)}>＋</button>
            </div>
            <div className="prev">自己ベスト {fmt0(mx[k])}kg</div>
          </div>
        ))}
        <button className="btn" onClick={save} disabled={busy || ctx.readOnly}>
          {busy ? "保存中…" : "保存する"}
        </button>
      </div>
      {p.length > 0 && (
        <div className="card">
          <h3>測定履歴</h3>
          <div className="scroll">
            <table className="tbl">
              <tbody>
                <tr>
                  <th>日付</th>
                  {LIFTS.map((l) => (
                    <th className="r" key={l[0]}>
                      {l[2]}
                    </th>
                  ))}
                  <th className="r">合計</th>
                </tr>
                {p
                  .slice()
                  .reverse()
                  .map((r) => (
                    <tr key={r.d}>
                      <td>{md(r.d)}</td>
                      {LIFTS.map(([k]) => (
                        <td className="r num" key={k}>
                          {fmt0(r[k])}
                        </td>
                      ))}
                      <td className="r num">
                        <b>{fmt0(rowTotal(r))}</b>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- ランキング（選手用） ---------- */
export function RankScreen({ ctx }: { ctx: Ctx }) {
  const [metric, setMetric] = useState<MetricKey>("total");
  return (
    <>
      <h2 className="page">ランキング</h2>
      <div className="seg">
        {METRICS.map(([k, l]) => (
          <button key={k} className={metric === k ? "on" : ""} onClick={() => setMetric(k)} style={{ fontSize: 13, padding: "10px 2px" }}>
            {l}
          </button>
        ))}
      </div>
      <div className="card">
        <RankList ctx={ctx} metric={metric} />
      </div>
      <p className="muted">
        自己ベスト（MAX）で比較しています。{metric === "ratio" ? "体重比 = Big3合計 ÷ 最新の体重" : ""}
      </p>
    </>
  );
}
