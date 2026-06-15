import React from 'react'
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useWellness } from '../hooks/useAthleteData'

const MiniChart = ({ data, dataKey, color, unit, label, domain, reversed }) => (
  <div>
    <p className="text-xs text-slate-500 mb-1">{label}</p>
    <ResponsiveContainer width="100%" height={80}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tick={false} />
        <YAxis tick={{ fontSize: 9 }} domain={domain || ['auto', 'auto']} reversed={reversed} unit={unit || ''} />
        <Tooltip
          content={({ active, payload, label: l }) => active && payload?.length ? (
            <div className="bg-slate-800 border border-slate-600 rounded p-2 text-xs">
              <p className="text-slate-400">{l}</p>
              <p style={{ color }}>{payload[0]?.value?.toFixed(1)}{unit || ''}</p>
            </div>
          ) : null}
        />
        <Line type="monotone" dataKey={dataKey} stroke={color} dot={false} strokeWidth={2} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  </div>
)

export default function WellnessPanel() {
  const { data, isLoading } = useWellness()

  if (isLoading) return (
    <div className="grid grid-cols-3 gap-4 animate-pulse">
      {[1,2,3].map(i => <div key={i} className="h-24 bg-slate-800 rounded" />)}
    </div>
  )

  const daily = data?.daily?.slice(-14) || []

  if (!daily.length) return (
    <div className="text-slate-500 text-sm flex items-center justify-center h-16">
      No wellness data available. Sync with intervals.icu first.
    </div>
  )

  // Stats
  const hrvVals = daily.filter(d => d.hrv != null).map(d => d.hrv)
  const sleepVals = daily.filter(d => d.sleep_score != null).map(d => d.sleep_score)
  const weightVals = daily.filter(d => d.weight_kg != null).map(d => d.weight_kg)

  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null
  const latest = arr => arr.length ? arr[arr.length - 1] : null

  const stats = [
    { label: 'HRV (latest)', value: latest(hrvVals), unit: 'ms', color: '#a78bfa', good: v => v > avg(hrvVals) * 0.95 },
    { label: 'Sleep Score (avg 7d)', value: avg(sleepVals.slice(-7)), unit: '', color: '#34d399', good: v => v > 75 },
    { label: 'Weight (latest)', value: latest(weightVals), unit: 'kg', color: '#fbbf24', good: () => true },
    { label: 'Resting HR (latest)', value: latest(daily.filter(d => d.resting_hr != null).map(d => d.resting_hr)), unit: 'bpm', color: '#f87171', good: v => v < 55 },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Stat chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.label} className="bg-slate-800/60 rounded-lg p-3">
            <p className="text-slate-500 text-xs">{s.label}</p>
            <p className="font-semibold text-xl mt-0.5" style={{ color: s.color }}>
              {s.value != null ? s.value.toFixed(1) : '—'}
              <span className="text-xs ml-1 font-normal text-slate-500">{s.unit}</span>
            </p>
          </div>
        ))}
      </div>

      {/* Mini charts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniChart data={daily} dataKey="hrv" color="#a78bfa" unit=" ms" label="HRV (14d)" />
        <MiniChart data={daily} dataKey="sleep_score" color="#34d399" unit="" label="Sleep Score (14d)" domain={[0, 100]} />
        <MiniChart data={daily} dataKey="weight_kg" color="#fbbf24" unit=" kg" label="Weight (14d)" />
        <MiniChart data={daily} dataKey="resting_hr" color="#f87171" unit=" bpm" label="Resting HR (14d)" reversed />
      </div>
    </div>
  )
}
