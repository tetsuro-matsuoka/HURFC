"use client";

// 折れ線グラフ（体重推移・Big3合計推移）
// 表示幅に合わせて描き直すので、スマホでも文字がつぶれません。

import { useEffect, useId, useRef, useState } from "react";
import { md, type Point } from "@/lib/calc";

type Props = { pts: Point[]; h?: number; color?: string; label?: boolean; width?: number };

export default function LineChart({ pts, h = 170, color = "var(--accent)", label = true, width }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(width ?? 600);
  const gid = "g" + useId().replace(/[^a-zA-Z0-9]/g, "");

  useEffect(() => {
    if (width || !ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(() => setW(Math.max(200, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(200, el.clientWidth));
    return () => ro.disconnect();
  }, [width]);

  if (pts.length < 2) {
    return label ? <div className="empty">データが2件以上になるとグラフを表示します</div> : <span className="muted">—</span>;
  }

  const vs = pts.map((p) => p.v);
  let lo = Math.min(...vs),
    hi = Math.max(...vs);
  if (hi - lo < 2) {
    const c = (hi + lo) / 2;
    lo = c - 1;
    hi = c + 1;
  }
  const padY = (hi - lo) * 0.15;
  lo -= padY;
  hi += padY;
  const L = label ? 38 : 4,
    R = 8,
    T = 10,
    B = label ? 22 : 4;
  const t0 = new Date(pts[0].d).getTime(),
    t1 = new Date(pts[pts.length - 1].d).getTime();
  const X = (d: string) => L + ((new Date(d).getTime() - t0) / (t1 - t0 || 1)) * (w - L - R);
  const Y = (v: number) => T + ((hi - v) / (hi - lo)) * (h - T - B);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${X(p.d).toFixed(1)},${Y(p.v).toFixed(1)}`).join("");
  const last = pts[pts.length - 1];
  const area = `${path}L${X(last.d).toFixed(1)},${h - B}L${X(pts[0].d).toFixed(1)},${h - B}Z`;
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);

  return (
    <div ref={ref} style={{ width: width ? width : "100%", height: h }}>
      <svg className="chart" viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: "block", height: h }}>
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity={0.18} />
            <stop offset="1" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {label &&
          ticks.map((v, i) => (
            <g key={i}>
              <line x1={L} x2={w - R} y1={Y(v)} y2={Y(v)} stroke="#e7e8e4" strokeWidth={1} />
              <text x={L - 6} y={Y(v) + 4} textAnchor="end">
                {v.toFixed(1)}
              </text>
            </g>
          ))}
        {label && (
          <>
            <text x={L} y={h - 4}>
              {md(pts[0].d)}
            </text>
            <text x={w - R} y={h - 4} textAnchor="end">
              {md(last.d)}
            </text>
          </>
        )}
        <path d={area} fill={`url(#${gid})`} />
        <path d={path} fill="none" stroke={color} strokeWidth={label ? 2.5 : 2} strokeLinejoin="round" strokeLinecap="round" />
        {label && <circle cx={X(last.d)} cy={Y(last.v)} r={4.5} fill={color} />}
      </svg>
    </div>
  );
}
