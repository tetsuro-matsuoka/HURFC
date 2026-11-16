"use client";

// 項目設定（コーチ用）
//  ・測定項目の追加・名前/単位/カテゴリの変更・削除・並び替え（左の ⋮⋮ をドラッグ＆ドロップ）
//    → 選手の「記録する → 測定」と、チームダッシュボードの選手一覧に自動で反映（並び順も）
//  ・筋トレ遂行度の評価基準（説明文）の編集

import { useState } from "react";
import type { FormEvent } from "react";
import { Sheet, type Ctx } from "./Shared";
import SortableList from "./SortableList";
import { addMetric, deleteMetric, saveMetricOrder, saveSetting, updateMetric, type MetricInput } from "@/lib/data";
import { CRITERIA_KEY, MENUS, MENU_TIMES, isLinked, isMinSec, isMomentum, metricsOf, unitOf } from "@/lib/calc";
import type { Menu, MetricCategory, MetricDef } from "@/lib/types";

const CATEGORIES: MetricCategory[] = ["体組成", "フィジカル"];
const EMPTY: MetricInput = { name: "", unit: "", category: "体組成", better: "high", show_ratio: false };

// 項目の入力欄（追加と編集で共通）
// isWeight：体重そのものの項目（体重比は常に1になるのでチェック欄を出さない）
function MetricFields({ v, set, isWeight }: { v: MetricInput; set: (v: MetricInput) => void; isWeight?: boolean }) {
  return (
    <>
      <label className="f">項目名</label>
      <input className="t" value={v.name} onChange={(e) => set({ ...v, name: e.target.value })} required placeholder="例：30mスプリント" />
      <label className="f">単位</label>
      <input className="t" value={v.unit} onChange={(e) => set({ ...v, unit: e.target.value })} placeholder="例：秒、kg、%、cm、分:秒（不要なら空欄）" />
      <p className="muted" style={{ marginTop: 6, fontSize: 11 }}>「分:秒」にすると（または種目名に「ブロンコ」を含むと）、4分50秒のようなタイムで入力・表示します（小さいほど上位）。</p>
      <label className="f">カテゴリ</label>
      <div className="seg" style={{ marginBottom: 0 }}>
        {CATEGORIES.map((c) => (
          <button type="button" key={c} className={v.category === c ? "on" : ""} onClick={() => set({ ...v, category: c })}>
            {c}
          </button>
        ))}
      </div>
      <label className="f">良い記録の向き（ランキング・自己ベストに使用）</label>
      <div className="seg" style={{ marginBottom: 0 }}>
        <button type="button" className={v.better === "high" ? "on" : ""} onClick={() => set({ ...v, better: "high" })} style={{ fontSize: 14 }}>
          大きいほど良い
        </button>
        <button type="button" className={v.better === "low" ? "on" : ""} onClick={() => set({ ...v, better: "low" })} style={{ fontSize: 14 }}>
          小さいほど良い
        </button>
      </div>
      {!isWeight && (
        <label className="checkrow">
          <input type="checkbox" checked={v.show_ratio} onChange={(e) => set({ ...v, show_ratio: e.target.checked })} />
          <span>
            体重比（相対値）も表示する
            <small>選手一覧・CSVで、この項目のすぐ右に「値 ÷ その日時点の体重」を自動で表示します（選手の入力は今までどおり）</small>
          </span>
        </label>
      )}
    </>
  );
}

