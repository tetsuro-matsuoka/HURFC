"use client";

// グラフの吹き出し（ツールチップ）の共通部品
//  ・グラフを指でタップ／マウスを合わせると、いちばん近い日付を選ぶ（縦の列全体が反応する）
//  ・グラフの外をタップすると閉じる。マウスがグラフから離れても閉じる

import { useEffect, useState } from "react";
import type { ReactNode, PointerEvent, RefObject } from "react";

export function useChartTip(ref: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState<string | null>(null);

  // グラフの外をタップしたら閉じる
  useEffect(() => {
    const close = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setActive(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [ref]);

  // 触った位置から、いちばん近い日付を選ぶ
  const pick = (e: PointerEvent<SVGRectElement>, w: number, dates: string[], X: (d: string) => number) => {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg || !dates.length) return null;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * w) / rect.width;
    let best = dates[0];
    dates.forEach((d) => {
      if (Math.abs(X(d) - x) < Math.abs(X(best) - x)) best = d;
    });
    setActive(best);
    return best;
  };

  // グラフ全体に重ねる透明な判定エリアに付けるイベント
  // onPick：タップ（クリック）で選んだ日付を知らせる（例：その週の評価基準を開く）
  const handlers = (w: number, dates: string[], X: (d: string) => number, onPick?: (d: string) => void) => ({
    onPointerDown: (e: PointerEvent<SVGRectElement>) => {
      const d = pick(e, w, dates, X);
      if (d && onPick) onPick(d);
    },
    onPointerMove: (e: PointerEvent<SVGRectElement>) => e.pointerType === "mouse" && pick(e, w, dates, X),
    onPointerLeave: (e: PointerEvent<SVGRectElement>) => e.pointerType === "mouse" && setActive(null),
  });

  return { active, handlers };
}

// 吹き出しの本体。x はグラフ内の横位置（px）。端ではみ出さないように寄せる
export function TipBox({ x, w, children }: { x: number; w: number; children: ReactNode }) {
  const left = Math.min(Math.max(x, 64), w - 64);
  return (
    <div className="chart-tip" style={{ left }}>
      {children}
    </div>
  );
}
