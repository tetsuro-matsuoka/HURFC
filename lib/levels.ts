// フィジカル評価基準（Lv.1〜Lv.5）とレーダーチャート用の計算
//  コーチが「項目設定」で種目ごとに Lv.1〜Lv.5 の基準値と、レーダーチャートに出すか（ON/OFF）を決める
//  保存先：app_settings の "phys_levels"（JSON）。全員が読める
//  種目のキー：通常の値は "m<項目ID>"、体重比は "r<項目ID>"（フィジカル画面の種目プルダウンと同じ）
//  大きいほど良い種目：値が Lv.n の基準「以上」なら Lv.n。小さいほど良い種目（タイム）：基準「以下」なら Lv.n
//  どの基準にも届かなければ Lv.0（記録がない種目も 0）

import { basisLabel, fmtMetric, fmtRatio, isMinSec, metricBest, metricLatest, metricRatio, metricsOf, weightAt } from "./calc";
import type { Member, MetricDef } from "./types";

export const LEVELS_KEY = "phys_levels";
export type LevelItem = { on: boolean; th: (number | null)[] }; // th：Lv.1〜Lv.5 の基準値（5つ）
export type LevelConfig = Record<string, LevelItem>;
export type LevelOption = { key: string; def: MetricDef; ratio: boolean; label: string; short: string; low: boolean };

// 設定を読む（壊れていれば空）
export function readLevels(settings: Record<string, string>): LevelConfig {
  try {
    const v = JSON.parse(settings[LEVELS_KEY] ?? "{}");
    return v && typeof v === "object" ? (v as LevelConfig) : {};
  } catch {
    return {};
  }
}

// 種目の一覧（項目設定の並び順。体重比が ON の項目は、すぐ後ろに体重比）
const SHORT: Record<string, string> = { squat: "SQ", bench_press: "BP", deadlift: "DL", big3_total: "Big3" };
export function levelOptions(metrics: MetricDef[]): LevelOption[] {
  return metricsOf(metrics, "フィジカル").flatMap((x) => {
    // チャートの頂点に出す名前（Big3 は SQ・BP・DL と短く。そのほかは正式名称）
    const s = SHORT[x.key ?? ""] ?? x.name;
    const o: LevelOption[] = [{ key: "m" + x.id, def: x, ratio: false, label: x.name + basisLabel(x), short: s, low: x.better === "low" }];
    if (x.show_ratio) o.push({ key: "r" + x.id, def: x, ratio: true, label: `${x.name}体重比`, short: `${s}体重比`, low: false });
    return o;
  });
}
// 初めて設定するときに ON にしておく種目（先頭から6つ）
export const defaultOn = (i: number) => i < 6;
export const itemOf = (cfg: LevelConfig, o: LevelOption, i: number): LevelItem => cfg[o.key] ?? { on: defaultOn(i), th: [null, null, null, null, null] };

// 選手の値（自己ベスト / 最新値）。体重比はその記録の日の体重で割る
export function optionValue(m: Member, o: LevelOption, mode: "best" | "latest"): number | null {
  if (mode === "best") return o.ratio ? metricRatio(m, o.def) : metricBest(m, o.def);
  const p = metricLatest(m, o.def);
  if (!p) return null;
  if (!o.ratio) return p.v;
  const w = weightAt(m, p.d);
  return w && p.v ? p.v / w : null;
}
// レベル（0〜5）
export function levelOf(v: number | null, it: LevelItem, low: boolean): number {
  if (v == null) return 0;
  let lv = 0;
  it.th.forEach((t, i) => {
    if (t != null && (low ? v <= t : v >= t)) lv = i + 1;
  });
  return lv;
}
export const hasAnyThreshold = (it: LevelItem) => it.th.some((t) => t != null);
// 値の表示（タイムは 分:秒、体重比は小数2桁）
export const fmtOption = (o: LevelOption, v: number | null) => (v == null ? "—" : o.ratio ? fmtRatio(v) : fmtMetric(o.def, v));
export const isTimeOption = (o: LevelOption) => !o.ratio && isMinSec(o.def);

// 名前を見やすい区切りで行に分ける（「スプリントモメンタム」→「スプリント」「モメンタム」。「スプリント」の後ろで改行）
//  ほかに長い名前は7文字ずつ。体重比は最後の行に付ける
export function splitLabel(name: string): string[] {
  return name
    .replace(/スプリント(?=\S)/g, "スプリント\n")
    .split("\n")
    .flatMap((part) => (part.length > 7 && part.endsWith("体重比") ? [part.slice(0, -3), "体重比"] : [part]))
    .flatMap((part) => {
      const out: string[] = [];
      for (let i = 0; i < part.length; i += 7) out.push(part.slice(i, i + 7));
      return out;
    });
}
