"use client";

// 選手・コーチ共通で使う部品（ランキング、選手詳細、トースト通知）

import LineChart from "./LineChart";
import { PhysicalDetail } from "./PlayerHome";
import { useState, type ReactNode } from "react";
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
  weekStart,
  today,
  MENUS,
  menuLabel,
  MENU_TIMES,
  CRITERIA_KEY,
  DEFAULT_MENU,
  type RankRow,
  fmt1,
  latestWeight,
  md,
  weights,
  fmtMetric,
  fmtMinSec,
  isMinSec,
} from "@/lib/calc";
import type { Category, Menu, Member, MetricDef, Members, Practice, WeekSetting } from "@/lib/types";

export type View = "home" | "input" | "team" | "settings" | "manage" | "schedule" | "ob";

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

// 選手の詳細（コーチが選手をタップしたときに表示）
// 色は選手画面と同じ：出席率＝緑、体組成（体重）＝青、フィジカル＝赤、筋トレ遂行率＝黄土
// フィジカルは選手画面と同じ部品（種目プルダウン・自己ベスト/最新値・推移）を、この選手の記録で表示
export function PlayerModal({ m, ctx, onClose }: { m: Member; ctx: Ctx; onClose: () => void }) {
  const weeks = recentWeeks(8);
  const sw = summaryWeek(m.training);
  // グラフの期間（見出し右の2択ピル）：体重＝直近60日 / 全期間、筋トレ遂行率＝直近8週 / 全期間
  const [wAll, setWAll] = useState(false);
  const [tAll, setTAll] = useState(false);
  const tWeeks = tAll ? Object.keys(m.training).sort() : weeks;
  const menuOf = (w: string): Menu => ctx.weeks[w]?.menu ?? DEFAULT_MENU;
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
            {/* 大きな数字＝トータル（全期間）。下の1行に直近30日とトータル */}
            <div className="l">出席率 トータル</div>
            <div className="v num">
              {r == null ? "—" : Math.round(r)}
              <small>%</small>
            </div>
            <div className="s">
              直近30日 {r30 == null ? "—" : Math.round(r30) + "%"}・トータル {r == null ? "—" : Math.round(r) + "%"}
            </div>
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
              体重の推移
              <RangePill all={wAll} setAll={setWAll} recent="直近60日" />
            </h3>
            <LineChart pts={weights(m, wAll ? undefined : 60)} color={THEME.body} unit="kg" note={(d) => timingText(m.daily[d])} />
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
              筋トレ遂行率 <small>0〜10</small>
              <CriteriaButton ctx={ctx} />
              <RangePill all={tAll} setAll={setTAll} recent="直近8週" />
            </h3>
            <LineChart
              pts={tWeeks.filter((w) => m.training[w] != null).map((w) => ({ d: w, v: m.training[w] }))}
              h={120}
              color={THEME.training}
              unit="/ 10"
              note={(w) => `メニュー ${menuLabel(menuOf(w))}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// 筋トレ遂行率の「評価基準」ボタン（選手画面・コーチ画面で共通）
//  押すと、メニューごと（A〜B / A〜C / A〜D）の評価基準（項目設定で入力した文）を一覧で表示。今週のメニューに「今週」
export function CriteriaButton({ ctx }: { ctx: Ctx }) {
  const [open, setOpen] = useState(false);
  const cur: Menu = ctx.weeks[weekStart(today())]?.menu ?? DEFAULT_MENU;
  return (
    <>
      <button className="crit-btn" onClick={() => setOpen(true)}>
        <span aria-hidden>?</span> 評価基準
      </button>
      {open && (
        <Sheet title="筋トレ遂行率の評価基準" onClose={() => setOpen(false)}>
          <p className="muted" style={{ marginBottom: 10, lineHeight: 1.7 }}>
            1週間（月曜〜日曜）ごとに 0〜10 で評価します。その週のメニューは「日程調整」で決まります（未設定の週は A〜C）。
          </p>
          {MENUS.map((x) => (
            <div key={x} className={`crit-item ${x === cur ? "cur" : ""}`}>
              <div className="crit-item-h">
                <b>
                  {menuLabel(x)}（{MENU_TIMES[x]}）
                </b>
                {x === cur && <span className="crit-now">今週</span>}
              </div>
              <p className="crit-text">{ctx.settings[CRITERIA_KEY[x]] || "まだ設定されていません（コーチが「項目設定」から入力できます）"}</p>
            </div>
          ))}
        </Sheet>
      )}
    </>
  );
}

// グラフの期間の2択ピル（直近 / 全期間）。見出しの右側に置く
export function RangePill({ all, setAll, recent }: { all: boolean; setAll: (v: boolean) => void; recent: string }) {
  return (
    <span className="range-pill">
      <button className={!all ? "on" : ""} onClick={() => setAll(false)}>
        {recent}
      </button>
      <button className={all ? "on" : ""} onClick={() => setAll(true)}>
        全期間
      </button>
    </span>
  );
}

// テーマカラー（出欠＝緑・筋トレ＝黄土・体組成＝青・フィジカル＝赤）
const THEME = { attend: "#1f8a5b", training: "#a96a00", body: "#2563a8", physical: "#e8432b" };

// チームランキング一覧（選手画面・コーチ画面で共通）
//  1位は王冠（👑）・金の枠で一番大きく、2位（銀）→ 3位（銅）→ 4位以下と段階的に小さく
//  選手が見るときは自分の行を色付き＋「あなた」。コーチが見るときは行をタップでその選手の詳細
// sub：名前の横に小さく添える情報（OB画面の引退年度・ポジションなど）
export function TeamRanking({ ctx, rows, fmtV, sub }: { ctx: Ctx; rows: RankRow[]; fmtV: (r: RankRow) => ReactNode; sub?: (r: RankRow) => ReactNode }) {
  if (!rows.length) return <div className="empty">まだ記録がありません</div>;
  const coach = ctx.me.role === "coach";
  return (
    <ol className="trank">
      {rows.map((r, i) => {
        const tier = i < 3 ? `t${i + 1}` : "tn";
        const me = !coach && r.id === ctx.me.id;
        return (
          <li key={r.id} className={`${tier} ${me ? "me" : ""} ${coach ? "click" : ""}`} onClick={coach ? () => ctx.openPlayer(r.id) : undefined}>
            <span className="tp num">{i === 0 ? "👑" : i + 1}</span>
            {/* 名前だけを「…」で省略し、「あなた」は縮めない */}
            <span className="tn-name">
              <span className="tn-txt">{r.name}</span>
              {me && <em className="you">あなた</em>}
              {sub && <small className="tn-sub">{sub(r)}</small>}
            </span>
            <span className="tv num">{fmtV(r)}</span>
          </li>
        );
      })}
    </ol>
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
