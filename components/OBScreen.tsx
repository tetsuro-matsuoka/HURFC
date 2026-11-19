"use client";

// OB（引退した選手）とコーチのフィジカル自己ベスト（コーチ用）
//  ・上に「すべて / OBのみ / コーチのみ」の切り替えと「＋ OB・コーチ記録を追加」（名前・区分・卒業年度・ポジション・記録日・体重・各種目）
//  ・各行の「編集」で、名前などと、選んだ記録日の体重・測定値を追記・修正できる
//  ・種目プルダウン（Big3合計・各種目・体重比・スプリントモメンタムなど）で、歴代OBの自己ベストランキング
//    （選手画面と同じ見た目：1位👑・2位銀・3位銅で段階的に大きく）
//  ・体重比とスプリントモメンタムは、その自己ベストを記録した当時の体重を「（75.4kg時）」と併記
//    （その日の体重記録がなければ、それより前の直近の体重）
//  ・下に、OB全員の自己ベスト一覧（全種目）
//  現役の集計・順位には OB は入らない（選手管理で「引退」にした選手だけがここに出る）

import { Fragment, useState, type ReactNode } from "react";
import { Sheet, TeamRanking, type Ctx } from "./Shared";
import {
  BK_POSITIONS,
  FW_POSITIONS,
  basisLabel,
  fmt1,
  fmtMetric,
  fmtRatio,
  isLinked,
  isMinSec,
  metricBest,
  metricRatio,
  metricShownPoint,
  metricsOf,
  obLabel,
  obsOf,
  today,
  unitOf,
  unitOfPosition,
  weightAt,
  type RankRow,
} from "@/lib/calc";
import { adminCall } from "@/lib/data";
import type { Member, MetricDef, Position } from "@/lib/types";

// 自己ベストを記録した当時の体重（その日の記録がなければ直近の体重）
const weightWhen = (m: Member, def: MetricDef) => {
  const p = metricShownPoint(m, def);
  return p ? weightAt(m, p.d) : null;
};
// 名前の横の小さなラベル（2025年度卒 / コーチ など）とポジション
function ObBadge({ m }: { m: Member }) {
  return (
    <>
      <span className={`chip ${m.ob_kind === "coach" ? "ob-coach" : "ob-ob"} ob-badge`}>{obLabel(m)}</span>
      {m.position && <span className="ob-pos">{m.position}</span>}
    </>
  );
}
type Show = "all" | "ob" | "coach";

