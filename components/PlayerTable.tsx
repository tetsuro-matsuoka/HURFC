"use client";

// 選手一覧（チームダッシュボード下部）
//  ・左の「名前」は横にスクロールしても固定（学年・ポジションは一緒にスクロール）
//  ・見出しはカテゴリごとに色分け（基本情報 / 体組成指標 / 出欠・筋トレ / フィジカル指標）
//  ・学年・FW/BK の絞り込み、全データのCSVダウンロード
//  ・指標の列は「項目設定」に登録された項目だけ（並び順も項目設定どおり）

import { useState } from "react";
import type { Ctx } from "./Shared";
import { absenceSummary, monthAttendance, ymOf, fmt1, fmt2, metricBest, metricLatest, metricsOf, playersOf, today, trainingAvg, unitOf, unitOfPosition } from "@/lib/calc";
import { CategoryButton, FilterChips, NO_FILTER, UnitBadge, applyFilter, isFiltered, type Filter } from "./PlayerFilter";
import type { Member } from "@/lib/types";

type Group = "body" | "attend" | "phys";
type Col = { key: string; group: Group; label: string; unit: string; get: (m: Member) => number | null; fmt: (v: number | null) => string };

const GROUP_LABEL: Record<Group, string> = { body: "体組成指標", attend: "出欠・筋トレ", phys: "フィジカル指標" };

// 表示する列（項目設定の内容と並び順から組み立てる）
//  体組成：最新値 / フィジカル：自己ベスト / 出欠・筋トレ：アプリで集計
function buildCols(ctx: Ctx): Col[] {
  return [
    ...metricsOf(ctx.metrics, "体組成").map(
      (d): Col => ({ key: "m" + d.id, group: "body", label: d.name, unit: unitOf(d), get: (m) => metricLatest(m, d)?.v ?? null, fmt: fmt2 }),
    ),
    {
      key: "att",
      group: "attend",
      label: "出席率(今月)",
      unit: "%",
      // 今月の練習日ベース（練習日の出席日数÷今月の練習日数。今日より後の練習日は数えない）
      get: (m) => monthAttendance(m, ymOf(today()), ctx.practice).rate,
      fmt: (v) => (v == null ? "—" : String(Math.round(v))),
    },
    { key: "train", group: "attend", label: "筋トレ(4週平均)", unit: "/10", get: (m) => trainingAvg(m, 4), fmt: fmt1 },
    ...metricsOf(ctx.metrics, "フィジカル").map(
      (d): Col => ({ key: "m" + d.id, group: "phys", label: d.name, unit: unitOf(d), get: (m) => metricBest(m, d), fmt: fmt2 }),
    ),
  ];
}

