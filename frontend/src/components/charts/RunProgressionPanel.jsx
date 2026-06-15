import React, { useState } from 'react'
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useRunProgression } from '../../hooks/useAthleteData'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs space-y-1">
      <p className="text-slate-300 font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || '#94a3b8' }}>
          {p.name}: {typeof p.value === 'number' ? p.value?.toFixed(2) : p.value}
          {p.name === 'distance_km' ? ' km' : p.name === 'duration_min' ? ' min' : p.name === 'pace_min_per_km' ? ' min/km' : p.name === 'avg_hr' ? ' bpm' : ''}
        </p>
      ))}
    </div>
  )
}

export default function RunProgressionPanel() {
  const { data, isLoading } = useRunProgression()
  const [view, setView] = useState('volume')

  if (isLoading) return <Skeleton />

  const weekly = data?.weekly_volume || []
  const z2Trend = data?.z2_pace_trend || []
  const hrAtPace = data?.hr_at_pace_trend || []

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex gap-2">
        {[
          { key: 'volume', label: 'Weekly Volume' },
          { key: 'z2_pace', label: 'Z2 Pace' },
          { key: 'hr_at_pace', label: 'HR @ Pace' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${view === key ? 'bg-orange-500/30 text-orange-300' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'volume' && (
        <>
          <p className="text-xs text-slate-400">Weekly running volume (km) + duration</p>
          <ResponsiveContainer width="100%" height={270}>
            <ComposedChart data={weekly} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" tick={{ fontSize: 9 }} tickFormatter={v => v.slice(5)} interval="preserveStartEnd" />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} unit="km" />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} unit="min" />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar yAxisId="left" dataKey="distance_km" name="distance_km" fill="#f97316" opacity={0.8} />
              <Line yAxisId="right" type="monotone" dataKey="duration_min" name="duration_min" stroke="#fb923c" dot={false} strokeWidth={1} strokeDasharray="4 2" />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-3 gap-3 mt-1">
            {[
              { label: 'Avg 4-week km', value: weekly.slice(-4).reduce((s, w) => s + w.distance_km, 0) / Math.max(1, weekly.slice(-4).length), unit: 'km/wk' },
              { label: 'Peak week', value: Math.max(...weekly.map(w => w.distance_km), 0), unit: 'km' },
              { label: 'Total weeks', value: weekly.length, unit: 'weeks' },
            ].map(s => (
              <div key={s.label} className="bg-slate-800/60 rounded-lg p-3 text-center">
                <p className="text-slate-500 text-xs">{s.label}</p>
                <p className="text-orange-400 font-semibold text-lg">{typeof s.value === 'number' ? s.value.toFixed(1) : s.value}</p>
                <p className="text-slate-500 text-xs">{s.unit}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {view === 'z2_pace' && (
        <>
          <p className="text-xs text-slate-400">Average pace on Z2 runs (lower = faster = fitter)</p>
          <ResponsiveContainer width="100%" height={270}>
            <ComposedChart data={z2Trend} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
              <YAxis
                yAxisId="pace"
                reversed
                tick={{ fontSize: 10 }}
                domain={['auto', 'auto']}
                tickFormatter={v => `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`}
              />
              <YAxis yAxisId="hr" orientation="right" tick={{ fontSize: 10 }} unit="bpm" />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line yAxisId="pace" type="monotone" dataKey="pace_min_per_km" name="pace_min_per_km" stroke="#22c55e" dot={{ r: 3 }} strokeWidth={2} />
              <Line yAxisId="hr" type="monotone" dataKey="hr" name="avg_hr" stroke="#ef4444" dot={false} strokeWidth={1} strokeDasharray="4 2" />
            </ComposedChart>
          </ResponsiveContainer>
          {z2Trend.length >= 2 && (
            <div className="text-xs text-slate-400 bg-slate-800/40 rounded-lg p-3">
              <span className="text-slate-300">Trend: </span>
              {z2Trend[0].date} → {z2Trend[z2Trend.length - 1].date}: pace {z2Trend[0].pace_min_per_km?.toFixed(2)} → {z2Trend[z2Trend.length - 1].pace_min_per_km?.toFixed(2)} min/km
              {' '}
              <span className={(z2Trend[z2Trend.length - 1].pace_min_per_km < z2Trend[0].pace_min_per_km) ? 'text-green-400' : 'text-red-400'}>
                ({(z2Trend[z2Trend.length - 1].pace_min_per_km - z2Trend[0].pace_min_per_km) > 0 ? '+' : ''}{(z2Trend[z2Trend.length - 1].pace_min_per_km - z2Trend[0].pace_min_per_km).toFixed(2)} min/km)
              </span>
            </div>
          )}
        </>
      )}

      {view === 'hr_at_pace' && (
        <>
          <p className="text-xs text-slate-400">Average HR at pace bins by quarter — lower HR = improved aerobic fitness</p>
          {hrAtPace.length ? (
            <div className="overflow-auto flex-1">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-700">
                    <th className="text-left py-1 pr-3">Quarter</th>
                    <th className="text-left py-1 pr-3">Pace bin</th>
                    <th className="text-right py-1 pr-3">Avg HR</th>
                    <th className="text-right py-1">n</th>
                  </tr>
                </thead>
                <tbody>
                  {hrAtPace.map((r, i) => (
                    <tr key={i} className="border-b border-slate-800">
                      <td className="py-1.5 pr-3 text-slate-400">{r.quarter}</td>
                      <td className="py-1.5 pr-3 text-slate-300">{r.pace_bin}</td>
                      <td className="py-1.5 pr-3 text-right">
                        <span className={r.avg_hr < 150 ? 'text-green-400' : r.avg_hr < 165 ? 'text-yellow-400' : 'text-red-400'}>
                          {r.avg_hr}
                        </span>
                      </td>
                      <td className="py-1.5 text-right text-slate-500">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty text="Not enough Z2 running data yet." />
          )}
        </>
      )}
    </div>
  )
}

const Skeleton = () => (
  <div className="space-y-3 animate-pulse">
    <div className="h-6 w-48 bg-slate-800 rounded" />
    <div className="h-48 bg-slate-800 rounded" />
  </div>
)
const Empty = ({ text }) => (
  <div className="flex items-center justify-center h-32 text-slate-500 text-sm">{text}</div>
)
