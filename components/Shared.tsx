"use client";

// 選手・コーチ共通で使う部品（ランキング、選手詳細、トースト通知）

import LineChart from "./LineChart";
import type { ReactNode } from "react";
import {
  LIFTS,
  attendRate,
  fmt0,
  fmt1,
  latestWeight,
  maxes,
  md,
  phys,
  ranking,
  rowTotal,
  weights,
} from "@/lib/calc";
import type { Member, Members, MetricKey } from "@/lib/types";

export type View = "home" | "input" | "rank" | "team" | "physical" | "manage";

// 画面どうしで受け渡す共通の情報
export type Ctx = {
  members: Members;
  me: Member;
  readOnly: boolean;
  reload: () => Promise<void>;
  toast: (msg: string, pr?: boolean) => void;
  openPlayer: (id: string) => void;
  go: (v: View) => void;
};

// ランキング一覧
export function RankList({ ctx, metric }: { ctx: Ctx; metric: MetricKey }) {
  const rk = ranking(ctx.members, metric);
  if (!rk.length) return <div className="empty">測定データがありません</div>;
  const top = rk[0].v;
  const coach = ctx.me.role === "coach";
  return (
    <>
      {rk.map((r, i) => (
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
              <i style={{ width: `${((r.v / top) * 100).toFixed(1)}%` }} />
            </div>
          </div>
          <div className="v num">
            {metric === "ratio" ? (
              "×" + r.v.toFixed(2)
            ) : (
              <>
                {fmt0(r.v)}
                <small> kg</small>
              </>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

// 選手の詳細（コーチが選手をタップしたときに表示）
export function PlayerModal({ m, onClose }: { m: Member; onClose: () => void }) {
  const x = maxes(m),
    p = phys(m),
    lw = latestWeight(m),
    r = attendRate(m),
    r30 = attendRate(m, 30);
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
            <div className="s">{lw ? md(lw.d) : ""}</div>
          </div>
        </div>
        <div className="card">
          <h3>
            体重の推移 <small>直近60日</small>
          </h3>
          <LineChart pts={weights(m, 60)} color="var(--navy)" />
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
