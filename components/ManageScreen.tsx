"use client";

// 選手管理（コーチ用）
//  ・メンバー追加：選手は「名前・学年・ポジション」、コーチは「名前・合言葉」
//  ・選手の並び替え（▲▼）、学年順に並べ直す
//  ・選手の編集（名前・学年・ポジション）、メンバー削除
// 選手は合言葉なしでログインするため、ここでの合言葉の設定・リセットはありません。

import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Sheet, type Ctx } from "./Shared";
import { POSITIONS, normName, playersOf } from "@/lib/calc";
import { adminCall } from "@/lib/data";
import type { Member, Position, Role } from "@/lib/types";

// 画面で選べる学年
const GRADE_OPTIONS = [4, 3, 2, 1];

// 学年・ポジションの入力欄（追加と編集で共通）
function PlayerFields({
  grade,
  setGrade,
  position,
  setPosition,
}: {
  grade: number | null;
  setGrade: (g: number) => void;
  position: Position | null;
  setPosition: (p: Position) => void;
}) {
  return (
    <>
      <label className="f">学年</label>
      <div className="seg" style={{ marginBottom: 0 }}>
        {GRADE_OPTIONS.map((g) => (
          <button type="button" key={g} className={grade === g ? "on" : ""} onClick={() => setGrade(g)}>
            {g}年
          </button>
        ))}
      </div>
      <label className="f">ポジション</label>
      <div className="seg" style={{ marginBottom: 0 }}>
        {POSITIONS.map((p) => (
          <button type="button" key={p} className={position === p ? "on" : ""} onClick={() => setPosition(p)} style={{ fontSize: 14 }}>
            {p}
          </button>
        ))}
      </div>
    </>
  );
}

