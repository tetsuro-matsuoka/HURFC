"use client";

// 全体・FW・BK の比較に使う共通部品（『体組成』と『フィジカル』で同じ見た目にするため）
//  ・DateBar     … 基準日の切り替え（‹ 日付 ›）
//  ・GroupCards  … 全体・FW・BK の平均カード（上の線：黒・青・オレンジ）と 7日・30日前比
//  ・PeriodSeg   … 推移グラフの期間（30日 / 90日 / 全期間）
//  ・groupTrend  … 推移グラフ用に、期間内の毎日のグループ平均を計算

import type { ReactNode } from "react";
import type { Series } from "./MultiLineChart";
import { addDays, today, unitOfPosition, wd, type Point } from "@/lib/calc";
import type { Member } from "@/lib/types";

export type GroupKey = "all" | "FW" | "BK";
export const GROUPS: { key: GroupKey; label: string; color: string }[] = [
  { key: "all", label: "全体", color: "#2b2f36" },
  { key: "FW", label: "FW", color: "#2563a8" },
  { key: "BK", label: "BK", color: "#e07b00" },
];
export type Period = 30 | 90 | 0; // 0 = 全期間

export const splitGroups = (ps: Member[]): Record<GroupKey, Member[]> => ({
  all: ps,
  FW: ps.filter((m) => unitOfPosition(m.position) === "FW"),
  BK: ps.filter((m) => unitOfPosition(m.position) === "BK"),
});

// 平均（null は除く。全員 null なら null）
export const avg = (v: (number | null)[]) => {
  const x = v.filter((n): n is number => n != null && !isNaN(n));
  return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null;
};

// その日時点の値（その日以前で一番新しい記録）。記録がなければ null
export function valueAsOf(pts: Point[], d: string): number | null {
  let v: number | null = null;
  for (const p of pts) {
    if (p.d > d) break;
    v = p.v;
  }
  return v;
}

export function DateBar({ d, setD }: { d: string; setD: (d: string) => void }) {
  return (
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
  );
}

// 全体・FW・BK の平均カード。at(グループ, 日付) でその日時点の平均を返す
export function GroupCards({
  groups,
  d,
  label,
  unit,
  at,
  fmt,
}: {
  groups: Record<GroupKey, Member[]>;
  d: string;
  label: string;
  unit: string;
  at: (g: GroupKey, day: string) => number | null;
  fmt: (v: number) => string;
}) {
  const diff = (a: number | null, b: number | null): ReactNode => {
    if (a == null || b == null) return <span className="muted">—</span>;
    const v = a - b;
    return (
      <span className={v >= 0 ? "up" : "down"}>
        {v >= 0 ? "+" : ""}
        {fmt(v)}
      </span>
    );
  };
  return (
    <div className="bcards">
      {GROUPS.map((g) => {
        const now = at(g.key, d);
        return (
          <div key={g.key} className="bcard" style={{ borderTopColor: g.color }}>
            <div className="bc-h">
              <b style={{ color: g.color }}>{g.label}</b>
              <small>{groups[g.key].length}名</small>
            </div>
            <div className="bc-l">{label}</div>
            <div className="bc-v num">
              {now == null ? "—" : fmt(now)}
              {unit && <small>{unit}</small>}
            </div>
            <div className="bc-d num">
              <span>7日 {diff(now, at(g.key, addDays(d, -7)))}</span>
              <span>30日 {diff(now, at(g.key, addDays(d, -30)))}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PeriodSeg({ period, setPeriod }: { period: Period; setPeriod: (p: Period) => void }) {
  return (
    <div className="seg" style={{ marginBottom: 10 }}>
      {([30, 90, 0] as Period[]).map((p) => (
        <button key={p} className={period === p ? "on" : ""} onClick={() => setPeriod(p)} style={{ fontSize: 14, padding: 8 }}>
          {p ? `${p}日` : "全期間"}
        </button>
      ))}
    </div>
  );
}

// 推移グラフ用：期間内の毎日について、グループごとの平均（at と同じ計算）
// first：全期間のときの開始日（いちばん古い記録の日）
export function groupTrend(d: string, period: Period, first: string | null, at: (g: GroupKey, day: string) => number | null): Series[] {
  const from = period ? addDays(d, -period + 1) : first;
  if (!from || from > d) return GROUPS.map((g) => ({ label: g.label, color: g.color, pts: [] }));
  const days: string[] = [];
  for (let x = from; x <= d; x = addDays(x, 1)) days.push(x);
  return GROUPS.map((g) => {
    const pts: Point[] = [];
    days.forEach((day) => {
      const v = at(g.key, day);
      if (v != null) pts.push({ d: day, v });
    });
    return { label: g.label, color: g.color, pts };
  });
}
