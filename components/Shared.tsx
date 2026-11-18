"use client";

// 選手・コーチ共通で使う部品（ランキング、選手詳細、トースト通知）

import LineChart from "./LineChart";
import { PhysicalDetail } from "./PlayerHome";
import type { ReactNode } from "react";
import {
  attendRate,
  isLinked,
  metricsOf,
  unitOf,
  weightNote,
  timingText,
  metricSeries,
  recentWeeks,
  summaryWeek,
  weekShort,
  type RankRow,
  fmt1,
  latestWeight,
  md,
  weights,
  fmtMetric,
  fmtMinSec,
  isMinSec,
} from "@/lib/calc";
import type { Category, Member, MetricDef, Members, Practice, WeekSetting } from "@/lib/types";

export type View = "home" | "input" | "team" | "settings" | "manage" | "schedule";

// 画面どうしで受け渡す共通の情報
export type Ctx = {
  members: Members;
  metrics: MetricDef[]; // 測定項目（項目設定）
  settings: Record<string, string>; // 設定（筋トレ評価基準の説明文など）
  practice: Practice; // 練習日（日程調整）
  togglePractice: (date: string) => Promise<void>; // 練習日の ON / OFF（コーチのみ）
  weeks: Record<string, WeekSetting>; // 週ごとの設定（練習日数・筋トレメニュー構成）
  setWeek: (weekStart: string, v: WeekSetting) => Promise<void>; // 週ごとの設定の変更（コーチのみ）
  setCategory: (id: string, category: Category | null) => Promise<void>; // 選手のカテゴリー変更（コーチのみ）
  me: Member;
  readOnly: boolean;
  reload: () => Promise<void>;
  toast: (msg: string, pr?: boolean) => void;
  openPlayer: (id: string) => void;
  go: (v: View) => void;
};

// ランキングの行（『フィジカル』画面でも使用）
export function RankRows({ ctx, rows, fmtV, low }: { ctx: Ctx; rows: RankRow[]; fmtV: (r: RankRow) => ReactNode; low?: boolean }) {
  if (!rows.length) return <div className="empty">測定データがありません</div>;
  const top = rows[0].v;
  const coach = ctx.me.role === "coach";
  return (
    <>
      {rows.map((r, i) => (
        <div
          key={r.id}
          className={`rk ${r.id === ctx.me.id ? "me" : ""}`}
          style={coach ? { cursor: "pointer" } : undefined}
          onClick={coach ? () => ctx.openPlayer(r.id) : undefined}
        >
          <div className={`pos ${i < 3 ? "p" + (i + 1) : ""}`}>{i + 1}</div>
          <div className="nm">
            <b>{r.name}</b>
            <div className="bar">
              {/* 小さいほど良い項目は、1位を100%として逆比で表示 */}
              <i style={{ width: `${(Math.min(1, low ? top / r.v : r.v / top) * 100).toFixed(1)}%` }} />
            </div>
          </div>
          <div className="v num">{fmtV(r)}</div>
        </div>
      ))}
    </>
  );
}

// 選手の詳細（コーチが選手をタップしたときに表示）
// 色は選手画面と同じ：出席率＝緑、体組成（体重）＝青、フィジカル＝赤、筋トレ遂行率＝黄土
// フィジカルは選手画面と同じ部品（種目プルダウン・自己ベスト/最新値・推移）を、この選手の記録で表示
export function PlayerModal({ m, ctx, onClose }: { m: Member; ctx: Ctx; onClose: () => void }) {
  const weeks = recentWeeks(8);
  const sw = summaryWeek(m.training);
  const lw = latestWeight(m),
    r = attendRate(m, ctx.practice),
    r30 = attendRate(m, ctx.practice, 30);
  // この選手を「自分」として扱う ctx（フィジカルの部品をそのまま使うため）
  const pctx: Ctx = { ...ctx, me: m };
  // 体重以外の体組成の項目（体脂肪率など）
  const bodyDefs = metricsOf(ctx.metrics, "体組成").filter((def) => !isLinked(def));
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="hd">
          <h2>{m.name}</h2>
          <button className="x" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>
        <div className="kpis kpis3">
          <div className="kpi c-attend">
            <div className="l">出席率</div>
            <div className="v num">
              {r == null ? "—" : Math.round(r)}
              <small>%</small>
            </div>
            <div className="s">直近30日 {r30 == null ? "—" : Math.round(r30) + "%"}</div>
          </div>
          <div className="kpi c-body">
            <div className="l">最新体重</div>
            <div className="v num">
              {lw ? fmt1(lw.v) : "—"}
              <small>kg</small>
            </div>
            <div className="s">{lw ? `${md(lw.d)}${weightNote(m.daily[lw.d])}` : ""}</div>
          </div>
          {/* 筋トレ遂行率：直近で終わった週（前週）。選手画面・ダッシュボードと同じ週 */}
          <div className="kpi c-training">
            <div className="l">筋トレ遂行率</div>
            <div className="v num">
              {m.training[sw] == null ? "—" : fmt1(m.training[sw])}
              <small>/ 10</small>
            </div>
            <div className="s">{weekShort(sw)}</div>
          </div>
        </div>
        <div className="panel-body">
          <div className="card">
            <h3 className="c-h">
              体重の推移 <small>直近60日</small>
            </h3>
            <LineChart pts={weights(m, 60)} color={THEME.body} unit="kg" note={(d) => timingText(m.daily[d])} />
          </div>
          {bodyDefs.map((def) => {
            const s = metricSeries(m, def);
            if (!s.length) return null;
            return (
              <div className="card" key={def.id}>
                <h3 className="c-h">
                  {def.name}{" "}
                  <small>
                    最新 {fmtMetric(def, s[s.length - 1].v)}
                    {unitOf(def)}（{md(s[s.length - 1].d)}）
                  </small>
                </h3>
                <LineChart pts={s} h={120} color={THEME.body} unit={unitOf(def)} fmt={isMinSec(def) ? fmtMinSec : undefined} />
              </div>
            );
          })}
        </div>
        <div className="panel-physical">
          <PhysicalDetail ctx={pctx} topOnly />
        </div>
        <div className="panel-training">
          <div className="card">
            <h3 className="c-h">
              筋トレ遂行率 <small>直近8週（0〜10）</small>
            </h3>
            <LineChart
              pts={weeks.filter((w) => m.training[w] != null).map((w) => ({ d: w, v: m.training[w] }))}
              h={120}
              color={THEME.training}
              unit="/ 10"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// テーマカラー（出欠＝緑・筋トレ＝黄土・体組成＝青・フィジカル＝赤）
const THEME = { attend: "#1f8a5b", training: "#a96a00", body: "#2563a8", physical: "#e8432b" };

// 確認ダイアログ・入力ダイアログ用の外枠
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" style={{ maxWidth: 420 }}>
        <div className="hd">
          <h2>{title}</h2>
          <button className="x" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
