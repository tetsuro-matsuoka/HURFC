"use client";

// 項目設定（コーチ用）
//  ・測定項目の追加・名前/単位/カテゴリの変更・削除
//    → 選手の「記録する → 測定」と、チームダッシュボードの選手一覧に自動で反映
//  ・筋トレ遂行度の評価基準（説明文）の編集

import { useState } from "react";
import type { FormEvent } from "react";
import { Sheet, type Ctx } from "./Shared";
import { addMetric, deleteMetric, saveSetting, updateMetric, type MetricInput } from "@/lib/data";
import type { MetricCategory, MetricDef } from "@/lib/types";

const CATEGORIES: MetricCategory[] = ["体組成", "フィジカル"];
const EMPTY: MetricInput = { name: "", unit: "", category: "体組成", better: "high" };

// 項目の入力欄（追加と編集で共通）
function MetricFields({ v, set }: { v: MetricInput; set: (v: MetricInput) => void }) {
  return (
    <>
      <label className="f">項目名</label>
      <input className="t" value={v.name} onChange={(e) => set({ ...v, name: e.target.value })} required placeholder="例：30mスプリント" />
      <label className="f">単位</label>
      <input className="t" value={v.unit} onChange={(e) => set({ ...v, unit: e.target.value })} placeholder="例：秒、kg、%、cm" />
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
    </>
  );
}

export function SettingsScreen({ ctx }: { ctx: Ctx }) {
  const [form, setForm] = useState<MetricInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<{ type: "edit" | "del"; def: MetricDef } | null>(null);
  const [edit, setEdit] = useState<MetricInput>(EMPTY);
  const [criteria, setCriteria] = useState(ctx.settings.training_criteria ?? "");

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
          ここで追加した項目は、選手の「記録する → 測定」と、チームダッシュボードの選手一覧に自動で表示されます。
          体重（毎日の記録）とBig3（ベンチプレス・スクワット・デッドリフト）はアプリの基本項目のため、ここには表示されません。
        </p>
        {CATEGORIES.map((c) => {
          const list = ctx.metrics.filter((x) => x.category === c);
          return (
            <div key={c} style={{ marginTop: 12 }}>
              <div className="muted" style={{ fontWeight: 700 }}>
                {c}
              </div>
              {list.length ? (
                list.map((x) => (
                  <div className="mrow" key={x.id}>
                    <div className="mn">
                      <b>
                        {x.name}
                        {x.unit && <span className="muted">（{x.unit}）</span>}
                      </b>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {x.better === "low" ? "小さいほど良い" : "大きいほど良い"}
                        {x.key === "height" && " ・ BMI・FFMIの計算に使用"}
                        {x.key === "body_fat" && " ・ LBM・FFMIの計算に使用"}
                      </div>
                    </div>
                    <div className="ma">
                      <button
                        className="btn ghost small"
                        onClick={() => {
                          setEdit({ name: x.name, unit: x.unit, category: x.category, better: x.better });
                          setDialog({ type: "edit", def: x });
                        }}
                      >
                        編集
                      </button>
                      <button className="btn ghost small" style={{ borderColor: "var(--ng)", color: "var(--ng)" }} onClick={() => setDialog({ type: "del", def: x })}>
                        削除
                      </button>
                    </div>
                  </div>
                ))
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
        <h3>筋トレ遂行度の評価基準</h3>
        <p className="muted">選手が「記録する → 筋トレ」で0〜10を選ぶときに表示される説明文です。</p>
        <textarea className="t" rows={8} value={criteria} onChange={(e) => setCriteria(e.target.value)} style={{ marginTop: 10, lineHeight: 1.7 }} />
        <button className="btn navy" disabled={busy} onClick={() => run(() => saveSetting("training_criteria", criteria), "評価基準を保存しました")}>
          {busy ? "処理中…" : "保存する"}
        </button>
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
            <MetricFields v={edit} set={setEdit} />
            <button className="btn navy" type="submit" disabled={busy}>
              {busy ? "処理中…" : "保存する"}
            </button>
          </form>
        </Sheet>
      )}

      {dialog?.type === "del" && (
        <Sheet title="項目を削除" onClose={() => setDialog(null)}>
          <p>
            「{dialog.def.name}」と、全選手のこの項目の記録をすべて削除します。元に戻せません。
            {(dialog.def.key === "height" || dialog.def.key === "body_fat") && " BMI・LBM・FFMIが計算できなくなります。"}
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
