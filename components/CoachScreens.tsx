"use client";

// コーチ・管理者向け画面
//  S04 チームダッシュボード / S05 フィジカル管理・ランキング / 選手管理（合言葉リセット等）

import { useState } from "react";
import type { FormEvent } from "react";
import LineChart from "./LineChart";
import { RankList, Sheet, type Ctx } from "./Shared";
import {
  LIFTS,
  METRICS,
  addDays,
  fmt0,
  fmt1,
  latestWeight,
  maxes,
  md,
  normName,
  phys,
  playersOf,
  today,
  wd,
  weightAgo,
  weights,
} from "@/lib/calc";
import { adminCall } from "@/lib/data";
import type { MetricKey, Role } from "@/lib/types";

/* ---------- S04 チームダッシュボード ---------- */
export function TeamScreen({ ctx }: { ctx: Ctx }) {
  const [d, setD] = useState(today());
  const ps = playersOf(ctx.members);
  const rows = ps.map((m) => ({ m, r: m.daily[d] }));
  const yes = rows.filter((x) => x.r?.attendance === "出席").length;
  const no = rows.filter((x) => x.r?.attendance === "欠席").length;
  const none = rows.length - yes - no;
  // 未入力 → 欠席 → 出席 の順に並べる（確認が必要な人を上に）
  const order = (x: (typeof rows)[number]) => (!x.r ? 2 : x.r.attendance === "欠席" ? 1 : 0);
  const sorted = [...rows].sort((a, b) => order(b) - order(a) || a.m.name.localeCompare(b.m.name, "ja"));
  const diffCell = (v: number | null) =>
    v == null ? (
      <span className="muted">—</span>
    ) : (
      <span className={v >= 0 ? "up" : "down"}>
        {v >= 0 ? "+" : ""}
        {fmt1(v)}
      </span>
    );

  return (
    <>
      <h2 className="page">チームダッシュボード</h2>
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
      </div>
      <div className="sumrow">
        <div style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>
          <div className="v num">{yes}</div>
          <div className="l">出席</div>
        </div>
        <div style={{ background: "var(--ng-soft)", color: "var(--ng)" }}>
          <div className="v num">{no}</div>
          <div className="l">欠席</div>
        </div>
        <div style={{ background: "#fff", color: "var(--sub)" }}>
          <div className="v num">{none}</div>
          <div className="l">未入力</div>
        </div>
      </div>
      <div className="grid two">
        <div className="card">
          <h3>
            出席状況{" "}
            <small>
              {md(d)} ・ {rows.length}名
            </small>
          </h3>
          {rows.length ? (
            <table className="tbl">
              <tbody>
                {sorted.map((x) => (
                  <tr key={x.m.id} className="click" onClick={() => ctx.openPlayer(x.m.id)}>
                    <td>{x.m.name}</td>
                    <td>
                      <span className={`chip ${!x.r ? "none" : x.r.attendance === "出席" ? "yes" : "no"}`}>
                        {x.r ? x.r.attendance ?? "—" : "未入力"}
                      </span>
                    </td>
                    <td className="r num">{x.r?.weight ? fmt1(x.r.weight) + "kg" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">選手が登録されていません</div>
          )}
        </div>
        <div className="card">
          <h3>
            体重推移一覧 <small>直近30日</small>
          </h3>
          <div className="scroll">
            <table className="tbl">
              <tbody>
                <tr>
                  <th>選手</th>
                  <th>推移</th>
                  <th className="r">最新</th>
                  <th className="r">7日差</th>
                  <th className="r">30日差</th>
                </tr>
                {ps.map((m) => {
                  const lw = latestWeight(m),
                    a7 = weightAgo(m, 7),
                    a30 = weightAgo(m, 30);
                  return (
                    <tr key={m.id} className="click" onClick={() => ctx.openPlayer(m.id)}>
                      <td style={{ whiteSpace: "nowrap" }}>{m.name}</td>
                      <td>
                        <LineChart pts={weights(m, 30)} h={30} width={110} label={false} color="var(--navy)" />
                      </td>
                      <td className="r num">
                        <b>{lw ? fmt1(lw.v) : "—"}</b>
                      </td>
                      <td className="r num">{diffCell(lw && a7 ? lw.v - a7.v : null)}</td>
                      <td className="r num">{diffCell(lw && a30 ? lw.v - a30.v : null)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- S05 フィジカルデータ管理・ランキング ---------- */
export function PhysicalScreen({ ctx }: { ctx: Ctx }) {
  const [metric, setMetric] = useState<MetricKey>("total");
  const ps = playersOf(ctx.members);
  return (
    <>
      <h2 className="page">フィジカル管理</h2>
      <div className="grid two">
        <div className="card">
          <h3>ランキング</h3>
          <div className="seg">
            {METRICS.map(([k, l]) => (
              <button key={k} className={metric === k ? "on" : ""} onClick={() => setMetric(k)} style={{ fontSize: 12, padding: "9px 2px" }}>
                {l}
              </button>
            ))}
          </div>
          <RankList ctx={ctx} metric={metric} />
        </div>
        <div className="card">
          <h3>
            選手別 自己ベスト一覧 <small>タップで詳細</small>
          </h3>
          <div className="scroll">
            <table className="tbl">
              <tbody>
                <tr>
                  <th>選手</th>
                  {LIFTS.map((l) => (
                    <th className="r" key={l[0]}>
                      {l[2]}
                    </th>
                  ))}
                  <th className="r">合計</th>
                  <th className="r">最終測定</th>
                </tr>
                {ps.map((m) => {
                  const x = maxes(m),
                    p = phys(m);
                  return (
                    <tr key={m.id} className="click" onClick={() => ctx.openPlayer(m.id)}>
                      <td style={{ whiteSpace: "nowrap" }}>{m.name}</td>
                      {LIFTS.map(([k]) => (
                        <td className="r num" key={k}>
                          {fmt0(x[k])}
                        </td>
                      ))}
                      <td className="r num">
                        <b>{fmt0(x.total)}</b>
                      </td>
                      <td className="r muted">{p.length ? md(p[p.length - 1].d) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- 選手管理（追加・合言葉リセット・削除） ---------- */
export function ManageScreen({ ctx }: { ctx: Ctx }) {
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [role, setRole] = useState<Role>("player");
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<{ type: "reset" | "del"; id: string } | null>(null);
  const [newPw, setNewPw] = useState("");

  const all = Object.values(ctx.members).sort((a, b) =>
    a.role === b.role ? a.name.localeCompare(b.name, "ja") : a.role === "coach" ? -1 : 1,
  );

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    try {
      await fn();
      await ctx.reload();
      ctx.toast(okMsg);
      return true;
    } catch (e) {
      ctx.toast(e instanceof Error ? e.message : "処理に失敗しました");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (Object.values(ctx.members).some((m) => normName(m.name) === normName(n))) return ctx.toast("同じ名前のメンバーがいます");
    if (pw.length < 6) return ctx.toast("合言葉は6文字以上にしてください");
    const ok = await run(() => adminCall("add", { name: n, password: pw, role }), `${n} さんを追加しました`);
    if (ok) {
      setName("");
      setPw("");
    }
  };

  const target = dialog ? ctx.members[dialog.id] : null;

  return (
    <>
      <h2 className="page">選手管理</h2>
      <div className="card">
        <h3>メンバーを追加</h3>
        <form onSubmit={add} className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label className="f" style={{ marginTop: 0 }}>
              名前
            </label>
            <input className="t" value={name} onChange={(e) => setName(e.target.value)} required placeholder="例：山田 太郎" />
          </div>
          <div>
            <label className="f" style={{ marginTop: 0 }}>
              合言葉（6文字以上）
            </label>
            <input className="t" value={pw} onChange={(e) => setPw(e.target.value)} required placeholder="例：rugby1" />
          </div>
          <div>
            <label className="f" style={{ marginTop: 0 }}>
              権限
            </label>
            <select className="t" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="player">選手</option>
              <option value="coach">コーチ</option>
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button className="btn navy" style={{ margin: 0 }} type="submit" disabled={busy}>
              {busy ? "処理中…" : "追加"}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h3>
          メンバー一覧 <small>{all.length}名</small>
        </h3>
        <table className="tbl">
          <tbody>
            <tr>
              <th>名前</th>
              <th>権限</th>
              <th className="r">操作</th>
            </tr>
            {all.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>
                  <span className={`chip ${m.role === "coach" ? "no" : "none"}`}>{m.role === "coach" ? "コーチ" : "選手"}</span>
                </td>
                <td className="r" style={{ whiteSpace: "nowrap" }}>
                  <button
                    className="btn ghost small"
                    onClick={() => {
                      setNewPw("");
                      setDialog({ type: "reset", id: m.id });
                    }}
                  >
                    合言葉リセット
                  </button>{" "}
                  {m.id !== ctx.me.id && (
                    <button
                      className="btn ghost small"
                      style={{ borderColor: "var(--ng)", color: "var(--ng)" }}
                      onClick={() => setDialog({ type: "del", id: m.id })}
                    >
                      削除
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog?.type === "reset" && target && (
        <Sheet title="合言葉リセット" onClose={() => setDialog(null)}>
          <p>{target.name} さんの新しい合言葉を入力してください（6文字以上）。</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (newPw.length < 6) return ctx.toast("合言葉は6文字以上にしてください");
              const ok = await run(() => adminCall("reset", { id: target.id, password: newPw }), "合言葉を変更しました");
              if (ok) setDialog(null);
            }}
          >
            <input className="t" value={newPw} onChange={(e) => setNewPw(e.target.value)} required style={{ marginTop: 12 }} placeholder="新しい合言葉" />
            <button className="btn navy" type="submit" disabled={busy}>
              {busy ? "処理中…" : "変更する"}
            </button>
          </form>
        </Sheet>
      )}

      {dialog?.type === "del" && target && (
        <Sheet title="メンバーを削除" onClose={() => setDialog(null)}>
          <p>{target.name} さんと、その記録をすべて削除します。元に戻せません。</p>
          <button
            className="btn"
            style={{ background: "var(--ng)" }}
            disabled={busy}
            onClick={async () => {
              const ok = await run(() => adminCall("delete", { id: target.id }), `${target.name} さんを削除しました`);
              if (ok) setDialog(null);
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
