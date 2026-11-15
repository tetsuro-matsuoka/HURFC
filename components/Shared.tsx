"use client";

// 選手・コーチ共通で使う部品（ランキング、選手詳細、トースト通知）

import LineChart from "./LineChart";
import type { ReactNode } from "react";
import {
  LIFTS,
  attendRate,
  isLinked,
  unitOf,
  fmtRatio,
  weightAt,
  weightNote,
  timingText,
  fmt2,
  metricSeries,
  recentWeeks,
  type RankRow,
  fmt0,
  fmt1,
  latestWeight,
  maxes,
  md,
  phys,
  rowTotal,
  weights,
} from "@/lib/calc";
import type { Category, Member, MetricDef, Members, Practice } from "@/lib/types";

export type View = "home" | "input" | "team" | "settings" | "manage" | "schedule";

// 画面どうしで受け渡す共通の情報
export type Ctx = {
  members: Members;
  metrics: MetricDef[]; // 測定項目（項目設定）
  settings: Record<string, string>; // 設定（筋トレ評価基準の説明文など）
  practice: Practice; // 練習日（日程調整）
  togglePractice: (date: string) => Promise<void>; // 練習日の ON / OFF（コーチのみ）
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
export function PlayerModal({ m, metrics, practice, onClose }: { m: Member; metrics: MetricDef[]; practice: Practice; onClose: () => void }) {
  const weeks = recentWeeks(8);
  const x = maxes(m),
    p = phys(m),
    lw = latestWeight(m),
    r = attendRate(m, practice),
    r30 = attendRate(m, practice, 30);
  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="hd">
          <h2>{m.name}</h2>
          <button className="x" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>
        <div className="kpis">
          <div className="kpi">
            <div className="l">出席率</div>
            <div className="v num">
              {r == null ? "—" : Math.round(r)}
              <small>%</small>
            </div>
            <div className="s">直近30日 {r30 == null ? "—" : Math.round(r30) + "%"}</div>
          </div>
          <div className="kpi">
            <div className="l">最新体重</div>
            <div className="v num">
              {lw ? fmt1(lw.v) : "—"}
              <small>kg</small>
            </div>
            <div className="s">{lw ? `${md(lw.d)}${weightNote(m.daily[lw.d])}` : ""}</div>
          </div>
        </div>
        <div className="card">
          <h3>
            体重の推移 <small>直近60日</small>
          </h3>
          <LineChart pts={weights(m, 60)} color="var(--navy)" unit="kg" note={(d) => timingText(m.daily[d])} />
        </div>
        <div className="card">
          <h3>Big3 自己ベスト</h3>
          <div className="big3">
            {LIFTS.map(([k, l]) => (
              <div className="lift" key={k}>
                <div className="l">{l}</div>
                <div className="v num">{fmt0(x[k])}</div>
              </div>
            ))}
          </div>
          <div className="total">
            <span className="muted">合計</span>
            <span className="v num">{fmt0(x.total)}</span>
          </div>
          {p.length >= 2 && (
            <>
              <h3 style={{ marginTop: 14 }}>Big3合計の推移</h3>
              <LineChart pts={p.map((r) => ({ d: r.d, v: rowTotal(r) }))} h={140} />
            </>
          )}
        </div>
        <div className="card">
          <h3>
            筋トレ遂行度 <small>直近8週（0〜10）</small>
          </h3>
          <LineChart
            pts={weeks.filter((w) => m.training[w] != null).map((w) => ({ d: w, v: m.training[w] }))}
            h={120}
            color="var(--ok)"
          />
        </div>
        {/* 体重比（相対値）の推移：項目設定で「体重比」が ON の項目。記録ごとに、その日の体重（なければそれ以前の最新）で割る */}
        {metrics
          .filter((def) => def.show_ratio && def.key !== "weight")
          .map((def) => {
            const s = metricSeries(m, def)
              .map((p) => {
                const w = weightAt(m, p.d);
                return w && p.v ? { d: p.d, v: p.v / w } : null;
              })
              .filter((p): p is { d: string; v: number } => p != null);
            if (!s.length) return null;
            return (
              <div className="card" key={"r" + def.id}>
                <h3>
                  {def.name}体重比の推移{" "}
                  <small>
                    最新 {fmtRatio(s[s.length - 1].v)}倍（{md(s[s.length - 1].d)}）
                  </small>
                </h3>
                <LineChart pts={s} h={120} color="var(--ok)" minRange={0.2} digits={2} />
              </div>
            );
          })}
        {/* 体重・Big3は上のグラフで表示しているので、ここではそれ以外の項目 */}
        {metrics.filter((def) => !isLinked(def)).map((def) => {
          const s = metricSeries(m, def);
          if (!s.length) return null;
          return (
            <div className="card" key={def.id}>
              <h3>
                {def.name}{" "}
                <small>
                  最新 {fmt2(s[s.length - 1].v)}
                  {unitOf(def)}（{md(s[s.length - 1].d)}）
                </small>
              </h3>
              <LineChart pts={s} h={120} color="var(--navy)" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
