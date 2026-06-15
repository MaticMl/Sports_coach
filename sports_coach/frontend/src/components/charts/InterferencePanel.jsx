import React, { useState } from 'react'
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Brush,
} from 'recharts'
import { useInterference } from '../../hooks/useAthleteData'

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs space-y-1">
      <p className="text-slate-300 font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || '#94a3b8' }}>
          {p.name}: {typeof p.value === 'number' ? p.value?.toFixed(1) : p.value}
        </p>
      ))}
    </div>
  )
}

const BRUSH_PROPS = {
  height: 22,
  stroke: '#334155',
  fill: '#1e293b',
  travellerWidth: 6,
}

export default function InterferencePanel() {
  const { data, isLoading } = useInterference()
  const [view, setView] = useState('hrv')

  if (isLoading) return <Skeleton />

  const hrv = data?.hrv_load_correlation || []
  const sleep = data?.sleep_load_correlation || []
  const balance = data?.weekly_load_balance || []
  const impact = data?.hard_cycle_run_impact || []

  const hrvBrushStart = Math.max(0, hrv.length - 90)
  const sleepBrushStart = Math.max(0, sleep.filter(s => s.sleep_score != null).length - 90)
  const balBrushStart = Math.max(0, balance.length - 52)

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'hrv', label: 'HRV + Load' },
          { key: 'sleep', label: 'Sleep + Load' },
          { key: 'balance', label: 'Load Balance' },
          { key: 'impact', label: 'Cycle → Run' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${view === key ? 'bg-purple-500/30 text-purple-300' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'hrv' && (
        <>
          <p className="text-xs text-slate-400">Daily HRV vs rolling 7-day training load</p>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={hrv} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" hide={hrv.length > 60} />
              <YAxis yAxisId="hrv" tick={{ fontSize: 10 }} unit="ms" />
              <YAxis yAxisId="load" orientation="right" tick={{ fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line yAxisId="hrv" type="monotone" dataKey="hrv" name="HRV (ms)" stroke="#a78bfa" dot={false} strokeWidth={2} />
              <Bar yAxisId="load" dataKey="rolling_7d_load" name="7d Load" fill="#6366f1" opacity={0.4} />
              <Brush dataKey="date" {...BRUSH_PROPS} startIndex={hrvBrushStart} />
            </ComposedChart>
          </ResponsiveContainer>
          {hrv.length > 0 && (
            <div className="text-xs text-slate-500 bg-slate-800/40 rounded p-2">
              HRV dips after high-load weeks are expected — sustained drops indicate overreaching.
            </div>
          )}
        </>
      )}

      {view === 'sleep' && (() => {
        const sleepWithScore = sleep.filter(s => s.sleep_score != null)
        const sleepWithHours = sleep.filter(s => s.sleep_hours != null)
        return (
          <>
            <p className="text-xs text-slate-400">Sleep score vs rolling 7-day training load</p>
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={sleepWithScore} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" hide={sleepWithScore.length > 60} />
                <YAxis yAxisId="sleep" tick={{ fontSize: 10 }} domain={[0, 100]} />
                <YAxis yAxisId="load" orientation="right" tick={{ fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line yAxisId="sleep" type="monotone" dataKey="sleep_score" name="Sleep Score" stroke="#34d399" dot={false} strokeWidth={2} />
                <Bar yAxisId="load" dataKey="rolling_7d_load" name="7d Load" fill="#6366f1" opacity={0.4} />
                <Brush dataKey="date" {...BRUSH_PROPS} startIndex={sleepBrushStart} />
              </ComposedChart>
            </ResponsiveContainer>
            {sleepWithHours.length > 0 && (
              <>
                <p className="text-xs text-slate-400">Sleep hours trend</p>
                <ResponsiveContainer width="100%" height={80}>
                  <ComposedChart data={sleepWithHours} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                    <XAxis dataKey="date" tick={false} />
                    <YAxis tick={{ fontSize: 9 }} domain={[4, 10]} unit="h" />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="sleep_hours" name="Sleep Hours" stroke="#6ee7b7" dot={false} strokeWidth={1.5} />
                  </ComposedChart>
                </ResponsiveContainer>
              </>
            )}
          </>
        )
      })()}

      {view === 'balance' && (
        <>
          <p className="text-xs text-slate-400">Weekly training load: Run vs Ride (TRIMP-based)</p>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={balance} margin={{ top: 4, right: 8, left: -20, bottom: 4 }} barSize={12}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" tick={{ fontSize: 9 }} tickFormatter={v => v.slice(5)} interval={3} hide={balance.length > 40} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="run_load" name="Run Load" stackId="a" fill="#f97316" />
              <Bar dataKey="ride_load" name="Ride Load" stackId="a" fill="#3b82f6" />
              <Brush dataKey="week" {...BRUSH_PROPS} startIndex={balBrushStart} />
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}

      {view === 'impact' && (
        <>
          <p className="text-xs text-slate-400">Runs within 3 days of a hard cycling session (load &gt;80)</p>
          {impact.length ? (
            <div className="overflow-auto flex-1">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-700">
                    <th className="text-left py-1 pr-2">Cycle date</th>
                    <th className="text-right py-1 pr-2">Load</th>
                    <th className="text-left py-1 pr-2">Run date</th>
                    <th className="text-right py-1 pr-2">Days after</th>
                    <th className="text-right py-1 pr-2">Pace</th>
                    <th className="text-right py-1">Avg HR</th>
                  </tr>
                </thead>
                <tbody>
                  {impact.slice().reverse().map((r, i) => (
                    <tr key={i} className="border-b border-slate-800">
                      <td className="py-1.5 pr-2 text-slate-400">{r.cycle_date}</td>
                      <td className="py-1.5 pr-2 text-right">
                        <span className={r.cycle_load > 120 ? 'text-red-400' : 'text-orange-400'}>{r.cycle_load}</span>
                      </td>
                      <td className="py-1.5 pr-2 text-slate-300">{r.run_date}</td>
                      <td className="py-1.5 pr-2 text-right text-slate-400">{r.days_after}d</td>
                      <td className="py-1.5 pr-2 text-right text-slate-300">{r.run_pace_min_km}</td>
                      <td className="py-1.5 text-right text-red-400">{r.run_avg_hr}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
              No hard cycling → run impact instances detected.
            </div>
          )}
        </>
      )}
    </div>
  )
}

const Skeleton = () => (
  <div className="space-y-3 animate-pulse">
    <div className="flex gap-2">
      {[1,2,3,4].map(i => <div key={i} className="h-7 w-24 bg-slate-800 rounded" />)}
    </div>
    <div className="h-48 bg-slate-800 rounded" />
  </div>
)
