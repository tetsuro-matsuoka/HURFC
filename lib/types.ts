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
  metrics: Record<number, Record<string, number>>; // 測定項目ごとの記録 { 項目ID: { 日付: 数値 } }
  training: Record<string, number>; // 筋トレ遂行度 { 週の月曜日: 0〜10 }
};

// 測定項目（コーチが「項目設定」で追加・変更・削除できる）
export type MetricCategory = "体組成" | "フィジカル";
export type MetricDef = {
  id: number;
  key: string | null; // weight=体重 / bench_press・squat・deadlift / big3_total（今までの入力欄の値を使う項目の目印）
  name: string;
  unit: string;
  category: MetricCategory;
  better: "high" | "low"; // 大きいほど良い / 小さいほど良い
  sort_order: number;
};

export type Members = Record<string, Member>;

export type LiftKey = "bench_press" | "squat" | "deadlift";
export type MetricKey = LiftKey | "total" | "ratio";
