import React from 'react'
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Legend,
} from 'recharts'
import { useReadiness } from '../../hooks/useAthleteData'

const readinessColor = (score) => {
  if (score == null) return '#94a3b8'
  if (score >= 70) return '#34d399'
  if (score >= 40) return '#fbbf24'
  return '#f87171'
}

const acwrZone = (ratio) => {
  if (ratio == null) return { label: '—',        color: '#94a3b8' }
  if (ratio < 0.8)  return { label: 'Low load',  color: '#94a3b8' }
  if (ratio <= 1.3) return { label: 'Optimal',   color: '#34d399' }
  return               { label: 'Above optimal', color: '#f87171' }
}

function ComponentBar({ label, value, color }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span style={{ color }}>{value != null ? Math.round(value) : '—'}</span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${value ?? 0}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

export default function ReadinessPanel() {
  const { data, isLoading } = useReadiness()

  if (isLoading) return <div className="h-64 bg-slate-800 rounded animate-pulse" />

  const today = data?.today
  const daily = (data?.daily ?? []).slice(-60)

  const rColor   = readinessColor(today?.readiness)
  const acwrInfo = acwrZone(today?.acwr)

  return (
    <div className="flex flex-col gap-4">
      {/* Summary chips */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800/60 rounded-lg p-3">
          <p className="text-slate-500 text-xs">Readiness Score</p>
          <p className="font-semibold text-3xl mt-0.5" style={{ color: rColor }}>
            {today?.readiness != null ? Math.round(today.readiness) : '—'}
            <span className="text-sm font-normal text-slate-500 ml-1">/100</span>
          </p>
        </div>
        <div className="bg-slate-800/60 rounded-lg p-3">
          <p className="text-slate-500 text-xs">Workload Ratio (ACWR)</p>
          <p className="font-semibold text-3xl mt-0.5" style={{ color: acwrInfo.color }}>
            {today?.acwr != null ? today.acwr.toFixed(2) : '—'}
            <span className="text-xs font-normal ml-2" style={{ color: acwrInfo.color }}>
              {acwrInfo.label}
            </span>
          </p>
        </div>
      </div>

      {/* Component bars */}
      <div className="flex gap-4">
        <ComponentBar label="HRV"        value={today?.hrv_score}   color="#a78bfa" />
        <ComponentBar label="Sleep"      value={today?.sleep_score} color="#34d399" />
        <ComponentBar label="Resting HR" value={today?.rhr_score}   color="#f87171" />
      </div>

      {/* 60-day trend */}
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={daily} margin={{ top: 4, right: 36, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            tickFormatter={d => d.slice(5)}
            interval="preserveStartEnd"
          />
          <YAxis yAxisId="r" domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
          <YAxis yAxisId="a" orientation="right" domain={[0, 2.5]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
          <ReferenceLine yAxisId="a" y={0.8} stroke="#94a3b8" strokeDasharray="4 2" strokeOpacity={0.6} />
          <ReferenceLine yAxisId="a" y={1.3} stroke="#f87171" strokeDasharray="4 2" strokeOpacity={0.6} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#94a3b8' }}
            formatter={(v, name) => [
              v == null ? '—' : name === 'ACWR' ? v.toFixed(2) : Math.round(v),
              name,
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
            formatter={v => <span style={{ color: '#94a3b8' }}>{v}</span>} />
          <Line yAxisId="r" type="monotone" dataKey="readiness" name="Readiness"
            stroke="#a78bfa" strokeWidth={2} dot={false} connectNulls />
          <Line yAxisId="a" type="monotone" dataKey="acwr" name="ACWR"
            stroke="#fbbf24" strokeWidth={2} dot={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>

      <p className="text-slate-600 text-xs">
        Readiness = 40% HRV + 35% Sleep + 25% Resting HR vs 7-day baseline
        &nbsp;·&nbsp; ACWR: &lt;0.8 low, 0.8–1.3 optimal, &gt;1.3 above optimal
      </p>
    </div>
  )
}
