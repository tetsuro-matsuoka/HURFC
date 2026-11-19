"use client";

// フィジカル評価基準（Lv.1〜Lv.5）
//  ・PhysLevelsSettings … コーチの「項目設定」：種目ごとにレーダーチャートに出すか（ON/OFF）と Lv.1〜Lv.5 の基準値
//  ・PhysRadar         … 選手のホーム：フィジカルバランス（5段階評価）のレーダーチャート（自己ベスト / 最新値）

import { useState } from "react";
import { Sheet, type Ctx } from "./Shared";
import { saveSetting } from "@/lib/data";
import { basisLabel, fmtMinSec, unitOf } from "@/lib/calc";
import {
  LEVELS_KEY,
  fmtOption,
  hasAnyThreshold,
  isTimeOption,
  itemOf,
  levelOf,
  levelOptions,
  optionValue,
  readLevels,
  type LevelConfig,
  type LevelOption,
} from "@/lib/levels";

// "分:秒" または数値 → 数値（空なら null、おかしな値なら NaN）
const parse = (t: string, time: boolean): number | null => {
  const s = t.trim();
  if (s === "") return null;
  if (time && s.includes(":")) {
    const [a, b] = s.split(":").map(Number);
    return Number.isInteger(a) && a >= 0 && b >= 0 && b < 60 ? a * 60 + b : NaN;
  }
  return Number(s);
};
const show = (o: LevelOption, v: number | null) => (v == null ? "" : isTimeOption(o) ? fmtMinSec(v) : String(v));

