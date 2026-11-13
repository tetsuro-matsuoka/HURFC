// アプリ全体で使うデータの型（要件定義書 4章のデータ構造に対応）

export type Role = "player" | "coach";
export type Attendance = "出席" | "欠席";
export type Position = "フロント" | "バックロー" | "バックス";

// 日次データ（DailyRecords）
export type DailyRec = { attendance: Attendance | null; weight: number | null };

// フィジカルデータ（PhysicalRecords）
export type PhysRec = { bench_press: number | null; squat: number | null; deadlift: number | null };

// 画面で扱いやすいように、1人分のデータをまとめた形
export type Member = {
  id: string;
  name: string;
  role: Role;
  grade: number | null; // 学年（1〜6）
  position: Position | null; // ポジション
  sort_order: number | null; // 一覧での並び順（小さいほど上）
  daily: Record<string, DailyRec>; // キーは日付 "YYYY-MM-DD"
  physical: Record<string, PhysRec>;
};

export type Members = Record<string, Member>;

export type LiftKey = "bench_press" | "squat" | "deadlift";
export type MetricKey = LiftKey | "total" | "ratio";
