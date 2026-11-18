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
  playersOf,
  teamTrainingAvg,
  weekLabel,
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
  // 筋トレ遂行率のグラフでタップした週（下に評価基準のパネルを開く。null なら閉じている）
  const [critWeek, setCritWeek] = useState<string | null>(null);
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
              <RangePill all={tAll} setAll={setTAll} recent="直近8週" />
            </h3>
            <LineChart
              pts={tWeeks.filter((w) => m.training[w] != null).map((w) => ({ d: w, v: m.training[w] }))}
              h={120}
              color={THEME.training}
              unit="/ 10"
              note={(w) => `メニュー ${menuLabel(menuOf(w))}`}
              onPick={setCritWeek}
            />
            {/* タップした週の評価基準（普段は隠す。× で閉じる） */}
            {critWeek && <WeekCritPanel ctx={ctx} m={m} w={critWeek} onClose={() => setCritWeek(null)} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// 筋トレ遂行率：タップした週の詳細パネル（選手画面・コーチの選手詳細で共通）
//  その週の対象メニュー・自分の遂行率・チーム平均・評価基準（項目設定のそのメニュー用の文）。× で閉じる
export function WeekCritPanel({ ctx, m, w, onClose }: { ctx: Ctx; m: Member; w: string; onClose: () => void }) {
  const menu: Menu = ctx.weeks[w]?.menu ?? DEFAULT_MENU;
  const team = teamTrainingAvg(playersOf(ctx.members), w);
  return (
    <div className="crit-panel">
      <div className="crit-hd">
        <b>{weekLabel(w)}</b>
        <button className="x" onClick={onClose} aria-label="閉じる">
          ×
        </button>
      </div>
      <div className="crit-row">
        <span>対象メニュー</span>
        <b>
          {menuLabel(menu)}（{MENU_TIMES[menu]}）
        </b>
      </div>
      <div className="crit-row">
        <span>{ctx.me.id === m.id ? "自分の遂行率" : "この週の遂行率"}</span>
        <b className="num">{m.training[w] == null ? "未入力" : `${fmt1(m.training[w])} / 10`}</b>
      </div>
      <div className="crit-row">
        <span>チーム平均</span>
        <b className="num">{team == null ? "—" : `${fmt1(team)} / 10`}</b>
      </div>
      <div className="crit-l">評価基準（{menu}）</div>
      <p className="crit-text">{ctx.settings[CRITERIA_KEY[menu]] || "まだ設定されていません（「項目設定」から入力できます）"}</p>
    </div>
  );
}

// グラフの期間の2択ピル（直近 / 全期間）。見出しの右側に置く
function RangePill({ all, setAll, recent }: { all: boolean; setAll: (v: boolean) => void; recent: string }) {
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