export function SettingsScreen({ ctx }: { ctx: Ctx }) {
  const [form, setForm] = useState<MetricInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<{ type: "edit" | "del"; def: MetricDef } | null>(null);
  const [edit, setEdit] = useState<MetricInput>(EMPTY);
  // 筋トレ遂行率の評価基準：メニュー（A〜B / A〜C / A〜D）ごとに編集・保存。普段は閉じておき、ボタンで開く
  const [cMenu, setCMenu] = useState<Menu | null>(null);
  const [criteria, setCriteria] = useState<Record<Menu, string>>(
    () => Object.fromEntries(MENUS.map((x) => [x, ctx.settings[CRITERIA_KEY[x]] ?? ""])) as Record<Menu, string>,
  );

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    try {
      await fn();
      await ctx.reload();
      ctx.toast(okMsg);
      return true;
    } catch {
      ctx.toast("保存に失敗しました。データベースの更新（追加SQL）が済んでいるか確認してください");
      return false;
    } finally {
      setBusy(false);
    }
  };

  // 並び替え：ドロップした時点で、カテゴリ内の新しい順番を保存（失敗したら元の順番に戻る）
  const reorder = (ids: number[]) => run(() => saveMetricOrder(ids), "並び順を保存しました");

  const clean = (v: MetricInput): MetricInput => ({ ...v, name: v.name.trim(), unit: v.unit.trim() });
  const dup = (name: string, exceptId?: number) => ctx.metrics.some((x) => x.id !== exceptId && x.name === name);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const v = clean(form);
    if (!v.name) return ctx.toast("項目名を入力してください");
    if (dup(v.name)) return ctx.toast("同じ名前の項目があります");
    const next = Math.max(0, ...ctx.metrics.map((x) => x.sort_order)) + 1;
    if (await run(() => addMetric(v, next), `「${v.name}」を追加しました`)) setForm({ ...EMPTY, category: v.category });
  };

  return (
    <>
      <h2 className="page">項目設定</h2>

      <div className="card">
        <h3>測定項目</h3>
        <p className="muted" style={{ marginBottom: 8 }}>
          ここにある項目が、チームダッシュボードの選手一覧と、選手の「記録する → 測定」に、この順番で表示されます。左の ⋮⋮ をつかんで上下に動かすと並び替えできます。
          「体重比」を ON にした項目は、選手一覧・CSVでそのすぐ右に体重比（値 ÷ その日時点の体重）も表示します。
        </p>
        {CATEGORIES.map((c) => {
          const list = metricsOf(ctx.metrics, c);
          return (
            <div key={c} style={{ marginTop: 12 }}>
              <div className="muted" style={{ fontWeight: 700 }}>
                {c}
              </div>
              {list.length ? (
                <SortableList
                  items={list}
                  getId={(x) => x.id}
                  onReorder={(ids) => reorder(ids as number[])}
                  render={(x) => (
                  <>
                    <div className="mn">
                      <b>
                        {x.name}
                        {unitOf(x) && <span className="muted">（{unitOf(x)}）</span>}
                        {isMinSec(x) && <span className="muted">（タイム 分:秒）</span>}
                      </b>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {x.better === "low" ? "小さいほど良い" : "大きいほど良い"}
                        {x.key === "weight" && " ・ 「毎日の記録」の体重を使用"}
                        {(x.key === "bench_press" || x.key === "squat" || x.key === "deadlift") && " ・ 「測定」のBig3入力を使用"}
                        {x.key === "big3_total" && " ・ Big3の自己ベストから自動計算"}
                        {x.derived && ` ・ 体重 × ${x.derived.dist}m ÷ 「${ctx.metrics.find((y) => y.id === x.derived?.sprintId)?.name}」のタイムで自動計算`}
                        {!x.derived && isMomentum(x) && " ・ 自動計算には「10mスプリント」などのスプリント項目（秒）が必要です"}
                      </div>
                    </div>
                    <div className="ma">
                      {x.key !== "weight" && (
                        <button
                          className={`ratiobtn ${x.show_ratio ? "on" : ""}`}
                          aria-pressed={x.show_ratio}
                          disabled={busy}
                          onClick={() =>
                            run(
                              () => updateMetric(x.id, { show_ratio: !x.show_ratio }),
                              `「${x.name}」の体重比を${x.show_ratio ? "OFF" : "ON"}にしました`,
                            )
                          }
                          title="体重比（相対値）も表示する"
                        >
                          体重比 {x.show_ratio ? "ON" : "OFF"}
                        </button>
                      )}
                      <button
                        className="btn ghost small"
                        onClick={() => {
                          setEdit({ name: x.name, unit: x.unit, category: x.category, better: x.better, show_ratio: x.show_ratio });
                          setDialog({ type: "edit", def: x });
                        }}
                      >
                        編集
                      </button>
                      <button className="btn ghost small" style={{ borderColor: "var(--ng)", color: "var(--ng)" }} onClick={() => setDialog({ type: "del", def: x })}>
                        削除
                      </button>
                    </div>
                  </>
                  )}
                />
              ) : (
                <div className="muted" style={{ padding: "8px 0" }}>
                  項目がありません
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card">
        <h3>項目を追加</h3>
        <form onSubmit={add}>
          <MetricFields v={form} set={setForm} />
          <button className="btn navy" type="submit" disabled={busy}>
            {busy ? "処理中…" : "追加"}
          </button>
        </form>
      </div>

      <div className="card">
        <h3>筋トレ遂行率の評価基準</h3>
        <p className="muted">
          日程調整で設定した週のメニューに合わせて、選手の「記録する → 筋トレ遂行率」に表示されます。メニューごとに書き分けられます。
        </p>
        {/* 押したときだけ開く。開いているボタンをもう一度押すと閉じる */}
        <div className="crit-btns">
          {MENUS.map((x) => (
            <button key={x} className={cMenu === x ? "on" : ""} onClick={() => setCMenu(cMenu === x ? null : x)} aria-expanded={cMenu === x}>
              {x}の評価基準
              <small>{MENU_TIMES[x]}{criteria[x] ? "" : "・未入力"}</small>
            </button>
          ))}
        </div>
        {cMenu && (
          <>
            <textarea
              className="t"
              rows={8}
              value={criteria[cMenu]}
              onChange={(e) => setCriteria((cur) => ({ ...cur, [cMenu]: e.target.value }))}
              placeholder={`${cMenu}（${MENU_TIMES[cMenu]}）の週の評価基準`}
              style={{ marginTop: 10, lineHeight: 1.7 }}
            />
            <button
              className="btn navy"
              disabled={busy}
              onClick={() => run(() => saveSetting(CRITERIA_KEY[cMenu], criteria[cMenu]), `${cMenu} の評価基準を保存しました`)}
            >
              {busy ? "処理中…" : `${cMenu} の評価基準を保存する`}
            </button>
          </>
        )}
      </div>

      {dialog?.type === "edit" && (
        <Sheet title="項目を変更" onClose={() => setDialog(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const v = clean(edit);
              if (!v.name) return ctx.toast("項目名を入力してください");
              if (dup(v.name, dialog.def.id)) return ctx.toast("同じ名前の項目があります");
              if (await run(() => updateMetric(dialog.def.id, v), "変更しました")) setDialog(null);
            }}
          >
            <MetricFields v={edit} set={setEdit} isWeight={dialog.def.key === "weight"} />
            <button className="btn navy" type="submit" disabled={busy}>
              {busy ? "処理中…" : "保存する"}
            </button>
          </form>
        </Sheet>
      )}

      {dialog?.type === "del" && (
        <Sheet title="項目を削除" onClose={() => setDialog(null)}>
          <p>
            {isLinked(dialog.def)
              ? `「${dialog.def.name}」を選手一覧などの表示から外します。体重・Big3の記録そのものは消えません（ホーム画面などでは引き続き使われます）。`
              : `「${dialog.def.name}」と、全選手のこの項目の記録をすべて削除します。元に戻せません。`}
          </p>
          <button
            className="btn"
            style={{ background: "var(--ng)" }}
            disabled={busy}
            onClick={async () => {
              if (await run(() => deleteMetric(dialog.def.id), `「${dialog.def.name}」を削除しました`)) setDialog(null);
            }}
          >
            {busy ? "処理中…" : "削除する"}
          </button>
          <button className="btn ghost" onClick={() => setDialog(null)}>
            やめる
          </button>
        </Sheet>
      )}
    </>
  );
}
