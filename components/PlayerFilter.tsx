"use client";

// 選手の絞り込み（学年・FW/BK）とポジション表示の部品
// 「選手一覧」と「選手管理」で共通で使う

import { GRADES, unitOfPosition } from "@/lib/calc";
import type { Member, Unit } from "@/lib/types";

export type Filter = { grade: number | null; unit: Unit | null };
export const NO_FILTER: Filter = { grade: null, unit: null };

export const applyFilter = (ps: Member[], f: Filter) =>
  ps.filter((m) => (f.grade == null || m.grade === f.grade) && (f.unit == null || unitOfPosition(m.position) === f.unit));

const GRADE_BUTTONS = [...GRADES].sort((a, b) => b - a); // 5年 → 1年

export function FilterChips({ f, set }: { f: Filter; set: (f: Filter) => void }) {
  return (
    <div className="chips" style={{ margin: 0 }}>
      <button className={f.grade == null ? "on" : ""} onClick={() => set({ ...f, grade: null })}>
        全学年
      </button>
      {GRADE_BUTTONS.map((g) => (
        <button key={g} className={f.grade === g ? "on" : ""} onClick={() => set({ ...f, grade: g })}>
          {g}年
        </button>
      ))}
      <span className="chip-sep" />
      <button className={f.unit == null ? "on" : ""} onClick={() => set({ ...f, unit: null })}>
        FW・BK
      </button>
      {(["FW", "BK"] as Unit[]).map((u) => (
        <button key={u} className={f.unit === u ? "on" : ""} onClick={() => set({ ...f, unit: u })}>
          {u}
        </button>
      ))}
    </div>
  );
}

// FW / BK の色付きバッジ
export function UnitBadge({ m }: { m: Member }) {
  const u = unitOfPosition(m.position);
  if (!u) return <span className="muted">—</span>;
  return <span className={`chip ${u === "FW" ? "fw" : "bk"}`}>{u}</span>;
}
