import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Result = { attemptId: number; examTitle: string; scorePercent: number; submittedAt: string };

/** Score (%) over time, oldest to newest. */
export function ScoreTrend({ results, height = 180, showAxes = false }: { results: Result[]; height?: number; showAxes?: boolean }) {
  const data = results.map((r, i) => ({ n: i + 1, score: Number(r.scorePercent), title: r.examTitle }));
  if (data.length === 1) data.unshift({ n: 0, score: data[0].score, title: data[0].title });
  const average = Math.round(data.reduce((s, d) => s + d.score, 0) / data.length);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 6, left: showAxes ? -18 : 0, bottom: 0 }}>
          <defs>
            <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="n" hide={!showAxes} tickLine={false} axisLine={false} fontSize={11} />
          <YAxis domain={[0, 100]} hide={!showAxes} tickLine={false} axisLine={false} fontSize={11} width={40} unit="%" />
          <ReferenceLine y={average} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeOpacity={0.5} />
          <Tooltip
            cursor={false}
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
            formatter={(value: any) => [`${value}%`, "Score"]}
            labelFormatter={(_l: any, payload: any) => payload?.[0]?.payload?.title ?? ""}
          />
          <Area type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#scoreFill)" dot={{ r: 3 }} activeDot={{ r: 5 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