export function OBScreen({ ctx }: { ctx: Ctx }) {
  // 表示：すべて / OBのみ / コーチのみ
  const [show, setShow] = useState<Show>("all");
  // 記録の追加・編集の画面（id が null なら新しく追加）
  const [form, setForm] = useState<{ id: string | null } | null>(null);
  const allObs = obsOf(ctx.members);
  const obs = allObs.filter((m) => show === "all" || m.ob_kind === show);
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

  // 上の部分（見出し・追加ボタン・切り替え）と、追加・編集の画面は、OB がいなくても出す
  const top = (
    <>
      <div className="ob-head">
        <h2 className="page" style={{ margin: 0 }}>
          OB
        </h2>
        <button className="btn navy small" onClick={() => setForm({ id: null })}>
          ＋ OB・コーチ記録を追加
        </button>
      </div>
      <div className="seg ob-seg" role="group" aria-label="表示する人">
        {(
          [
            ["all", "すべて"],
            ["ob", "OBのみ"],
            ["coach", "コーチのみ"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={show === k ? "on" : ""} onClick={() => setShow(k)}>
            {l}
            <small> {k === "all" ? allObs.length : allObs.filter((m) => m.ob_kind === k).length}</small>
          </button>
        ))}
      </div>
      {form && <RecordSheet ctx={ctx} id={form.id} onClose={() => setForm(null)} />}
    </>
  );
  if (!obs.length)
    return (
      <>
        {top}
        <div className="card empty">
          {show === "coach"
            ? "コーチの記録はまだありません。「＋ OB・コーチ記録を追加」で区分「コーチ」を選んで登録できます。"
            : "OBはまだいません。「選手管理」で選手の「引退」を押すか、「＋ OB・コーチ記録を追加」で登録すると、ここにフィジカルの自己ベストが表示されます。"}
        </div>
      </>
    );
  if (!def)
    return (
      <>
        {top}
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
      {top}
      <div className="card accent-top">
        <select className="t phys-sel" style={{ width: "100%", marginBottom: 10 }} value={key} onChange={(e) => setSel(e.target.value)} aria-label="種目を選ぶ">
          {options.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <h3>
          {show === "coach" ? "コーチ" : show === "ob" ? "OB" : "OB・コーチ"} 自己ベストランキング <small>{options.find(([k]) => k === key)?.[1]}・{obs.length}名</small>
        </h3>
        <TeamRanking ctx={ctx} rows={rows} fmtV={fmtV} sub={(r) => <ObBadge m={ctx.members[r.id]} />} />
      </div>
      <OBBestTable ctx={ctx} obs={obs} defs={defs} onEdit={(id) => setForm({ id })} />
    </>
  );
}

// OB 全員の自己ベスト一覧（全種目。体重比が ON の項目はすぐ右に体重比と記録時の体重）
function OBBestTable({ ctx, obs, defs, onEdit }: { ctx: Ctx; obs: Member[]; defs: MetricDef[]; onEdit: (id: string) => void }) {
  return (
    <div className="card">
      <h3>
        自己ベスト一覧 <small>名前をタップで詳細・「編集」で記録の追記・修正</small>
      </h3>
      <div className="scroll">
        <table className="tbl">
          <tbody>
            <tr>
              <th>名前</th>
              <th>区分</th>
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
                <td style={{ whiteSpace: "nowrap" }}>
                  {m.name}{" "}
                  <button
                    className="ob-edit"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(m.id);
                    }}
                  >
                    編集
                  </button>
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <span className={`chip ${m.ob_kind === "coach" ? "ob-coach" : "ob-ob"} ob-badge`}>{obLabel(m)}</span>
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

/* ---------- OB・コーチ記録の追加・編集 ----------
   1つの画面で：名前・区分（OB / コーチ）・卒業年度（OBのみ）・ポジション・記録日・その日の体重・各種目の値
   保存すると、その記録日の値として保存（空欄の種目はその日の記録を消す）。自己ベスト・Big3合計・体重比・
   スプリントモメンタム（同じ日の体重とスプリントから）は、ほかの画面と同じ計算で自動で出る */
const LIFT_INPUTS: [keyof Member["physical"][string], string][] = [
  ["squat", "SQ（スクワット）"],
  ["bench_press", "BP（ベンチプレス）"],
  ["deadlift", "DL（デッドリフト）"],
];
// "分:秒" → 秒（空なら null、おかしな値なら NaN）
const toSeconds = (t: string): number | null => {
  const [mi = "", se = ""] = t.split(":");
  if (mi.trim() === "" && se.trim() === "") return null;
  if (!t.includes(":")) return Number(t);
  const a = mi.trim() === "" ? 0 : Number(mi),
    b = se.trim() === "" ? 0 : Number(se);
  if (!Number.isInteger(a) || a < 0 || isNaN(b) || b < 0 || b >= 60) return NaN;
  return a * 60 + b;
};
// その人のいちばん新しい記録の日（体重・Big3・測定項目のどれか）
const latestDate = (m: Member) =>
  [...Object.keys(m.daily).filter((d) => m.daily[d].weight != null), ...Object.keys(m.physical), ...Object.values(m.metrics).flatMap((r) => Object.keys(r))].sort().pop() ?? null;

function RecordSheet({ ctx, id, onClose }: { ctx: Ctx; id: string | null; onClose: () => void }) {
  const m = id ? ctx.members[id] : null;
  const defs = metricsOf(ctx.metrics, "フィジカル").filter((x) => !isLinked(x) && !x.derived);
  const [name, setName] = useState(m?.name ?? "");
  const [kind, setKind] = useState<"ob" | "coach">(m?.ob_kind ?? "ob");
  const [grad, setGrad] = useState(m?.grad_label ?? "");
  const [pos, setPos] = useState<Position | "">((m?.position as Position) ?? "");
  // 記録日の値を入力欄の形に（編集のときはその日の記録を入れておく）
  const valuesOn = (d: string) => ({
    weight: m?.daily[d]?.weight != null ? String(m.daily[d].weight) : "",
    lifts: Object.fromEntries(LIFT_INPUTS.map(([k]) => [k, m?.physical[d]?.[k] != null ? String(m.physical[d][k]) : ""])) as Record<string, string>,
    metrics: Object.fromEntries(
      defs.map((x) => {
        const v = m?.metrics[x.id]?.[d];
        return [x.id, v == null ? "" : isMinSec(x) ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}` : String(v)];
      }),
    ) as Record<number, string>,
  });
  const [date, setDate] = useState((m && latestDate(m)) ?? today());
  const [vals, setVals] = useState(valuesOn(date));
  const [busy, setBusy] = useState(false);

  const changeDate = (d: string) => {
    setDate(d);
    setVals(valuesOn(d));
  };
  const save = async () => {
    const n = name.trim();
    if (!n) return ctx.toast("名前を入力してください");
    const metrics: Record<number, number | null> = {};
    for (const x of defs) {
      const t = (vals.metrics[x.id] ?? "").trim();
      const v = isMinSec(x) ? toSeconds(t) : t === "" ? null : Number(t);
      if (v != null && (isNaN(v) || v <= 0)) return ctx.toast(`「${x.name}」の値を確認してください${isMinSec(x) ? "（例：4:50）" : ""}`);
      metrics[x.id] = v;
    }
    const num = (t: string) => (t.trim() === "" ? null : Number(t));
    const lifts = Object.fromEntries(LIFT_INPUTS.map(([k]) => [k, num(vals.lifts[k] ?? "")]));
    if ([num(vals.weight), ...Object.values(lifts)].some((v) => v != null && (isNaN(v) || v <= 0))) return ctx.toast("体重・Big3の値を確認してください");
    setBusy(true);
    try {
      await adminCall("ob_record", {
        id: id ?? undefined,
        name: n,
        ob_kind: kind,
        grad_label: kind === "ob" ? grad : null,
        position: pos || null,
        date,
        weight: num(vals.weight),
        lifts,
        metrics,
      });
      await ctx.reload();
      ctx.toast(id ? `${n} さんの記録を保存しました` : `${n} さんを追加しました`);
      onClose();
    } catch (e) {
      ctx.toast(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={id ? "OB・コーチ記録を編集" : "OB・コーチ記録を追加"} onClose={onClose}>
      <label className="f" style={{ marginTop: 0 }}>
        名前（必須）
      </label>
      <input className="t" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="f">区分</label>
      <div className="seg" style={{ marginBottom: 0 }}>
        <button className={kind === "ob" ? "on" : ""} onClick={() => setKind("ob")}>
          OB
        </button>
        <button className={kind === "coach" ? "on" : ""} onClick={() => setKind("coach")}>
          コーチ
        </button>
      </div>
      {kind === "ob" && (
        <>
          <label className="f">卒業年度（任意）</label>
          <input className="t" value={grad} placeholder="例：2025年度卒" onChange={(e) => setGrad(e.target.value)} />
        </>
      )}
      <label className="f">ポジション（任意）{pos && <small className="muted"> {unitOfPosition(pos)}</small>}</label>
      <select className="t" value={pos} onChange={(e) => setPos(e.target.value as Position | "")}>
        <option value="">未設定</option>
        <optgroup label="FW">
          {FW_POSITIONS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </optgroup>
        <optgroup label="BK">
          {BK_POSITIONS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </optgroup>
      </select>

      <div className="ob-rec">
        <label className="f">記録日</label>
        <input className="t" type="date" value={date} max={today()} onChange={(e) => e.target.value && changeDate(e.target.value)} />
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          この日の記録として保存します（空欄の種目はこの日の記録なし）。別の日の記録を追記するときは日付を変えてください。
        </p>
        <div className="ob-grid">
          <label>
            <span>記録時体重（kg）</span>
            <input className="t" inputMode="decimal" value={vals.weight} onChange={(e) => setVals({ ...vals, weight: e.target.value })} />
          </label>
          {LIFT_INPUTS.map(([k, l]) => (
            <label key={k}>
              <span>{l}（kg）</span>
              <input className="t" inputMode="decimal" value={vals.lifts[k] ?? ""} onChange={(e) => setVals({ ...vals, lifts: { ...vals.lifts, [k]: e.target.value } })} />
            </label>
          ))}
          {defs.map((x) => (
            <label key={x.id}>
              <span>
                {x.name}
                {isMinSec(x) ? "（分:秒）" : unitOf(x) ? `（${unitOf(x)}）` : ""}
              </span>
              <input
                className="t"
                inputMode={isMinSec(x) ? "text" : "decimal"}
                placeholder={isMinSec(x) ? "4:50" : ""}
                value={vals.metrics[x.id] ?? ""}
                onChange={(e) => setVals({ ...vals, metrics: { ...vals.metrics, [x.id]: e.target.value } })}
              />
            </label>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
          Big3合計・体重比・スプリントモメンタム（同じ日の体重とスプリント）は自動で計算します。
        </p>
      </div>

      <button className="btn navy" disabled={busy} onClick={save}>
        {busy ? "保存中…" : "保存する"}
      </button>
      <button className="btn ghost" onClick={onClose}>
        やめる
      </button>
    </Sheet>
  );
}