// 平均（未入力の選手は分母から除く。全員未入力なら null）
function average(ms: Member[], c: Col): number | null {
  const v = ms.map((m) => c.get(m)).filter((x): x is number => x != null && !isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

// CSVの1セル（カンマや改行を含む場合は "" で囲む）
const cell = (v: string | number | null) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default function PlayerTable({ ctx }: { ctx: Ctx }) {
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const all = playersOf(ctx.members);
  const rows = applyFilter(all, filter);
  const cols = buildCols(ctx);
  const filtered = isFiltered(filter);
  // 表示中の選手（絞り込み後）だけで平均を計算
  const avgLabel = filtered ? "選択中平均" : "チーム平均";
  // カテゴリー別の比較（レギュラー vs それ以外）。カテゴリーで絞り込んでいないときに、
  // 表示中の選手に1人でもカテゴリー設定があれば表示する
  const compare = (ms: Member[]) => [
    { key: "reg", label: "レギュラー平均", ms: ms.filter((m) => m.category === "レギュラー") },
    { key: "other", label: "その他平均", ms: ms.filter((m) => m.category !== "レギュラー") },
  ];
  const showCompare = filter.category == null && rows.some((m) => m.category != null);
  const groups = (["body", "attend", "phys"] as Group[]).map((g) => ({ g, n: cols.filter((c) => c.group === g).length }));

  // 全選手・全項目をCSVで保存（Excelで文字化けしないよう先頭にBOMを付ける）
  const downloadCsv = () => {
    const ym = ymOf(today());
    const head = ["名前", "学年", "ポジション", "FW/BK", "カテゴリー", ...cols.map((c) => `${c.label}${c.unit ? `(${c.unit})` : ""}`), "今月の欠席理由"];
    const body = all.map((m) => [
      m.name,
      m.grade ? `${m.grade}年` : "",
      m.position ?? "",
      unitOfPosition(m.position) ?? "",
      m.category ?? "",
      ...cols.map((c) => {
        const v = c.get(m);
        return v == null ? "" : c.fmt(v);
      }),
      // 例：「体調不良2・学校関連1」
      absenceSummary(m, ym + "-01", ym + "-31"),
    ]);
    // 最後の行：平均（CSVは全選手が対象なので、全選手の平均）。カテゴリー設定があれば、レギュラー・その他の平均も
    const avgRowOf = (label: string, ms: Member[]) => [
      label,
      "",
      "",
      "",
      "",
      ...cols.map((c) => {
        const v = average(ms, c);
        return v == null ? "" : fmt1(v);
      }),
      "",
    ];
    const avgRows = [
      avgRowOf("平均（全選手）", all),
      ...(all.some((m) => m.category != null)
        ? compare(all).map((x) => avgRowOf(`${x.label}（${x.ms.length}名）`, x.ms))
        : []),
    ];
    const csv = "﻿" + [head, ...body, ...avgRows].map((r) => r.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `選手一覧_${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card">
      <div className="pt-head">
        <h3 style={{ margin: 0 }}>
          選手一覧 <small>{rows.length}名</small>
        </h3>
        <div className="pt-tools">
          <FilterChips f={filter} set={setFilter} withCategory />
          <button className="btn ghost small" onClick={downloadCsv}>
            全データCSV
          </button>
        </div>
      </div>

      <div className="pt-wrap">
        <table className="pt">
          <thead>
            <tr>
              <th className="g-basic s1">基本情報</th>
              <th colSpan={4} className="g-basic" />
              {groups.map(
                ({ g, n }) =>
                  n > 0 && (
                    <th key={g} colSpan={n} className={`g-${g}`}>
                      {GROUP_LABEL[g]}
                    </th>
                  ),
              )}
            </tr>
            <tr>
              <th className="s1 g-basic">名前</th>
              <th className="g-basic l">学年</th>
              <th className="g-basic l">ポジション</th>
              <th className="g-basic l">FW/BK</th>
              <th className="g-basic l">カテゴリー</th>
              {cols.map((c) => (
                <th key={c.key} className={`g-${c.group}`}>
                  {c.label}
                  {c.unit && <small>({c.unit})</small>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} onClick={() => ctx.openPlayer(m.id)}>
                <td className="s1">
                  <b>{m.name}</b>
                </td>
                <td className="l">{m.grade ? `${m.grade}年` : "—"}</td>
                <td className="l">{m.position ?? "—"}</td>
                <td className="l">
                  <UnitBadge m={m} />
                </td>
                <td className="l">
                  <CategoryButton m={m} onChange={(c) => ctx.setCategory(m.id, c)} />
                </td>
                {cols.map((c) => (
                  <td key={c.key} className="num">
                    {c.fmt(c.get(m))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td className="s1">
                  <b>{avgLabel}</b>
                </td>
                <td className="l">—</td>
                <td className="l">—</td>
                <td className="l">—</td>
                <td className="l">—</td>
                {cols.map((c) => {
                  const v = average(rows, c);
                  return (
                    <td key={c.key} className="num">
                      {v == null ? "—" : fmt1(v)}
                    </td>
                  );
                })}
              </tr>
              {showCompare &&
                compare(rows).map((x) => (
                  <tr key={x.key} className={`cmp ${x.key}`}>
                    <td className="s1">
                      <b>{x.label}</b>
                    </td>
                    <td className="l" colSpan={4}>
                      {x.ms.length}名{x.key === "other" ? "（ベンチ・ベンチ外・未設定）" : ""}
                    </td>
                    {cols.map((c) => {
                      const v = average(x.ms, c);
                      return (
                        <td key={c.key} className="num">
                          {v == null ? "—" : fmt1(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tfoot>
          )}
        </table>
        {!rows.length && <div className="empty">該当する選手がいません</div>}
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        体組成は最新値、フィジカルは自己ベストです。一番下の「{avgLabel}」は、表示中の選手のうち数値が入っている人だけの平均です。
        カテゴリーはバッジをタップするたびに「— → レギュラー → ベンチ → ベンチ外 → —」と切り替わり、自動で保存されます。名前をタップすると推移グラフを表示します。表示する項目と並び順は「項目設定」で変更できます。
      </p>
    </div>
  );
}
