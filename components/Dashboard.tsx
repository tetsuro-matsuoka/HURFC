"use client";

// S04 チームダッシュボード（コーチ用ホーム）
//  上部：4つのメニュー（出欠席率 / 筋トレ遂行率 / 体組成 / フィジカル）。押すと詳細が開く
//  下部：選手一覧（PlayerTable.tsx）。4つのどれも選んでいないとき（トップ）だけ表示
//  選択中のボタンをもう一度押す（または下部メニューの「チーム」）とトップに戻る

import { useState } from "react";
import type { ReactNode } from "react";
import LineChart from "./LineChart";
import PlayerTable from "./PlayerTable";
import BodyPanel from "./BodyPanel";
import PhysicalPanel from "./PhysicalPanel";
import { GROUPS, MonthBar, avg as avgOf, splitGroups } from "./GroupStats";
import { CriteriaButton, RangePill, type Ctx } from "./Shared";
import {
  addDays,
  addMonths,
  fmt0,
  fmt1,
  latestWeight,
  maxes,
  md,
  monthAttendance,
  absenceSummary,
  dayKind,
  dayType,
  practiceCount,
  playersOf,
  doneWeeks,
  teamDoneWeeksAll,
  teamTrainingAvg,
  teamSummaryWeek,
  absenceCounts,
  absenceByType,
  DAY_TYPES,
  attendStats,
  today,
  trainingAvg,
  trainingMonthAvg,
  weekLabel,
  weekShort,
  DEFAULT_MENU,
  menuLabel,
  wd,
  ymLabel,
  ymOf,
} from "@/lib/calc";
import type { DayType, Member, Practice } from "@/lib/types";

type Panel = "attend" | "training" | "body" | "physical";

const avg = (v: (number | null)[]) => {
  const x = v.filter((n): n is number => n != null);
  return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null;
};

// 前後に切り替えるバー（‹ ラベル ›）
function Stepper({ label, onPrev, onNext, nextDisabled }: { label: ReactNode; onPrev: () => void; onNext: () => void; nextDisabled: boolean }) {
  return (
    <div className="datebar">
      <button onClick={onPrev} aria-label="前へ">
        ‹
      </button>
      <b style={{ flex: 1, textAlign: "center" }}>{label}</b>
      <button onClick={onNext} disabled={nextDisabled} style={nextDisabled ? { opacity: 0.3 } : undefined} aria-label="次へ">
        ›
      </button>
    </div>
  );
}

export function TeamScreen({ ctx }: { ctx: Ctx }) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const ps = playersOf(ctx.members);
  const t = today();

  // ボタンに出す概要
  const todayYes = ps.filter((m) => m.daily[t]?.attendance === "出席").length;
  const todayOff = dayKind(t, ctx.practice) === "off";
  const sw = teamSummaryWeek(ps, t); // 直近で終わった週（前週）
  const weekAvg = teamTrainingAvg(ps, sw);
  const wAvg = avg(ps.map((m) => latestWeight(m)?.v ?? null));
  const bigAvg = avg(ps.map((m) => maxes(m).total));

  const menus: [Panel, string, string][] = [
    ["attend", "出欠席率", todayOff ? "今日はオフ（練習日ではありません）" : `今日 出席 ${todayYes}/${ps.length}名`],
    ["training", "筋トレ遂行率", `${weekShort(sw)} 平均 ${weekAvg == null ? "—" : fmt1(weekAvg)} / 10`],
    ["body", "体組成", `平均体重 ${wAvg == null ? "—" : fmt1(wAvg) + "kg"}`],
    ["physical", "フィジカル", `Big3合計 平均 ${bigAvg == null ? "—" : fmt0(bigAvg) + "kg"}`],
  ];

  return (
    <>
      <h2 className="page">チームダッシュボード</h2>
      <div className="menu4">
        {menus.map(([k, l, sub]) => (
          <button key={k} className={`m-${k} ${panel === k ? "on" : ""}`} onClick={() => setPanel(panel === k ? null : k)} aria-pressed={panel === k}>
            <b>{l}</b>
            <span>{sub}</span>
          </button>
        ))}
      </div>

      {/* 詳細のカードの上辺に、選んでいるボタンと同じ色の線（出欠＝緑・筋トレ＝黄土・体組成＝青・フィジカル＝赤） */}
      {panel && (
        <div className={`panel-${panel}`}>
          {panel === "attend" && <AttendPanel ctx={ctx} ps={ps} />}
          {panel === "training" && <TrainingPanel ctx={ctx} ps={ps} />}
          {panel === "body" && <BodyPanel ctx={ctx} ps={ps} />}
          {panel === "physical" && <PhysicalPanel ctx={ctx} ps={ps} />}
        </div>
      )}

      {/* 4つのボタンをどれも選んでいないとき（トップ）だけ表示 */}
      {!panel && <PlayerTable ctx={ctx} />}
    </>
  );
}

