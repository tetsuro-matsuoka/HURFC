// プレビュー用のサンプルデータ（要件定義書「サンプルデータ投入」）
// 初期設定で「サンプル選手を入れる」を選んだときだけ使います。

import type { Attendance, PhysRec } from "./types";

export const SAMPLE_NAMES = ["佐藤 健太", "鈴木 大輝", "高橋 翔", "田中 蓮", "伊藤 悠真", "渡辺 海斗", "山本 颯", "中村 陸"];
export const SAMPLE_PASSWORD = "123456"; // サンプル選手の合言葉（本番運用前に選手ごと削除してください）

const pad = (n: number) => String(n).padStart(2, "0");
function addDaysUTC(base: string, n: number) {
  const d = new Date(base + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export type SamplePlayer = {
  name: string;
  daily: { date: string; attendance: Attendance; weight: number }[];
  physical: ({ date: string } & PhysRec)[];
};

// base: 今日の日付（日本時間）"YYYY-MM-DD"
export function generateSample(base: string): SamplePlayer[] {
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const r25 = (v: number) => Math.round(v / 2.5) * 2.5;
  return SAMPLE_NAMES.map((name, i) => {
    const w0 = 74 + rnd() * 22,
      trend = (rnd() - 0.35) * 0.06,
      attendP = 0.72 + rnd() * 0.26;
    const daily: SamplePlayer["daily"] = [];
    for (let k = 41; k >= 0; k--) {
      const date = addDaysUTC(base, -k);
      if (k === 0 && i % 3 === 2) continue; // 今日まだ入力していない選手も用意
      if (rnd() < 0.08 && k > 0) continue; // 入力漏れの日
      const attendance: Attendance = rnd() < attendP ? "出席" : "欠席";
      daily.push({ date, attendance, weight: Number((w0 + trend * (41 - k) + (rnd() - 0.5) * 0.8).toFixed(1)) });
    }
    const b0 = 70 + rnd() * 45,
      s0 = 110 + rnd() * 60,
      d0 = 130 + rnd() * 65;
    const physical: SamplePlayer["physical"] = [];
    for (let k = 5; k >= 0; k--) {
      const g = 5 - k;
      physical.push({
        date: addDaysUTC(base, -k * 14 - 2),
        bench_press: r25(b0 + g * (1 + rnd() * 2.5)),
        squat: r25(s0 + g * (2 + rnd() * 3.5)),
        deadlift: r25(d0 + g * (2 + rnd() * 4)),
      });
    }
    return { name, daily, physical };
  });
}