/* ---------- コーチ：項目設定 ---------- */
export function PhysLevelsSettings({ ctx }: { ctx: Ctx }) {
  const opts = levelOptions(ctx.metrics);
  const saved = readLevels(ctx.settings);
  // 入力中の値（文字のまま持つ）
  const [rows, setRows] = useState(() =>
    Object.fromEntries(
      opts.map((o, i) => {
        const it = itemOf(saved, o, i);
        return [o.key, { on: it.on, th: it.th.map((t) => show(o, t)) }];
      }),
    ) as Record<string, { on: boolean; th: string[] }>,
  );
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const cfg: LevelConfig = {};
    for (const o of opts) {
      const r = rows[o.key] ?? { on: false, th: ["", "", "", "", ""] };
      const th = r.th.map((t) => parse(t, isTimeOption(o)));
      if (th.some((v) => v != null && (isNaN(v) || v < 0))) return ctx.toast(`「${o.label}」の基準値を確認してください${isTimeOption(o) ? "（例：4:50）" : ""}`);
      cfg[o.key] = { on: r.on, th };
    }
    setBusy(true);
    try {
      await saveSetting(LEVELS_KEY, JSON.stringify(cfg));
      await ctx.reload();
      ctx.toast("フィジカル評価基準を保存しました");
    } catch (e) {
      ctx.toast(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h3 style={{ flexWrap: "wrap" }}>
        フィジカル評価基準 <small>Lv.1〜Lv.5</small>
        <button className={`crit-toggle-btn ${open ? "on" : ""}`} onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "閉じる" : "設定する"}
        </button>
      </h3>
      <p className="muted" style={{ lineHeight: 1.7 }}>
        選手のホームの「フィジカルバランス」レーダーチャートに使います。チャートに出す種目を ON にして、Lv.1〜Lv.5 の基準値を入れてください（空欄のレベルは使いません）。
        大きいほど良い種目は「以上」、タイムなど小さいほど良い種目は「以下」で判定し、Lv.1 に届かなければ Lv.0 です。
      </p>
      {open && (
        <>
          <div className="lv-list">
            {opts.map((o) => {
              const r = rows[o.key] ?? { on: false, th: ["", "", "", "", ""] };
              const set = (v: { on: boolean; th: string[] }) => setRows({ ...rows, [o.key]: v });
              return (
                <div key={o.key} className={`lv-row ${r.on ? "" : "off"}`}>
                  <div className="lv-hd">
                    <b>
                      {o.label}
                      {!o.ratio && unitOf(o.def) && <small>（{unitOf(o.def)}）</small>}
                    </b>
                    <span className="lv-dir">{o.low ? "小さいほど良い（以下）" : "大きいほど良い（以上）"}</span>
                    <button className={`ratiobtn ${r.on ? "on" : ""}`} aria-pressed={r.on} onClick={() => set({ ...r, on: !r.on })}>
                      チャート {r.on ? "ON" : "OFF"}
                    </button>
                  </div>
                  <div className="lv-th">
                    {r.th.map((t, i) => (
                      <label key={i}>
                        <span>
                          Lv.{i + 1}
                          {o.low ? "以下" : "以上"}
                        </span>
                        <input
                          className="t"
                          inputMode={isTimeOption(o) ? "text" : "decimal"}
                          placeholder={isTimeOption(o) ? "4:50" : ""}
                          value={t}
                          onChange={(e) => set({ ...r, th: r.th.map((x, j) => (j === i ? e.target.value : x)) })}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <button className="btn navy" disabled={busy} onClick={save}>
            {busy ? "保存中…" : "フィジカル評価基準を保存"}
          </button>
        </>
      )}
    </div>
  );
}

/* ---------- 選手：レーダーチャート ---------- */
export function PhysRadar({ ctx }: { ctx: Ctx }) {
  const m = ctx.me;
  const [mode, setMode] = useState<"best" | "latest">("best");
  const cfg = readLevels(ctx.settings);
  const opts = levelOptions(ctx.metrics);
  // チャートに出す種目：ON かつ基準値が1つ以上ある種目
  const items = opts
    .map((o, i) => ({ o, it: itemOf(cfg, o, i) }))
    .filter(({ it }) => it.on && hasAnyThreshold(it))
    .map(({ o, it }) => {
      const v = optionValue(m, o, mode);
      return { o, lv: levelOf(v, it, o.low) };
    });

  return (
    <div className="card radar-card">
      <h3 className="radar-h">
        フィジカルバランス <small>5段階評価</small>
        {/* 評価基準（全種目の Lv.1〜Lv.5 の基準値の一覧）と、自己ベスト / 最新値の切り替え */}
        <LevelsButton ctx={ctx} mode={mode} />
        <span className="range-pill">
          <button className={mode === "best" ? "on" : ""} onClick={() => setMode("best")}>
            自己ベスト
          </button>
          <button className={mode === "latest" ? "on" : ""} onClick={() => setMode("latest")}>
            最新値
          </button>
        </span>
      </h3>
      {items.length < 3 ? (
        <div className="empty">
          {items.length === 0 ? "コーチが評価基準を設定すると表示されます" : "評価基準が3種目以上になるとチャートを表示します"}
        </div>
      ) : (
        <Radar items={items.map(({ o, lv }) => ({ label: o.short, lv }))} />
      )}
    </div>
  );
}

// レーダーチャート本体（5段階の多角形の目盛り。各頂点に種目名とレベル）
function Radar({ items }: { items: { label: string; lv: number }[] }) {
  const W = 360,
    H = 270,
    cx = W / 2,
    cy = H / 2 + 4,
    R = 88;
  // 長い種目名は8文字で切る（下の一覧には全部出る）
  const cut = (s: string) => (s.length > 8 ? s.slice(0, 7) + "…" : s);
  const n = items.length;
  const ang = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const pt = (i: number, r: number) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))] as const;
  const poly = (r: (i: number) => number) => items.map((_, i) => pt(i, r(i)).map((v) => v.toFixed(1)).join(",")).join(" ");
  return (
    <svg className="radar" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="フィジカルバランスのレーダーチャート">
      {[1, 2, 3, 4, 5].map((k) => (
        <polygon key={k} points={poly(() => (R * k) / 5)} fill={k % 2 ? "#fafafa" : "#fff"} stroke="#e2e4e8" strokeWidth={1} />
      ))}
      {items.map((_, i) => {
        const [x, y] = pt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e2e4e8" strokeWidth={1} />;
      })}
      {[1, 2, 3, 4, 5].map((k) => (
        <text key={k} x={cx + 3} y={cy - (R * k) / 5 + 3} className="radar-tick">
          {k}
        </text>
      ))}
      <polygon points={poly((i) => (R * items[i].lv) / 5)} fill="rgba(232,67,43,.22)" stroke="#e8432b" strokeWidth={2.2} strokeLinejoin="round" />
      {items.map((it, i) => {
        const [x, y] = pt(i, (R * it.lv) / 5);
        return <circle key={i} cx={x} cy={y} r={3.5} fill="#e8432b" />;
      })}
      {items.map((it, i) => {
        const [x, y] = pt(i, R + 22);
        const c = Math.cos(ang(i));
        const anchor = Math.abs(c) < 0.2 ? "middle" : c > 0 ? "start" : "end";
        return (
          <text key={i} x={x} y={y} textAnchor={anchor} className="radar-label">
            <tspan x={x} dy="-0.2em">
              {cut(it.label)}
            </tspan>
            <tspan x={x} dy="1.15em" className="radar-lv">
              Lv.{it.lv}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}

/* ---------- 評価基準の一覧（選手が見る） ----------
   チャートに出している種目の Lv.1〜Lv.5 の基準値を表で。左の種目列は横にスライドしても固定
   種目の下に、いま選んでいる記録（自己ベスト / 最新値）の自分の値とレベル。届いているレベルのマスに色 */
function LevelsButton({ ctx, mode }: { ctx: Ctx; mode: "best" | "latest" }) {
  const [open, setOpen] = useState(false);
  const cfg = readLevels(ctx.settings);
  const rows = levelOptions(ctx.metrics)
    .map((o, i) => ({ o, it: itemOf(cfg, o, i) }))
    .filter(({ it }) => it.on && hasAnyThreshold(it));
  return (
    <>
      <button className="crit-btn" onClick={() => setOpen(true)}>
        <span aria-hidden>?</span> 評価基準
      </button>
      {open && (
        <Sheet title="フィジカル評価基準" onClose={() => setOpen(false)}>
          {rows.length ? (
            <>
              <div className="lv-mode">
                <b>{mode === "best" ? "自己ベスト基準" : "最新値基準"}</b>で比べています
                <small>（チャートの「自己ベスト / 最新値」と連動）</small>
              </div>
              <p className="muted" style={{ marginBottom: 10, lineHeight: 1.7, fontSize: 12 }}>
                大きいほど良い種目は基準「以上」、タイムなど小さいほど良い種目は基準「以下」でそのレベル。Lv.1 に届かなければ Lv.0。色が付いているマスが、あなたが届いているレベルです。
              </p>
              <div className="scroll lv-wrap">
                <table className="tbl lv-tbl">
                  <tbody>
                    <tr>
                      <th className="lv-sticky">種目</th>
                      {[1, 2, 3, 4, 5].map((k) => (
                        <th key={k} className="r">
                          Lv.{k}
                        </th>
                      ))}
                    </tr>
                    {rows.map(({ o, it }) => {
                      const v = optionValue(ctx.me, o, mode);
                      const lv = levelOf(v, it, o.low);
                      const u = o.ratio ? "倍" : isTimeOption(o) ? "" : unitOf(o.def);
                      // 補足行：計算の基準（30m基準）・単位・以上/以下
                      const note = [basisLabel(o.def).replace(/[（）]/g, "") || null, u || null, o.low ? "以下" : "以上"].filter(Boolean).join("・");
                      return (
                        <tr key={o.key}>
                          <td className="lv-sticky">
                            <b>{o.ratio ? `${o.def.name}体重比` : o.def.name}</b>
                            <small className="lv-u">{note}</small>
                            <span className={`lv-me ${v == null ? "none" : ""}`}>
                              自分: {v == null ? "未記録" : `${fmtOption(o, v)}${u}`}
                              {v != null && <em>Lv.{lv}</em>}
                            </span>
                          </td>
                          {it.th.map((t, i) => (
                            <td key={i} className={`r num ${t != null && i < lv ? "got" : ""}`}>
                              {t == null ? <span className="muted">—</span> : fmtOption(o, t)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="empty">コーチが評価基準を設定すると表示されます</div>
          )}
        </Sheet>
      )}
    </>
  );
}
