import React, { useState } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LineChart, Line,
} from 'recharts'
import { usePaceHR } from '../../hooks/useAthleteData'

const PERIOD_COLORS = {
  'Q1': '#818cf8',
  'Q2': '#34d399',
  'Q3': '#fbbf24',
  'Q4': '#f87171',
}

function colorForPeriod(period) {
  if (!period) return '#64748b'
  const q = period.split('-')[1]
  return PERIOD_COLORS[q] || '#64748b'
}

function openActivity(activityId) {
  if (activityId) window.open(`https://intervals.icu/activities/${activityId}`, '_blank')
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  const paceFloor = Math.floor(d?.pace_min_per_km)
  const paceSecs = Math.round((d?.pace_min_per_km - paceFloor) * 60)
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs space-y-1">
      <p className="text-slate-400">Pace: <span className="text-green-400 font-semibold">{paceFloor}:{String(paceSecs).padStart(2, '0')} /km</span></p>
      <p className="text-slate-400">HR: <span className="text-red-400">{d?.hr} bpm</span></p>
      <p className="text-slate-400">Period: <span className="text-slate-200">{d?.period}</span></p>
      <p className="text-slate-400">Date: <span className="text-slate-200">{d?.date}</span></p>
      {d?.activity_id && <p className="text-slate-600 mt-1">Click dot to open activity</p>}
    </div>
  )
}

const makeShape = (color, activityId) => ({ cx, cy }) => (
  <circle
    cx={cx} cy={cy} r={3}
    fill={color}
    fillOpacity={0.65}
    style={{ cursor: activityId ? 'pointer' : 'default' }}
  />
)

export default function PaceHRPanel() {
  const { data, isLoading } = usePaceHR()
  const [selectedPeriod, setSelectedPeriod] = useState(null)

  if (isLoading) return <Skeleton />

  const allSegments = data?.segments || []
  const regression = data?.regression_by_period || []
  const efficiency = data?.efficiency_trend || []

  const periods = [...new Set(allSegments.map(s => s.period))].sort()
  const displayPeriods = periods.slice(-8)

  const filtered = selectedPeriod
    ? allSegments.filter(s => s.period === selectedPeriod)
    : allSegments.filter(s => displayPeriods.includes(s.period))

  return (
    <div className="flex flex-col gap-4 h-full">
      <div>
        <p className="text-xs text-slate-400 mb-2">
          Pace vs HR per 1-min segment — lower HR at same pace = improved fitness — click dot to open activity
        </p>
        <div className="flex gap-1.5 flex-wrap mb-2">
          <button
            onClick={() => setSelectedPeriod(null)}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${!selectedPeriod ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            All recent
          </button>
          {displayPeriods.map(p => (
            <button
              key={p}
              onClick={() => setSelectedPeriod(selectedPeriod === p ? null : p)}
              className="px-2 py-0.5 rounded text-xs font-medium transition-colors"
              style={{
                background: selectedPeriod === p ? colorForPeriod(p) + '40' : 'transparent',
                color: colorForPeriod(p),
                border: `1px solid ${colorForPeriod(p)}60`,
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <ScatterChart margin={{ top: 8, right: 16, left: -20, bottom: 16 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="pace_min_per_km"
            name="Pace"
            type="number"
            domain={[3.5, 9]}
            tick={{ fontSize: 10 }}
            tickFormatter={v => `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`}
            label={{ value: 'Pace (min/km)', position: 'insideBottom', offset: -8, fontSize: 10, fill: '#64748b' }}
          />
          <YAxis
            dataKey="hr"
            name="HR"
            tick={{ fontSize: 10 }}
            unit=" bpm"
            domain={[100, 185]}
          />
          <ZAxis range={[12, 12]} />
          <Tooltip content={<CustomTooltip />} />
          {(selectedPeriod ? [selectedPeriod] : displayPeriods).map(p => {
            const pts = filtered.filter(s => s.period === p)
            const c = colorForPeriod(p)
            return (
              <Scatter
                key={p}
                name={p}
                data={pts}
                fill={c}
                opacity={0.65}
                shape={({ cx, cy, payload }) => (
                  <circle
                    cx={cx} cy={cy} r={3}
                    fill={c}
                    fillOpacity={0.65}
                    style={{ cursor: payload?.activity_id ? 'pointer' : 'default' }}
                    onClick={() => openActivity(payload?.activity_id)}
                  />
                )}
              />
            )
          })}
        </ScatterChart>
      </ResponsiveContainer>

      {/* Efficiency trend */}
      {efficiency.length > 1 && (
        <>
          <p className="text-xs text-slate-400">
            Aerobic efficiency trend (HR / pace-unit) — lower = more efficient
          </p>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={efficiency} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
              <Tooltip formatter={v => v?.toFixed(2)} />
              <Line type="monotone" dataKey="hr_per_pace_unit" stroke="#22c55e" dot={{ r: 3 }} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}

      {/* Regression table */}
      {regression.length > 0 && (
        <div className="overflow-auto">
          <p className="text-xs text-slate-500 mb-1">Linear regression (HR = slope × pace + intercept) per period</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-700">
                <th className="text-left py-1 pr-3">Period</th>
                <th className="text-right py-1 pr-3">Slope</th>
                <th className="text-right py-1 pr-3">Intercept</th>
                <th className="text-right py-1">R²</th>
              </tr>
            </thead>
            <tbody>
              {regression.slice(-8).map((r, i) => (
                <tr key={i} className="border-b border-slate-800">
                  <td className="py-1.5 pr-3" style={{ color: colorForPeriod(r.period) }}>{r.period}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-300">{r.slope?.toFixed(2)}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-300">{r.intercept?.toFixed(1)}</td>
                  <td className="py-1.5 text-right text-slate-400">{r.r2?.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const Skeleton = () => (
  <div className="space-y-3 animate-pulse">
    <div className="h-6 w-64 bg-slate-800 rounded" />
    <div className="h-48 bg-slate-800 rounded" />
  </div>
)
