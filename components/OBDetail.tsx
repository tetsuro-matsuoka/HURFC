"use client";

// OB・コーチの詳細（OBタブで名前をタップしたとき）
//  種目を選ぶのではなく、その人のフィジカルの自己ベストを全種目まとめて1つの一覧に並べる
//  並び順は「選手一覧」「自己ベスト一覧」の列と同じ（体重 → 項目設定のフィジカルの順）
//  1行に1種目：左に種目名と補足（計算の基準・体重比・記録時体重）、右に数値・単位・測った日
//  記録がない項目は「—」を薄く表示

import type { Ctx } from "./Shared";
import {
  basisLabel,
  fmt0,
  fmt1,
  fmtMetric,
  fmtRatio,
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

const BIG3_KEYS = ["big3_total", "squat", "bench_press", "deadlift"];

export function OBDetail({ m, ctx, onClose }: { m: Member; ctx: Ctx; onClose: () => void }) {
  const defs = metricsOf(ctx.metrics, "フィジカル");
  const lw = latestWeight(m);

  // 1種目の行
  const row = (x: MetricDef) => {
    const v = metricBest(m, x);
    const p = v != null ? metricShownPoint(m, x) : null;
    const big3 = BIG3_KEYS.includes(x.key ?? "");
    const ratio = v != null && (x.show_ratio || big3) ? metricRatio(m, x) : null;
    const w = v != null && x.derived && p ? weightAt(m, p.d) : null;
    return (
      <li key={x.id} className={`obd-row ${v == null ? "none" : ""} ${x.key === "big3_total" ? "total" : ""}`}>
        <div className="obd-name">
          <b>{x.name}</b>
          <span className="obd-sub">
            {basisLabel(x) && <span>{basisLabel(x).replace(/[（）]/g, "")}</span>}
            {ratio != null && <span className="obd-ratio">体重比 ×{fmtRatio(ratio)}</span>}
            {w != null && <span>（{fmt1(w)}kg時）</span>}
          </span>
        </div>
        <div className="obd-val">
          <span className="num">
            {v == null ? "—" : big3 ? fmt0(v) : fmtMetric(x, v)}
            {v != null && unitOf(x) && <small>{unitOf(x)}</small>}
          </span>
          {p && <span className="obd-d">{md(p.d)}</span>}
        </div>
      </li>
    );
  };

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="hd">
          <h2>{m.name}</h2>
          <button className="x" onClick={onClose} aria-label="閉じる">
            ×
          </button>
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

        <div className="card obd-sec">
          <h3>フィジカル自己ベスト</h3>
          <ul className="obd-list">
            {/* 1. 体重（いちばん新しい記録） */}
            <li className={`obd-row ${lw ? "" : "none"}`}>
              <div className="obd-name">
                <b>体重</b>
                <span className="obd-sub">記録時体重</span>
              </div>
              <div className="obd-val">
                <span className="num">
                  {lw ? fmt1(lw.v) : "—"}
                  {lw && <small>kg</small>}
                </span>
                {lw && <span className="obd-d">{md(lw.d)}</span>}
              </div>
            </li>
            {/* 2. 以降：選手一覧のフィジカルの列と同じ順 */}
            {defs.map(row)}
          </ul>
          {!defs.length && <div className="empty">フィジカルの項目がありません</div>}
        </div>
      </div>
    </div>
  );
}