export function ManageScreen({ ctx }: { ctx: Ctx }) {
  // 追加フォーム
  const [role, setRole] = useState<Role>("player");
  const [name, setName] = useState("");
  const [grade, setGrade] = useState<number | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  // 編集・削除の画面
  const [dialog, setDialog] = useState<{ type: "edit" | "del"; id: string } | null>(null);
  const [eName, setEName] = useState("");
  const [eGrade, setEGrade] = useState<number | null>(null);
  const [ePos, setEPos] = useState<Position | null>(null);

  // 並び替え中の順番（保存が終わるまで画面ではこちらを使う）
  const [localIds, setLocalIds] = useState<string[] | null>(null);
  const saving = useRef<Promise<unknown>>(Promise.resolve());

  const coaches = Object.values(ctx.members)
    .filter((m) => m.role === "coach")
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  const basePlayers = playersOf(ctx.members);
  const players: Member[] = localIds
    ? [
        ...localIds.map((id) => ctx.members[id]).filter(Boolean),
        ...basePlayers.filter((p) => !localIds.includes(p.id)),
      ]
    : basePlayers;

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
    if (!n) return ctx.toast("名前を入力してください");
    if (Object.values(ctx.members).some((m) => normName(m.name) === normName(n))) return ctx.toast("同じ名前のメンバーがいます");
    if (role === "player" && (!grade || !position)) return ctx.toast("学年とポジションを選んでください");
    if (role === "coach" && pw.length < 6) return ctx.toast("コーチの合言葉は6文字以上にしてください");
    const payload = role === "coach" ? { name: n, role, password: pw } : { name: n, role, grade, position };
    const ok = await run(() => adminCall("add", payload), `${n} さんを追加しました`);
    if (ok) {
      setName("");
      setPw("");
      setGrade(null);
      setPosition(null);
    }
  };

  // 並び順を保存（連続で押しても順番どおりに保存されるよう、1つずつ送る）
  const saveOrder = (ids: string[]) => {
    setLocalIds(ids);
    const job = saving.current
      .catch(() => undefined)
      .then(() => adminCall("reorder", { ids }));
    saving.current = job;
    job
      .then(async () => {
        // 最後に押した分の保存が終わったら、最新データに切り替える
        if (saving.current === job) {
          await ctx.reload();
          setLocalIds(null);
        }
      })
      .catch(async (e) => {
        ctx.toast(e instanceof Error ? e.message : "並び順を保存できませんでした");
        await ctx.reload();
        setLocalIds(null);
      });
  };

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= players.length) return;
    const ids = players.map((p) => p.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    saveOrder(ids);
  };

  const sortByGrade = () => {
    if (!window.confirm("学年が上の人から順に並べ直します。手で入れ替えた順番は元に戻ります。よろしいですか？")) return;
    const ids = [...players]
      .sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0) || a.name.localeCompare(b.name, "ja"))
      .map((p) => p.id);
    saveOrder(ids);
    ctx.toast("学年順に並べ直しました");
  };

  const openEdit = (m: Member) => {
    setEName(m.name);
    setEGrade(m.grade);
    setEPos(m.position);
    setDialog({ type: "edit", id: m.id });
  };

  const target = dialog ? ctx.members[dialog.id] : null;

  return (
    <>
      <h2 className="page">選手管理</h2>

      <div className="card">
        <h3>メンバーを追加</h3>
        <form onSubmit={add}>
          <div className="seg" style={{ marginBottom: 0 }}>
            <button type="button" className={role === "player" ? "on" : ""} onClick={() => setRole("player")}>
              選手
            </button>
            <button type="button" className={role === "coach" ? "on" : ""} onClick={() => setRole("coach")}>
              コーチ
            </button>
          </div>
          <label className="f">名前</label>
          <input className="t" value={name} onChange={(e) => setName(e.target.value)} required placeholder="例：山田 太郎" />
          {role === "player" ? (
            <PlayerFields grade={grade} setGrade={setGrade} position={position} setPosition={setPosition} />
          ) : (
            <>
              <label className="f">合言葉（6文字以上・コーチのログイン用）</label>
              <input className="t" value={pw} onChange={(e) => setPw(e.target.value)} required placeholder="例：rugby1" />
            </>
          )}
          <button className="btn navy" type="submit" disabled={busy}>
            {busy ? "処理中…" : "追加"}
          </button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span>
            選手一覧 <small>{players.length}名</small>
          </span>
          {players.length > 1 && (
            <button className="btn ghost small" style={{ marginLeft: "auto", fontSize: 13, padding: "6px 10px" }} onClick={sortByGrade}>
              学年順に並べ直す
            </button>
          )}
        </h3>
        <p className="muted" style={{ marginBottom: 8 }}>
          ▲▼で順番を入れ替えられます。この順番はチーム画面・ログイン画面などでも使われます。
        </p>
        {players.length ? (
          players.map((m, i) => (
            <div className="mrow" key={m.id}>
              <div className="mv">
                <button aria-label="上へ" disabled={i === 0} onClick={() => move(i, -1)}>
                  ▲
                </button>
                <button aria-label="下へ" disabled={i === players.length - 1} onClick={() => move(i, 1)}>
                  ▼
                </button>
              </div>
              <div className="mn">
                <b>{m.name}</b>
                <div>
                  <span className="chip none">{m.grade ? `${m.grade}年` : "学年未設定"}</span>{" "}
                  <span className="chip none">{m.position ?? "ポジション未設定"}</span>
                </div>
              </div>
              <div className="ma">
                <button className="btn ghost small" onClick={() => openEdit(m)}>
                  編集
                </button>
                <button
                  className="btn ghost small"
                  style={{ borderColor: "var(--ng)", color: "var(--ng)" }}
                  onClick={() => setDialog({ type: "del", id: m.id })}
                >
                  削除
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="empty">選手が登録されていません</div>
        )}
      </div>

      <div className="card">
        <h3>
          コーチ <small>{coaches.length}名</small>
        </h3>
        {coaches.map((m) => (
          <div className="mrow" key={m.id}>
            <div className="mn">
              <b>{m.name}</b>
            </div>
            <div className="ma">
              {m.id !== ctx.me.id && (
                <button
                  className="btn ghost small"
                  style={{ borderColor: "var(--ng)", color: "var(--ng)" }}
                  onClick={() => setDialog({ type: "del", id: m.id })}
                >
                  削除
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {dialog?.type === "edit" && target && (
        <Sheet title="選手の情報を変更" onClose={() => setDialog(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const n = eName.trim();
              if (!n) return ctx.toast("名前を入力してください");
              if (Object.values(ctx.members).some((m) => m.id !== target.id && normName(m.name) === normName(n)))
                return ctx.toast("同じ名前のメンバーがいます");
              if (!eGrade || !ePos) return ctx.toast("学年とポジションを選んでください");
              const ok = await run(
                () => adminCall("update", { id: target.id, name: n, grade: eGrade, position: ePos }),
                "変更しました",
              );
              if (ok) setDialog(null);
            }}
          >
            <label className="f" style={{ marginTop: 0 }}>
              名前
            </label>
            <input className="t" value={eName} onChange={(e) => setEName(e.target.value)} required />
            <PlayerFields grade={eGrade} setGrade={setEGrade} position={ePos} setPosition={setEPos} />
            <button className="btn navy" type="submit" disabled={busy}>
              {busy ? "処理中…" : "保存する"}
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
