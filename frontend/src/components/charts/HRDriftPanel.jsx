import React, { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend, ScatterChart, Scatter, ZAxis,
} from 'recharts'
import { useHRDrift } from '../../hooks/useAthleteData'

const ZONE_COLORS = ['#64748b', '#22c55e', '#eab308', '#f97316', '#ef4444']

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs space-y-1">
      <p className="text-slate-300 font-medium">{d?.date} — {d?.name}</p>
      <p className="text-slate-400">Sport: <span className="text-white">{d?.sport}</span></p>
      <p className="text-slate-400">Duration: <span className="text-white">{d?.duration_min} min</span></p>
      <p className="text-slate-400">Avg HR: <span className="text-white">{d?.avg_hr} bpm</span></p>
      <p className="text-slate-400">HR Drift: <span className={d?.hr_drift_pct > 8 ? 'text-red-400' : 'text-green-400'}>{d?.hr_drift_pct > 0 ? '+' : ''}{d?.hr_drift_pct?.toFixed(1)}%</span></p>
      <p className="text-slate-400">Decoupling: <span className={Math.abs(d?.decoupling_pct) > 5 ? 'text-orange-400' : 'text-green-400'}>{d?.decoupling_pct?.toFixed(1)}%</span></p>
    </div>
  )
}

const SessionChart = ({ session }) => {
  if (!session?.segments?.length) return null
  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={session.segments} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="seg" tick={false} />
        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
        <Tooltip content={({ active, payload }) => active && payload?.length ? (
          <div className="bg-slate-800 border border-slate-600 rounded p-2 text-xs">
            <p className="text-green-400">{payload[0]?.value?.toFixed(0)} bpm</p>
          </div>
        ) : null} />
        <Line type="monotone" dataKey="hr" stroke="#22c55e" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  )
}

export default function HRDriftPanel() {
  const { data, isLoading } = useHRDrift()
  const [selectedIdx, setSelectedIdx] = useState(null)

  if (isLoading) return <Skeleton />
  const activities = data?.activities || []
  const trend = data?.trend || []

  if (!activities.length) return <Empty text="No Z2 sessions with HR stream data yet." />

  const selected = selectedIdx !== null ? activities[selectedIdx] : activities[activities.length - 1]

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Trend scatter: date vs drift */}
      <div>
        <p className="text-xs text-slate-400 mb-1">HR drift trend (all Z2 sessions) — &lt;5% = well-paced</p>
        <ResponsiveContainer width="100%" height={120}>
          <ScatterChart margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" type="category" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis dataKey="drift_pct" tick={{ fontSize: 10 }} unit="%" />
            <ZAxis range={[40, 40]} />
            <ReferenceLine y={5} stroke="#eab308" strokeDasharray="4 2" label={{ value: '5%', fill: '#eab308', fontSize: 9 }} />
            <ReferenceLine y={10} stroke="#ef4444" strokeDasharray="4 2" />
            <Tooltip content={<CustomTooltip />} />
            <Scatter
              data={trend.filter(t => t.sport === 'Run')}
              fill="#f97316"
              name="Run"
            />
            <Scatter
              data={trend.filter(t => t.sport === 'Ride')}
              fill="#3b82f6"
              name="Ride"
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Recent Z2 sessions table */}
      <div className="flex-1 overflow-auto">
        <p className="text-xs text-slate-400 mb-2">Recent Z2 sessions — click to see HR segment profile</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-slate-700">
              <th className="text-left py-1 pr-3">Date</th>
              <th className="text-left py-1 pr-3">Sport</th>
              <th className="text-right py-1 pr-3">HR</th>
              <th className="text-right py-1 pr-3">Z2%</th>
              <th className="text-right py-1 pr-3">Drift</th>
              <th className="text-right py-1">Decouple</th>
            </tr>
          </thead>
          <tbody>
            {activities.slice(-12).reverse().map((a, i) => {
              const idx = activities.length - 1 - i
              const isSelected = selectedIdx === idx || (selectedIdx === null && idx === activities.length - 1)
              const driftBad = a.hr_drift_pct > 8
              const decoupleBad = Math.abs(a.decoupling_pct) > 5
              return (
                <tr
                  key={a.id}
                  onClick={() => setSelectedIdx(idx)}
                  className={`border-b border-slate-800 cursor-pointer transition-colors ${isSelected ? 'bg-slate-700/40' : 'hover:bg-slate-800/40'}`}
                >
                  <td className="py-1.5 pr-3 text-slate-300">{a.date}</td>
                  <td className="py-1.5 pr-3">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${a.sport === 'Run' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}`}>
                      {a.sport}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-right text-slate-300">{a.avg_hr}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-300">{Math.round(a.z2_fraction * 100)}%</td>
                  <td className={`py-1.5 pr-3 text-right font-medium ${driftBad ? 'text-red-400' : 'text-green-400'}`}>
                    {a.hr_drift_pct > 0 ? '+' : ''}{a.hr_drift_pct?.toFixed(1)}%
                  </td>
                  <td className={`py-1.5 text-right font-medium ${decoupleBad ? 'text-orange-400' : 'text-green-400'}`}>
                    {a.decoupling_pct?.toFixed(1)}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Selected session HR segment chart */}
      {selected && (
        <div>
          <p className="text-xs text-slate-400 mb-1">{selected.date} — {selected.name} (HR across segments)</p>
          <SessionChart session={selected} />
        </div>
      )}
    </div>
  )
}

const Skeleton = () => (
  <div className="space-y-3 animate-pulse">
    {[1, 2, 3].map(i => <div key={i} className="h-8 bg-slate-800 rounded" />)}
  </div>
)

const Empty = ({ text }) => (
  <div className="flex items-center justify-center h-full text-slate-500 text-sm">{text}</div>
)
