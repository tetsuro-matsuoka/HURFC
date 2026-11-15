"use client";

// 選手向け画面
//  S03 データ入力 / ランキング（S02 ホームは PlayerHome.tsx）

import { useState } from "react";
import { RankBoard, type Ctx } from "./Shared";
import {
  LIFTS,
  addDays,
  ABSENCE_REASONS,
  dayKind,
  fmt2,
  isLinked,
  metricBest,
  metricLatest,
  unitOf,
  weekLabel,
  weekStart,
  fmt0,
  fmt1,
  latestWeight,
  maxes,
  md,
  phys,
  rowTotal,
  today,
  weights,
} from "@/lib/calc";
import { saveDaily, saveMetricValues, savePhysical, saveTraining } from "@/lib/data";
import type { AbsenceReason, Attendance, LiftKey, PhysRec } from "@/lib/types";

/* ---------- S03 データ入力 ---------- */
export function InputScreen({ ctx }: { ctx: Ctx }) {
  const [tab, setTab] = useState<"daily" | "training" | "phys">("daily");
  return (
    <>
      <h2 className="page">記録する</h2>
      <div className="seg">
        <button className={tab === "daily" ? "on" : ""} onClick={() => setTab("daily")}>
          毎日の記録
        </button>
        <button className={tab === "training" ? "on" : ""} onClick={() => setTab("training")}>
          筋トレ
        </button>
        <button className={tab === "phys" ? "on" : ""} onClick={() => setTab("phys")}>
          測定
        </button>
      </div>
      {tab === "daily" && <DailyForm ctx={ctx} />}
      {tab === "training" && <TrainingForm ctx={ctx} />}
      {tab === "phys" && <PhysForm ctx={ctx} />}
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
      reason: (rec?.attendance === "欠席" ? rec.absence_reason ?? "" : "") as AbsenceReason | "",
      w: rec?.weight != null ? fmt1(rec.weight) : prev ? fmt1(prev.v) : "",
      prev,
    };
  };
  const [date, setDate] = useState(today());
  const [att, setAtt] = useState<Attendance | null>(initial(today()).att);
  // 欠席理由（欠席を選んだときだけ表示・必須）。登録済みならその理由を復元
  const [reason, setReason] = useState<AbsenceReason | "">(initial(today()).reason);
  const [w, setW] = useState(initial(today()).w);
  const [busy, setBusy] = useState(false);
  const prev = initial(date).prev;
  // オフの日（練習日ではない日）は出欠の入力なし。体重だけ記録できる
  const kind = dayKind(date, ctx.practice);
  const off = kind === "off";

  const changeDate = (d: string) => {
    const v = initial(d);
    setDate(d);
    setAtt(v.att);
    setReason(v.reason);
    setW(v.w);
  };
  const step = (n: number) => setW((cur) => Math.max(0, Math.round(((parseFloat(cur) || 0) + n) * 10) / 10).toFixed(1));

  const save = async () => {
    if (!off && !att) return ctx.toast("出席か欠席を選んでください");
    if (!off && att === "欠席" && !reason) return ctx.toast("欠席理由を選んでください");
    const weight = w.trim() === "" ? null : parseFloat(w);
    if (off && weight == null) return ctx.toast("体重を入力してください");
    if (weight != null && (isNaN(weight) || weight < 30 || weight > 250)) return ctx.toast("体重の数値を確認してください");
    setBusy(true);
    try {
      // 出席・オフのときは欠席理由を空にする（saveDaily 側でも null にする）
      await saveDaily(m.id, date, off ? null : att, weight, !off && att === "欠席" && reason ? reason : null);
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
      {kind !== "unset" && (
        <div style={{ marginTop: 8 }}>
          <span className={`daytag ${kind}`}>{kind === "practice" ? "この日は練習日です" : "この日はオフ（練習日ではありません）"}</span>
        </div>
      )}
      <label className="f">出欠</label>
      {off ? (
        <p className="muted">オフの日は出欠の入力は不要です。体重だけ記録できます。</p>
      ) : (
        <div className="att">
          <button className={`yes ${att === "出席" ? "on" : ""}`} onClick={() => setAtt("出席")}>
            出席
          </button>
          <button className={`no ${att === "欠席" ? "on" : ""}`} onClick={() => setAtt("欠席")}>
            欠席
          </button>
        </div>
      )}
      {!off && att === "欠席" && (
        <>
          <label className="f" htmlFor="reason">
            欠席理由（必須）
          </label>
          <select id="reason" className="t" value={reason} onChange={(e) => setReason(e.target.value as AbsenceReason | "")}>
            <option value="">選択してください</option>
            {ABSENCE_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </>
      )}
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

// 今週の筋トレ遂行度（0〜10をタップするだけで保存）
function TrainingForm({ ctx }: { ctx: Ctx }) {
  const m = ctx.me;
  const cur = weekStart(today());
  const [ws, setWs] = useState(cur);
  const [busy, setBusy] = useState(false);
  const score = m.training[ws];
  const criteria = ctx.settings.training_criteria;

  const pick = async (n: number) => {
    if (busy || ctx.readOnly) return;
    setBusy(true);
    try {
      await saveTraining(m.id, ws, n);
      await ctx.reload();
      ctx.toast(`筋トレ遂行度 ${n} を記録しました ✓`);
    } catch {
      ctx.toast("保存に失敗しました。通信を確認してください");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card">
        <div className="datebar" style={{ marginBottom: 6 }}>
          <button onClick={() => setWs(addDays(ws, -7))} aria-label="前の週">
            ‹
          </button>
          <b style={{ flex: 1, textAlign: "center" }}>
            {ws === cur ? "今週" : weekLabel(ws)}の筋トレ遂行度
          </b>
          <button onClick={() => ws < cur && setWs(addDays(ws, 7))} disabled={ws >= cur} style={ws >= cur ? { opacity: 0.3 } : undefined} aria-label="次の週">
            ›
          </button>
        </div>
        <p className="muted" style={{ textAlign: "center" }}>
          {weekLabel(ws)} ・ {score == null ? "未入力" : `記録済み：${score}`}
        </p>
        <div className="score11">
          {Array.from({ length: 11 }, (_, n) => (
            <button key={n} className={score === n ? "on" : ""} onClick={() => pick(n)} disabled={busy}>
              {n}
            </button>
          ))}
        </div>
        <p className="muted" style={{ textAlign: "center", marginTop: 8 }}>
          数字をタップすると、そのまま記録されます（あとから変更できます）
        </p>
      </div>
      {criteria && (
        <div className="card">
          <h3>評価基準</h3>
          <p className="muted" style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>
            {criteria}
          </p>
        </div>
      )}
    </>
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
  // 項目設定で追加した項目（その日の記録があれば表示）
  // 入力欄を出すのは、体重・Big3（専用の入力欄あり）以外の項目。並び順は項目設定どおり
  const defs = ctx.metrics.filter((x) => !isLinked(x));
  // Big3の名前は項目設定で変更した名前を使う
  const liftName = (k: LiftKey, l: string) => ctx.metrics.find((x) => x.key === k)?.name ?? l;
  const initialX = (d: string): Record<number, string> =>
    Object.fromEntries(defs.map((x) => [x.id, m.metrics[x.id]?.[d] != null ? String(m.metrics[x.id][d]) : ""]));
  const [date, setDate] = useState(today());
  const [vals, setVals] = useState<Record<LiftKey, string>>(initial(today()));
  const [xv, setXv] = useState<Record<number, string>>(initialX(today()));
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
    const xs = defs.map((x) => {
      const t = (xv[x.id] ?? "").trim();
      const n = t === "" ? null : parseFloat(t);
      if (n != null && (isNaN(n) || n < 0 || n > 100000)) bad = true;
      return { metricId: x.id, value: n };
    });
    if (bad) return ctx.toast("数値を確認してください");
    const hasLift = LIFTS.some(([k]) => rec[k] != null);
    // 空欄にした項目は、その日にもともと記録があった場合だけ削除する
    const xChanged = xs.filter((x) => x.value != null || m.metrics[x.metricId]?.[date] != null);
    if (!hasLift && !xs.some((x) => x.value != null)) return ctx.toast("少なくとも1項目を入力してください");
    setBusy(true);
    try {
      if (hasLift) await savePhysical(m.id, date, rec);
      if (xChanged.length) await saveMetricValues(m.id, date, xChanged);
      await ctx.reload();
      const prs = LIFTS.filter(([k]) => {
        const v = rec[k];
        const best = mx[k];
        return v != null && (best == null || v > best);
      }).map(([k, l]) => liftName(k, l));
      // 項目設定の「フィジカル」項目も自己ベスト更新を判定
      defs
        .filter((x) => x.category === "フィジカル")
        .forEach((x) => {
          const v = xs.find((y) => y.metricId === x.id)?.value;
          const best = metricBest(m, x);
          if (v != null && (best == null || (x.better === "low" ? v < best : v > best))) prs.push(x.name);
        });
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
            setXv(initialX(e.target.value));
          }}
        />
        {LIFTS.map(([k, l]) => (
          <div key={k}>
            <label className="f">{liftName(k, l)}</label>
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
        {(["体組成", "フィジカル"] as const).map((c) => {
          const list = defs.filter((x) => x.category === c);
          if (!list.length) return null;
          return (
            <div key={c}>
              <div className="muted" style={{ fontWeight: 700, marginTop: 22, borderTop: "1px dashed var(--line)", paddingTop: 12 }}>
                {c}
              </div>
              {list.map((x) => {
                const last = metricLatest(m, x);
                const best = c === "フィジカル" ? metricBest(m, x) : null;
                return (
                  <div key={x.id}>
                    <label className="f">{x.name}</label>
                    <div className="stepper">
                      <input
                        className="t"
                        type="number"
                        inputMode="decimal"
                        step="any"
                        value={xv[x.id] ?? ""}
                        onChange={(e) => setXv((cur) => ({ ...cur, [x.id]: e.target.value }))}
                        style={{ fontSize: 24 }}
                      />
                      <span className="unit" style={{ width: "auto", minWidth: 24 }}>
                        {unitOf(x)}
                      </span>
                    </div>
                    <div className="prev">
                      {last ? `前回 ${fmt2(last.v)}${unitOf(x)}（${md(last.d)}）` : "まだ記録がありません"}
                      {best != null && ` ・ 自己ベスト ${fmt2(best)}${unitOf(x)}`}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
        <p className="muted" style={{ marginTop: 14 }}>測った項目だけ入力すればOKです（空欄の項目は記録されません）。</p>
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
  return (
    <>
      <h2 className="page">ランキング</h2>
      <div className="card">
        <RankBoard ctx={ctx} />
      </div>
    </>
  );
}
