"use client";

// 複数の折れ線を重ねて比較するグラフ（体組成の「全体・FW・BK」の推移など）
// 表示幅に合わせて描き直すので、スマホでも横にはみ出しません。

import { useEffect, useRef, useState } from "react";
import { md, type Point } from "@/lib/calc";
import { TipBox, useChartTip } from "./ChartTip";

// dash：点線で描く（平均の基準線など）
export type Series = { label: string; color: string; pts: Point[]; dash?: boolean };

// minRange：縦軸の最小の幅（体重比のように差が小さい値でも線がつぶれないように）
// unit：吹き出しの単位 / note：吹き出しで1本目の線（自分）に添える文（例：「練習後 18:30」）
type Props = { series: Series[]; h?: number; digits?: number; minRange?: number; unit?: string; note?: (d: string) => string };
export default function MultiLineChart({ series, h = 200, digits = 1, minRange = 1, unit = "", note }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const tip = useChartTip(ref);
  const [w, setW] = useState(600);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(() => setW(Math.max(220, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(220, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  const all = series.flatMap((s) => s.pts);
  const dates = all.map((p) => p.d).sort();

  return (
    <div ref={ref} style={{ width: "100%" }}>
      {/* 凡例 */}
      <div className="legend">
        {series.map((s) => (
          <span key={s.label}>
            <i style={s.dash ? { background: `repeating-linear-gradient(90deg, ${s.color} 0 4px, transparent 4px 7px)` } : { background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      {all.length < 2 || dates[0] === dates[dates.length - 1] ? (
        <div className="empty">データが2日分以上になるとグラフを表示します</div>
      ) : (
        <Chart series={series} w={w} h={h} digits={digits} minRange={minRange} first={dates[0]} last={dates[dates.length - 1]} tip={tip} unit={unit} note={note} />
      )}
    </div>
  );
}

function Chart({
  series,
  w,
  h,
  digits,
  minRange,
  first,
  last,
  tip,
  unit,
  note,
}: {
  series: Series[];
  w: number;
  h: number;
  digits: number;
  minRange: number;
  first: string;
  last: string;
  tip: ReturnType<typeof useChartTip>;
  unit: string;
  note?: (d: string) => string;
}) {
  const vs = series.flatMap((s) => s.pts.map((p) => p.v));
  let lo = Math.min(...vs),
    hi = Math.max(...vs);
  if (hi - lo < minRange) {
    const c = (hi + lo) / 2;
    lo = c - minRange / 2;
    hi = c + minRange / 2;
  }
  const pad = (hi - lo) * 0.12;
  lo -= pad;
  hi += pad;
  const L = 40,
    R = 10,
    T = 10,
    B = 22;
  const t0 = new Date(first).getTime(),
    t1 = new Date(last).getTime();
  const X = (d: string) => L + ((new Date(d).getTime() - t0) / (t1 - t0 || 1)) * (w - L - R);
  const Y = (v: number) => T + ((hi - v) / (hi - lo)) * (h - T - B);
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const mid = new Date((t0 + t1) / 2);
  const midStr = `${mid.getFullYear()}-${String(mid.getMonth() + 1).padStart(2, "0")}-${String(mid.getDate()).padStart(2, "0")}`;

  // 吹き出しで選べる日付（どれかの線に値がある日）
  const allDates = [...new Set(series.flatMap((s) => s.pts.map((p) => p.d)))].sort();
  const act = tip.active;
  const at = (s: Series) => (act ? s.pts.find((p) => p.d === act) ?? null : null);
  const fmtV = (v: number) => v.toFixed(Math.max(digits, 1));
  return (
    <div style={{ position: "relative" }}>
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: "block", height: h }}>
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={L} x2={w - R} y1={Y(v)} y2={Y(v)} stroke="#e7e8e4" strokeWidth={1} />
          <text x={L - 6} y={Y(v) + 4} textAnchor="end">
            {v.toFixed(digits)}
          </text>
        </g>
      ))}
      <text x={L} y={h - 4}>
        {md(first)}
      </text>
      <text x={(L + w - R) / 2} y={h - 4} textAnchor="middle">
        {md(midStr)}
      </text>
      <text x={w - R} y={h - 4} textAnchor="end">
        {md(last)}
      </text>
      {series.map((s) => {
        if (!s.pts.length) return null;
        const path = s.pts.map((p, i) => `${i ? "L" : "M"}${X(p.d).toFixed(1)},${Y(p.v).toFixed(1)}`).join("");
        const end = s.pts[s.pts.length - 1];
        return (
          <g key={s.label}>
            <path
              d={path}
              fill="none"
              stroke={s.color}
              strokeWidth={s.dash ? 1.8 : 2.4}
              strokeDasharray={s.dash ? "5 4" : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {!s.dash && <circle cx={X(end.d)} cy={Y(end.v)} r={3.5} fill={s.color} />}
          </g>
        );
      })}
      {/* 選んだ日：縦の破線と、各線の強調の点 */}
      {act && (
        <g pointerEvents="none">
          <line x1={X(act)} x2={X(act)} y1={T} y2={h - B} stroke="#8a929c" strokeWidth={1} strokeDasharray="4 3" />
          {series.map((s) => {
            const p = at(s);
            return p ? <circle key={s.label} cx={X(p.d)} cy={Y(p.v)} r={5.5} fill="#fff" stroke={s.color} strokeWidth={3} /> : null;
          })}
        </g>
      )}
      {/* 透明な判定エリア（グラフ全体。縦の列のどこを触っても、その日付が選ばれる） */}
      <rect x={L} y={0} width={Math.max(0, w - L - R)} height={h} fill="transparent" style={{ cursor: "pointer" }} {...tip.handlers(w, allDates, X)} />
    </svg>
    {act && (
      <TipBox x={X(act)} w={w}>
        <div className="tip-d">{md(act)}</div>
        {series.map((s, i) => {
          const p = at(s);
          if (!p) return null;
          return (
            // 1本目（自分・全体など）は大きく、2本目以降は小さく。名前は凡例の最初の言葉（「BK平均 72.5kg」→「BK平均」）
            <div key={s.label} className={i === 0 ? "tip-v" : "tip-s"}>
              <i style={{ background: s.color }} />
              <span className="tip-l">{s.label.split(" ")[0]}</span>
              {fmtV(p.v)}
              {unit && ` ${unit}`}
            </div>
          );
        })}
        {note?.(act) && <div className="tip-n">{note(act)}</div>}
      </TipBox>
    )}
    </div>
  );
}
