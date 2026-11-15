"use client";

// 複数の折れ線を重ねて比較するグラフ（体組成の「全体・FW・BK」の推移など）
// 表示幅に合わせて描き直すので、スマホでも横にはみ出しません。

import { useEffect, useRef, useState } from "react";
import { md, type Point } from "@/lib/calc";

export type Series = { label: string; color: string; pts: Point[] };

export default function MultiLineChart({ series, h = 200, digits = 1 }: { series: Series[]; h?: number; digits?: number }) {
  const ref = useRef<HTMLDivElement>(null);
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
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      {all.length < 2 || dates[0] === dates[dates.length - 1] ? (
        <div className="empty">データが2日分以上になるとグラフを表示します</div>
      ) : (
        <Chart series={series} w={w} h={h} digits={digits} first={dates[0]} last={dates[dates.length - 1]} />
      )}
    </div>
  );
}

function Chart({ series, w, h, digits, first, last }: { series: Series[]; w: number; h: number; digits: number; first: string; last: string }) {
  const vs = series.flatMap((s) => s.pts.map((p) => p.v));
  let lo = Math.min(...vs),
    hi = Math.max(...vs);
  if (hi - lo < 1) {
    const c = (hi + lo) / 2;
    lo = c - 0.5;
    hi = c + 0.5;
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

  return (
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
            <path d={path} fill="none" stroke={s.color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={X(end.d)} cy={Y(end.v)} r={3.5} fill={s.color} />
          </g>
        );
      })}
    </svg>
  );
}
