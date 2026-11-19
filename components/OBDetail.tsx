"use client";

// OB・コーチの詳細（OBタブで名前をタップしたとき）
//  種目を選ぶのではなく、その人のフィジカルの自己ベストを全種目まとめて1画面に並べる
//   ・基本：記録時体重・ポジション（FW/BK）・区分
//   ・ウエイト（Big3）：Big3合計（体重比）を大きく、その下に SQ・BP・DL（体重比）を3列
//   ・スプリント・持久力：スプリントモメンタム（計算の距離・記録時体重）・10m・30m・ブロンコなど
//   ・ジャンプ・瞬発力・その他：CMJ・RSI など、上に入らない項目すべて
//  記録がない項目は「—」を薄く表示

import type { ReactNode } from "react";
import type { Ctx } from "./Shared";
import {
  basisLabel,
  fmt0,
  fmt1,
  fmtMetric,
  fmtRatio,
  isMinSec,
  latestWeight,
  md,
  metricBest,
  metricRatio,
  metricShownPoint,
  metricsOf,
  obLabel,
  unitOf,
  unitOfPosition,
  weightAt,
} from "@/lib/calc";
import type { Member, MetricDef } from "@/lib/types";

const BIG3_KEYS = ["squat", "bench_press", "deadlift"];
const LIFT_SHORT: Record<string, string> = { squat: "SQ", bench_press: "BP", deadlift: "DL" };
// スプリント・持久力の項目か（自動計算のモメンタム・タイム系・距離の付いた名前・ブロンコなど）
const isSprint = (x: MetricDef) =>
  !!x.derived || isMinSec(x) || x.better === "low" || /\d+(\.\d+)?\s*[mｍＭM](?![a-zA-Z])|ブロンコ|スプリント|走|シャトル|ヨーヨー|yo-?yo/i.test(x.name);

export function OBDetail({ m, ctx, onClose }: { m: Member; ctx: Ctx; onClose: () => void }) {
  const defs = metricsOf(ctx.metrics, "フィジカル");
  const lw = latestWeight(m);
  const total = defs.find((x) => x.key === "big3_total");
  const lifts = BIG3_KEYS.map((k) => defs.find((x) => x.key === k)).filter((x): x is MetricDef => !!x);
  const rest = defs.filter((x) => x.key !== "big3_total" && !BIG3_KEYS.includes(x.key ?? ""));
  const sprint = rest.filter(isSprint);
  const other = rest.filter((x) => !isSprint(x));

  // 1つの項目のカード：自己ベスト・単位・体重比（設定が ON のとき）・記録時体重（モメンタム）
  const card = (x: MetricDef, label?: string, big = false): ReactNode => {
    const v = metricBest(m, x);
    const p = v != null ? metricShownPoint(m, x) : null;
    const ratio = v != null && (x.show_ratio || x.key === "big3_total" || BIG3_KEYS.includes(x.key ?? "")) ? metricRatio(m, x) : null;
    const w = v != null && x.derived && p ? weightAt(m, p.d) : null;
    return (
      <div key={x.id} className={`obd-card ${v == null ? "none" : ""} ${big ? "big" : ""}`}>
        <div className="obd-l">
          {label ?? x.name}
          {basisLabel(x) && <small>{basisLabel(x)}</small>}
        </div>
        <div className="obd-v num">
          {v == null ? "—" : x.key === "big3_total" || BIG3_KEYS.includes(x.key ?? "") ? fmt0(v) : fmtMetric(x, v)}
          {v != null && unitOf(x) && <small>{unitOf(x)}</small>}
        </div>
        <div className="obd-s">
          {ratio != null && <span className="obd-ratio">×{fmtRatio(ratio)}</span>}
          {w != null && <span>（{fmt1(w)}kg時）</span>}
          {p && <span className="obd-d">{md(p.d)}</span>}
        </div>
      </div>
    );
  };
  const section = (title: string, list: MetricDef[]) =>
    list.length > 0 && (
      <div className="card obd-sec">
        <h3>{title}</h3>
        <div className="obd-grid">{list.map((x) => card(x))}</div>
      </div>
    );

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="hd">
          <h2>{m.name}</h2>
          <button className="x" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>

        {/* 基本・体組成 */}
        <div className="card obd-basic">
          <div>
            <div className="obd-l">記録時体重</div>
            <div className="obd-v num">
              {lw ? fmt1(lw.v) : "—"}
              <small>kg</small>
            </div>
            <div className="obd-s">{lw ? `${md(lw.d)}の記録` : "記録なし"}</div>
          </div>
          <div className="obd-tags">
            <span className={`chip ${m.ob_kind === "coach" ? "ob-coach" : "ob-ob"}`}>{obLabel(m)}</span>
            {m.position && (
              <span className="chip none">
                {m.position}
                {unitOfPosition(m.position) && `・${unitOfPosition(m.position)}`}
              </span>
            )}
          </div>
        </div>

        {/* ウエイト（Big3）：合計を大きく、その下に3種目 */}
        {(total || lifts.length > 0) && (
          <div className="card obd-sec">
            <h3>ウエイト（Big3）</h3>
            {total && card(total, "Big3合計", true)}
            {lifts.length > 0 && <div className="obd-grid three">{lifts.map((x) => card(x, LIFT_SHORT[x.key ?? ""] ?? x.name))}</div>}
          </div>
        )}
        {section("スプリント・持久力", sprint)}
        {section("ジャンプ・瞬発力・その他", other)}
        {!defs.length && <div className="card empty">フィジカルの項目がありません</div>}
      </div>
    </div>
  );
}
