"use client";

// 選手の絞り込み（学年・FW/BK・カテゴリー）とポジション・カテゴリー表示の部品
// 「選手一覧」と「選手管理」で共通で使う

import { CATEGORIES, GRADES, nextCategory, unitOfPosition } from "@/lib/calc";
import type { Category, Member, Unit } from "@/lib/types";

export type Filter = { grade: number | null; unit: Unit | null; category?: Category | null };
export const NO_FILTER: Filter = { grade: null, unit: null, category: null };
export const isFiltered = (f: Filter) => f.grade != null || f.unit != null || f.category != null;

export const applyFilter = (ps: Member[], f: Filter) =>
  ps.filter(
    (m) =>
      (f.grade == null || m.grade === f.grade) &&
      (f.unit == null || unitOfPosition(m.position) === f.unit) &&
      (f.category == null || m.category === f.category),
  );

const GRADE_BUTTONS = [...GRADES].sort((a, b) => b - a); // 5年 → 1年

// withCategory：カテゴリーの絞り込みボタンも出す（選手一覧で使用）
export function FilterChips({ f, set, withCategory }: { f: Filter; set: (f: Filter) => void; withCategory?: boolean }) {
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
      {withCategory && (
        <>
          <span className="chip-sep" />
          <button className={f.category == null ? "on" : ""} onClick={() => set({ ...f, category: null })}>
            全カテゴリー
          </button>
          {CATEGORIES.map((c) => (
            <button key={c} className={f.category === c ? "on" : ""} onClick={() => set({ ...f, category: c })}>
              {c}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

// FW / BK の色付きバッジ
export function UnitBadge({ m }: { m: Member }) {
  const u = unitOfPosition(m.position);
  if (!u) return <span className="muted">—</span>;
  return <span className={`chip ${u === "FW" ? "fw" : "bk"}`}>{u}</span>;
}

// カテゴリーのバッジボタン（タップで 未設定 → レギュラー → ベンチ → ベンチ外 → 未設定）
const CAT_CLASS: Record<Category, string> = { レギュラー: "reg", ベンチ: "bench", ベンチ外: "out" };
export function CategoryButton({ m, onChange }: { m: Member; onChange: (c: Category | null) => void }) {
  return (
    <button
      type="button"
      className={`catbtn ${m.category ? CAT_CLASS[m.category] : "none"}`}
      onClick={(e) => {
        e.stopPropagation(); // 行のタップ（推移グラフ表示）と区別
        onChange(nextCategory(m.category));
      }}
      aria-label={`カテゴリー：${m.category ?? "未設定"}（タップで切り替え）`}
    >
      {m.category ?? "—"}
    </button>
  );
}
