"use client";

// 選手一覧（チームダッシュボード下部）
//  ・左の「名前・学年・ポジション」は横にスクロールしても固定
//  ・見出しはカテゴリごとに色分け（基本情報 / 体組成指標 / 出欠・筋トレ / フィジカル指標）
//  ・学年の絞り込み、全データのCSVダウンロード
//  ・項目設定で追加した項目は自動で列に追加される

import { useState } from "react";
import type { Ctx } from "./Shared";
import { GRADES, LIFTS, attendRate, bodyComp, fmt0, fmt1, fmt2, maxes, metricBest, metricLatest, playersOf, today, trainingAvg } from "@/lib/calc";
import type { Member } from "@/lib/types";

type Group = "body" | "attend" | "phys";
type Col = { key: string; group: Group; label: string; unit: string; get: (m: Member) => number | null; fmt: (v: number | null) => string };

const GROUP_LABEL: Record<Group, string> = { body: "体組成指標", attend: "出欠・筋トレ", phys: "フィジカル指標" };

// 表示する列（項目設定の内容から組み立てる）
function buildCols(ctx: Ctx): Col[] {
  const body = ctx.metrics.filter((x) => x.category === "体組成");
  const physDefs = ctx.metrics.filter((x) => x.category === "フィジカル");
  const bc = (m: Member) => bodyComp(m, ctx.metrics);
  return [
    { key: "weight", group: "body", label: "体重", unit: "kg", get: (m) => bc(m).weight, fmt: fmt1 },
    ...body.map((d): Col => ({ key: "m" + d.id, group: "body", label: d.name, unit: d.unit, get: (m) => metricLatest(m, d.id)?.v ?? null, fmt: fmt2 })),
    { key: "bmi", group: "body", label: "BMI", unit: "", get: (m) => bc(m).bmi, fmt: fmt1 },
    { key: "lbm", group: "body", label: "LBM", unit: "kg", get: (m) => bc(m).lbm, fmt: fmt1 },
    { key: "ffmi", group: "body", label: "FFMI", unit: "", get: (m) => bc(m).ffmi, fmt: fmt1 },
    { key: "att", group: "attend", label: "出席率(30日)", unit: "%", get: (m) => attendRate(m, 30), fmt: (v) => (v == null ? "—" : String(Math.round(v))) },
    { key: "train", group: "attend", label: "筋トレ(4週平均)", unit: "/10", get: (m) => trainingAvg(m, 4), fmt: fmt1 },
    ...LIFTS.map(([k, l]): Col => ({ key: k, group: "phys", label: l, unit: "kg", get: (m) => maxes(m)[k], fmt: fmt0 })),
    { key: "total", group: "phys", label: "Big3合計", unit: "kg", get: (m) => maxes(m).total, fmt: fmt0 },
    ...physDefs.map((d): Col => ({ key: "m" + d.id, group: "phys", label: d.name, unit: d.unit, get: (m) => metricBest(m, d), fmt: fmt2 })),
  ];
}

// CSVの1セル（カンマや改行を含む場合は "" で囲む）
const cell = (v: string | number | null) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default function PlayerTable({ ctx }: { ctx: Ctx }) {
  const [grade, setGrade] = useState<number | null>(null);
  const all = playersOf(ctx.members);
  const rows = grade == null ? all : all.filter((m) => m.grade === grade);
  const cols = buildCols(ctx);
  const groups = (["body", "attend", "phys"] as Group[]).map((g) => ({ g, n: cols.filter((c) => c.group === g).length }));

  // 全選手・全項目をCSVで保存（Excelで文字化けしないよう先頭にBOMを付ける）
  const downloadCsv = () => {
    const head = ["名前", "学年", "ポジション", ...cols.map((c) => `${c.label}${c.unit ? `(${c.unit})` : ""}`)];
    const body = all.map((m) => [
      m.name,
      m.grade ? `${m.grade}年` : "",
      m.position ?? "",
      ...cols.map((c) => {
        const v = c.get(m);
        return v == null ? "" : c.fmt(v);
      }),
    ]);
    const csv = "﻿" + [head, ...body].map((r) => r.map(cell).join(",")).join("\r\n");
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
          <div className="chips" style={{ margin: 0 }}>
            <button className={grade == null ? "on" : ""} onClick={() => setGrade(null)}>
              全学年
            </button>
            {GRADES.map((g) => (
              <button key={g} className={grade === g ? "on" : ""} onClick={() => setGrade(g)}>
                {g}年
              </button>
            ))}
          </div>
          <button className="btn ghost small" onClick={downloadCsv}>
            全データCSV
          </button>
        </div>
      </div>

      <div className="pt-wrap">
        <table className="pt">
          <thead>
            <tr>
              <th colSpan={3} className="g-basic s-all">
                基本情報
              </th>
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
              <th className="s2 g-basic">学年</th>
              <th className="s3 g-basic">ポジション</th>
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
                <td className="s2">{m.grade ? `${m.grade}年` : "—"}</td>
                <td className="s3">{m.position ?? "—"}</td>
                {cols.map((c) => (
                  <td key={c.key} className="num">
                    {c.fmt(c.get(m))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty">該当する選手がいません</div>}
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        体組成は最新値、フィジカルは自己ベストです。名前をタップすると推移グラフを表示します。表示する項目は「項目設定」で追加・変更できます。
      </p>
    </div>
  );
}