/* ---------- 出欠席率 ---------- */
function AttendPanel({ ctx, ps }: { ctx: Ctx; ps: Member[] }) {
  const [d, setD] = useState(today());
  const [ym, setYm] = useState(ymOf(today()));
  const kind = dayKind(d, ctx.practice);
  // その日より後に登録した選手は数えない
  const rows = ps.filter((m) => m.joined <= d).map((m, i) => ({ m, r: m.daily[d], i }));
  const yes = rows.filter((x) => x.r?.attendance === "出席").length;
  const no = rows.filter((x) => x.r?.attendance === "欠席").length;
  const none = rows.length - yes - no;
  // 未入力 → 欠席 → 出席 の順（確認が必要な人を上に）。同じ状態の中は選手管理の並び順
  const order = (x: (typeof rows)[number]) => (!x.r ? 2 : x.r.attendance === "欠席" ? 1 : 0);
  const sorted = [...rows].sort((a, b) => order(b) - order(a) || a.i - b.i);

  // 練習日ベースの月間集計（今日より後の練習日はまだ数えない）
  const month = ps.map((m) => ({ m, ...monthAttendance(m, ym, ctx.practice) }));
  const tYes = month.reduce((a, x) => a + x.yes, 0),
    tNo = month.reduce((a, x) => a + x.no, 0),
    tNone = month.reduce((a, x) => a + x.none, 0),
    tDays = month.reduce((a, x) => a + x.days, 0);
  const pCount = practiceCount(ctx.practice, ym);
  const pct = (v: number | null) => (v == null ? "—" : Math.round(v) + "%");
  // トータル（全期間）：分母＝今日までに開催した練習日数 × 今の登録選手数、分子＝その練習日の出席の延べ回数
  //   練習日を1日も設定していないときだけ、今までどおり出欠を記録した日をもとに計算
  const t = today();
  const held = [...ctx.practice.days].filter((x) => x <= t);
  let aYes: number, aDays: number, aNote: string;
  if (held.length) {
    aYes = ps.reduce((a, m) => a + held.filter((x) => m.daily[x]?.attendance === "出席").length, 0);
    aDays = held.length * ps.length;
    aNote = `出席 ${aYes} / 対象 ${aDays}回（活動日${held.length}回 × ${ps.length}名）`;
  } else {
    const all = ps.map((m) => attendStats(m, ctx.practice, "0000-01-01", t));
    aYes = all.reduce((a, x) => a + x.yes, 0);
    aDays = all.reduce((a, x) => a + x.days, 0);
    aNote = `出席 ${aYes} / 対象 ${aDays}回（練習日が未設定のため記録した日で計算）`;
  }

  return (
    <>
    {/* 1. 一番上：トータル（全期間）。左に出席率を大きく、右に欠席理由統計（全期間）のボタン */}
    <div className="card">
      <div className="att-total">
        <div className="att-total-main">
          <div className="l">トータル出席率 <small>全期間・チーム全体</small></div>
          <div className="v num">
            {aDays ? Math.round((aYes / aDays) * 100) : "—"}
            <small>%</small>
          </div>
          <div className="s">{aNote}</div>
        </div>
        <AbsenceButton ps={ps} practice={ctx.practice} from={null} to={t} title="欠席理由統計（全期間）" />
      </div>
    </div>
    {/* 2. 中段：当日の出欠状況 */}
      <div className="card">
        <h3>当日の出欠状況</h3>
        <div className="datebar">
          <button onClick={() => setD(addDays(d, -1))} aria-label="前の日">
            ‹
          </button>
          <input type="date" value={d} max={today()} onChange={(e) => e.target.value && setD(e.target.value > today() ? today() : e.target.value)} />
          <button onClick={() => d < today() && setD(addDays(d, 1))} disabled={d >= today()} style={d >= today() ? { opacity: 0.3 } : undefined} aria-label="次の日">
            ›
          </button>
          <span className="muted">
            {wd(d)}曜日{d === today() ? "（今日）" : ""}
          </span>
          {kind !== "unset" && <span className={`daytag ${kind}`}>{kind === "practice" ? `${dayType(d, ctx.practice)}日` : "オフ"}</span>}
        </div>
        {kind === "off" && (
          <p className="muted" style={{ marginBottom: 10 }}>
            この日は練習日ではありません（オフ）。出欠席率の計算には含めません。
          </p>
        )}
        {/* 出席・欠席・未入力・出席率の4つを同じ大きさで横並び。出席率＝その日の出席人数 ÷ その日の対象選手数 */}
        <div className="sumrow sumrow4">
          <div style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>
            <div className="v num">{yes}</div>
            <div className="l">出席</div>
          </div>
          <div style={{ background: "var(--ng-soft)", color: "var(--ng)" }}>
            <div className="v num">{no}</div>
            <div className="l">欠席</div>
          </div>
          <div style={{ background: "var(--bg)", color: "var(--sub)" }}>
            <div className="v num">{kind === "off" ? "—" : none}</div>
            <div className="l">未入力</div>
          </div>
          <div className="rate">
            <div className="v num">
              {kind === "off" || !rows.length ? "—" : Math.round((yes / rows.length) * 100)}
              {kind !== "off" && rows.length > 0 && <small>%</small>}
            </div>
            <div className="l">出席率</div>
          </div>
        </div>
        {rows.length ? (
          <table className="tbl">
            <tbody>
              {sorted.map((x) => (
                <tr key={x.m.id} className="click" onClick={() => ctx.openPlayer(x.m.id)}>
                  <td>{x.m.name}</td>
                  <td className="r">
                    {/* 出欠だけをすっきり表示。欠席のときは選手が選んだ理由を横にバッジで */}
                    <span className={`chip ${!x.r?.attendance ? "none" : x.r.attendance === "出席" ? "yes" : "no"}`}>
                      {x.r?.attendance ?? (kind === "off" ? "—" : "未入力")}
                    </span>
                    {x.r?.attendance === "欠席" && <span className="chip reason">{x.r.absence_reason ?? "理由未入力"}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty">選手が登録されていません</div>
        )}
      </div>

      {/* 3. 下段：月別の出欠状況。月のサマリーの下に、上と同じ「欠席理由統計」ボタン（その月だけ） */}
      <div className="card">
        <h3>月別の出欠席率</h3>
        <Stepper
          label={ymLabel(ym)}
          onPrev={() => setYm(addMonths(ym, -1))}
          onNext={() => setYm(addMonths(ym, 1))}
          nextDisabled={ym >= ymOf(today())}
        />
        <div className="att-total month">
          <div className="att-total-main">
            <div className="l">{ymLabel(ym)}の出席率 <small>チーム全体</small></div>
            <div className="v num">
              {tDays ? Math.round((tYes / tDays) * 100) : "—"}
              <small>%</small>
            </div>
            <div className="s">
              出席 {tYes} / 対象 {tDays}回
            </div>
          </div>
          <AbsenceButton ps={ps} practice={ctx.practice} from={ym + "-01"} to={ym + "-31"} title={`欠席理由統計（${ymLabel(ym)}）`} />
        </div>
        <p className="muted" style={{ marginBottom: 8 }}>
          {pCount
            ? `設定練習日数：${pCount}日。出席率＝練習日の出席日数÷練習日数（今日より後の練習日と、入部前の日は数えません）`
            : "この月は練習日が未設定のため、出欠を記録した日をもとに計算しています（「日程調整」で練習日を設定できます）"}
        </p>
        <div className="scroll">
          <table className="tbl">
            <tbody>
              <tr>
                <th>選手</th>
                <th className="r">出席</th>
                <th className="r">欠席</th>
                <th className="r">未入力</th>
                <th className="r">対象日数</th>
                <th className="r">出席率</th>
                <th className="r">欠席率</th>
                <th>欠席理由</th>
              </tr>
              {month.map((x) => (
                <tr key={x.m.id} className="click" onClick={() => ctx.openPlayer(x.m.id)}>
                  <td style={{ whiteSpace: "nowrap" }}>{x.m.name}</td>
                  <td className="r num">{x.yes}</td>
                  <td className="r num">{x.no}</td>
                  <td className="r num">{x.none}</td>
                  <td className="r num">{x.days}</td>
                  <td className="r num">
                    <b>{pct(x.rate)}</b>
                  </td>
                  <td className="r num">{pct(x.absentRate)}</td>
                  <td className="muted" style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                    {absenceSummary(x.m, ym + "-01", ym + "-31") || "—"}
                  </td>
                </tr>
              ))}
              <tr>
                <td>
                  <b>チーム全体</b>
                </td>
                <td className="r num">{tYes}</td>
                <td className="r num">{tNo}</td>
                <td className="r num">{tNone}</td>
                <td className="r num">{tDays}</td>
                <td className="r num">
                  <b>{pct(tDays ? (tYes / tDays) * 100 : null)}</b>
                </td>
                <td className="r num">{pct(tDays ? (tNo / tDays) * 100 : null)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ---------- 筋トレ遂行率 ---------- */
// 月別：選んだ月のチーム・FW・BK の平均と、選手ごとの平均（0〜10。週の月曜日がその月に入る週）
function TrainingMonth({ ctx, ps }: { ctx: Ctx; ps: Member[] }) {
  const [ym, setYm] = useState(ymOf(today()));
  const groups = splitGroups(ps);
  const f = (v: number | null) => (v == null ? "—" : fmt1(v));
  const weeksIn = (m: Member) => Object.keys(m.training).filter((w) => w.slice(0, 7) === ym).length;
  return (
    <div className="card">
      <h3>
        月別の遂行率 <small>0〜10</small>
      </h3>
      <MonthBar ym={ym} setYm={setYm} />
      <div className="bcards" style={{ marginBottom: 10 }}>
        {GROUPS.map((g) => {
          const v = avgOf(groups[g.key].map((m) => trainingMonthAvg(m, ym, true)));
          return (
            <div key={g.key} className="bcard" style={{ borderTopColor: g.color }}>
              <div className="bc-h">
                <b style={{ color: g.color }}>{g.label}</b>
                <small>{groups[g.key].length}名</small>
              </div>
              <div className="bc-v num">
                {f(v)}
                <small>/ 10</small>
              </div>
            </div>
          );
        })}
      </div>
      <div className="scroll">
        <table className="tbl">
          <tbody>
            <tr>
              <th>選手</th>
              <th className="r">遂行率（0〜10）</th>
              <th className="r">入力週</th>
            </tr>
            {ps.map((m) => {
              const v = trainingMonthAvg(m, ym, true);
              return (
                <tr key={m.id} className="click" onClick={() => ctx.openPlayer(m.id)}>
                  <td style={{ whiteSpace: "nowrap" }}>{m.name}</td>
                  <td className="r num">
                    <b>{v == null ? "—" : `${f(v)} / 10`}</b>
                  </td>
                  <td className="r num">{weeksIn(m)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TrainingPanel({ ctx, ps }: { ctx: Ctx; ps: Member[] }) {
  // コーチ画面のチーム集計は、月曜〜日曜が終わって確定した週（前週まで）だけ。進行中の今週は翌週の月曜日に反映
  const weeks = doneWeeks(8);
  // 推移グラフの期間：直近8週 / 全期間（確定した最初の週から前週まで）
  const [all, setAll] = useState(false);
  const chartWeeks = all ? teamDoneWeeksAll(ps) : weeks;
  // 上のチーム平均は、直近で終わった週（前週）。ダッシュボードのボタンと同じ決め方
  const cur = teamSummaryWeek(ps);
  const teamPts = chartWeeks.map((w) => ({ d: w, v: teamTrainingAvg(ps, w) })).filter((p): p is { d: string; v: number } => p.v != null);
  const curAvg = teamTrainingAvg(ps, cur);
  const entered = ps.filter((m) => m.training[cur] != null).length;
  // その週のメニュー（日程調整）に合わせた評価基準（項目設定）
  const menu = ctx.weeks[cur]?.menu ?? DEFAULT_MENU;

  return (
    <>
      {/* 1カラム：見出しの横にその週のメニューと「評価基準」ボタン（押したときだけ開く） */}
      <div className="card">
          <h3 style={{ flexWrap: "wrap" }}>
            チーム平均 <small>{weekLabel(cur)}（{menu}）</small>
            <CriteriaButton ctx={ctx} />
          </h3>
          <div className="kpi" style={{ padding: 0 }}>
            <div className="v num">
              {curAvg == null ? "—" : fmt1(curAvg)}
              <small>/ 10</small>
            </div>
            <div className="s">
              入力 {entered}/{ps.length}名
            </div>
          </div>
          <h3 style={{ marginTop: 14 }}>
            チーム平均の推移 <small>確定した週</small>
            <RangePill all={all} setAll={setAll} recent="直近8週" />
          </h3>
          <LineChart pts={teamPts} h={130} color="#a96a00" unit="/ 10" note={(w) => `メニュー ${menuLabel(ctx.weeks[w]?.menu ?? DEFAULT_MENU)}`} />
      </div>
      <TrainingMonth ps={ps} ctx={ctx} />

      <div className="card">
        <h3>
          選手ごとの週次推移 <small>0〜10・確定した直近8週</small>
        </h3>
        <div className="scroll">
          <table className="tbl">
            <tbody>
              <tr>
                <th>選手</th>
                {weeks.map((w) => (
                  <th className="r" key={w}>
                    {md(w)}〜
                  </th>
                ))}
                <th className="r">8週平均<br /><small className="muted">前週まで</small></th>
              </tr>
              {ps.map((m) => {
                const a = trainingAvg(m, 8);
                return (
                  <tr key={m.id} className="click" onClick={() => ctx.openPlayer(m.id)}>
                    <td style={{ whiteSpace: "nowrap" }}>{m.name}</td>
                    {weeks.map((w) => (
                      <td className="r num" key={w}>
                        {m.training[w] ?? <span className="muted">—</span>}
                      </td>
                    ))}
                    <td className="r num">
                      <b>{a == null ? "—" : `${fmt1(a)} / 10`}</b>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// 活動の種類の色（練習＝緑、試合＝赤、合同練習＝青）
const DAY_CLS: Record<DayType, string> = { 練習: "t-practice", 試合: "t-game", 合同練習: "t-joint" };

/* ---------- 欠席理由統計ボタン：押すとモーダルで、理由ごとの回数と割合（多い順・棒グラフ付き） ----------
   トータル（全期間）と月別で同じボタン。from〜to の期間で集計（from が null なら全期間） */
function AbsenceButton({ ps, practice, from, to, title }: { ps: Member[]; practice: Practice; from: string | null; to: string; title: string }) {
  const [open, setOpen] = useState(false);
  // 上の3つのカードで選んだ種類（null＝すべて）。開いたときは「練習」。もう一度押すか「すべて表示」で全体
  const [sel, setSel] = useState<DayType | null>("練習");
  const byType = absenceByType(ps, practice, from, to); // 練習・試合・合同練習ごとの欠席回数
  // 分母：期間内で今日までに開催した、その種類の日数 × 登録選手数
  const end = to < today() ? to : today();
  const heldOf = (k: DayType) => [...practice.days].filter((d) => (!from || d >= from) && d <= end && dayType(d, practice) === k).length;
  const held = Object.fromEntries(DAY_TYPES.map((k) => [k, heldOf(k)])) as Record<DayType, number>;
  const list = absenceCounts(ps, from, to, sel ? (d) => dayType(d, practice) === sel : undefined);
  const total = list.reduce((a, x) => a + x.n, 0);
  const max = Math.max(1, ...list.map((x) => x.n));
  return (
    <>
      <button
        className="abs-btn"
        onClick={() => {
          setSel("練習");
          setOpen(true);
        }}
      >
        欠席理由統計
      </button>
      {open && (
        <div className="modal" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="sheet">
            <div className="hd">
              <h2>{title}</h2>
              <button className="x" onClick={() => setOpen(false)} aria-label="閉じる">
                ×
              </button>
            </div>
            <div className="card">
              {/* 上：活動の種類ごとの欠席（欠席回数 / 対象回数）。押すと下の内訳をその種類だけに絞る */}
              <div className="abs-types">
                {DAY_TYPES.map((k) => (
                  <button key={k} className={`${DAY_CLS[k]} ${sel === k ? "on" : ""} ${sel && sel !== k ? "dim" : ""}`} onClick={() => setSel(sel === k ? null : k)} aria-pressed={sel === k}>
                    <div className="l">{k} 欠席</div>
                    <div className="v num">
                      {byType[k]}
                      <small> / {held[k] * ps.length}回</small>
                    </div>
                    <div className="s">開催 {held[k]}日</div>
                  </button>
                ))}
              </div>
              <div className="abs-head">
                {sel ? (
                  <>
                    <b>{sel}の欠席理由</b>
                    <span className="muted">
                      開催 {held[sel]}日 / 対象 {held[sel] * ps.length}回中・欠席 <b className="num">{total}</b>回
                    </span>
                    <button className="abs-reset" onClick={() => setSel(null)}>
                      すべて表示
                    </button>
                  </>
                ) : (
                  <span className="muted">
                    欠席 合計 <b className="num">{total}</b> 回
                  </span>
                )}
              </div>
              {/* 欠席が0回でも理由の行はすべて出す（0回 0% を薄く）。どの種類を選んでも枠の高さが変わらない */}
              {list.map((x) => (
                <div key={x.reason} className={`abs-row ${x.n ? "" : "zero"}`}>
                  <span className="abs-l">{x.reason}</span>
                  <span className="abs-bar">
                    <i style={{ width: `${(x.n / max) * 100}%` }} />
                  </span>
                  <span className="abs-v num">
                    {x.n}回 <small>{total ? Math.round((x.n / total) * 100) : 0}%</small>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
