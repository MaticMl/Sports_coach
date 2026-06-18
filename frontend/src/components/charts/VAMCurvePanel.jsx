import React, { useState, useMemo } from 'react'
import {
  ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Line, Brush,
} from 'recharts'
import { useVAMCurve } from '../../hooks/useAthleteData'

const YEAR_COLORS = {
  '2015': '#475569', '2016': '#64748b', '2017': '#7c8fa0',
  '2018': '#94a3b8', '2019': '#cbd5e1', '2020': '#38bdf8',
  '2021': '#34d399', '2022': '#fbbf24', '2023': '#f87171',
  '2024': '#a78bfa', '2025': '#fb923c', '2026': '#4ade80',
}
const DEFAULT_COLOR = '#94a3b8'
const ROLL_WINDOW = 5

function yearOf(d) { return String(d || '').slice(0, 4) }
function colorFor(d) { return YEAR_COLORS[yearOf(d)] || DEFAULT_COLOR }
function openActivity(id) { if (id) window.open(`https://intervals.icu/activities/${id}`, '_blank') }
function fmtTs(ts) {
  const d = new Date(ts)
  return `${d.toLocaleString('default', { month: 'short' })} '${String(d.getFullYear()).slice(2)}`
}

const ActivityDot = ({ cx, cy, payload }) => {
  if (cx == null || cy == null) return null
  return (
    <circle
      cx={cx} cy={cy} r={4}
      fill={colorFor(payload?.date)}
      fillOpacity={0.85}
      stroke="rgba(255,255,255,0.15)"
      strokeWidth={1}
      style={{ cursor: 'pointer' }}
      onClick={() => openActivity(payload?.activity_id)}
    />
  )
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d?.activity_id) return null
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs space-y-1 shadow-xl">
      <p className="font-medium" style={{ color: colorFor(d.date) }}>{d.date}</p>
      <p className="text-slate-300 truncate max-w-[200px]">{d.name}</p>
      <p className="text-slate-400">VAM: <span className="text-orange-400 font-semibold">{d.vam?.toFixed(0)} m/h</span></p>
      {d.rolling_avg != null && (
        <p className="text-slate-400">{ROLL_WINDOW}-ride avg: <span className="text-slate-300">{d.rolling_avg?.toFixed(0)} m/h</span></p>
      )}
      <p className="text-slate-600 mt-1">Click to open activity</p>
    </div>
  )
}

export default function VAMCurvePanel() {
  const { data, isLoading } = useVAMCurve()
  const [selectedIdx, setSelectedIdx] = useState(4) // default: 10 min

  const shortLabels = data?.interval_short ?? []
  const fullLabels  = data?.interval_labels ?? []
  const allActs     = data?.activities ?? []

  // Filter to activities that have data for the selected interval
  const chartData = useMemo(() => {
    const filtered = allActs
      .map(a => ({ ...a, vam: a.vam_peaks?.[selectedIdx] ?? null }))
      .filter(a => a.vam != null && a.vam > 0)

    // Rolling average
    let runSum = 0, runCount = 0
    const window = []
    return filtered.map(a => {
      window.push(a.vam)
      runSum += a.vam
      if (window.length > ROLL_WINDOW) runSum -= window.shift()
      runCount = window.length
      return { ...a, rolling_avg: runSum / runCount }
    })
  }, [allActs, selectedIdx])

  const allYears = useMemo(
    () => [...new Set(chartData.map(a => yearOf(a.date)))].sort(),
    [chartData]
  )

  const brushStart = useMemo(() => Math.max(0, chartData.length - 60), [chartData.length])

  if (isLoading) return <Skeleton />
  if (!allActs.length) return (
    <p className="text-slate-500 text-xs pt-4">No cycling activities with altitude data found.</p>
  )

  return (
    <div className="flex flex-col gap-3">
      {/* Interval selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {shortLabels.map((label, i) => (
            <button
              key={i}
              onClick={() => setSelectedIdx(i)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                i === selectedIdx
                  ? 'bg-orange-500/30 text-orange-300 ring-1 ring-orange-500/50'
                  : 'text-slate-400 hover:text-slate-200 bg-slate-800/40'
              }`}
              title={fullLabels[i]}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-3 flex-wrap ml-auto">
          {allYears.map(y => {
            const c = YEAR_COLORS[y] || DEFAULT_COLOR
            return (
              <div key={y} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ background: c }} />
                <span className="text-xs" style={{ color: c }}>{y}</span>
              </div>
            )
          })}
        </div>
      </div>

      {chartData.length === 0 ? (
        <p className="text-slate-500 text-xs py-8 text-center">
          No rides long enough for the {fullLabels[selectedIdx]} interval.
        </p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 24, left: -10, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="ts"
                type="number"
                scale="time"
                domain={['auto', 'auto']}
                tickCount={7}
                tickFormatter={fmtTs}
                tick={{ fontSize: 10, fill: '#64748b' }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#64748b' }}
                unit=" m/h"
                domain={['auto', 'auto']}
                width={65}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                dataKey="rolling_avg"
                stroke="#64748b"
                strokeWidth={2}
                dot={false}
                activeDot={false}
                type="monotone"
                name={`${ROLL_WINDOW}-ride avg`}
              />
              <Line
                dataKey="vam"
                stroke="transparent"
                strokeWidth={0}
                dot={<ActivityDot />}
                activeDot={false}
                type="linear"
                name="VAM"
                isAnimationActive={false}
              />
              <Brush
                dataKey="ts"
                height={22}
                stroke="#334155"
                fill="#1e293b"
                travellerWidth={6}
                startIndex={brushStart}
                tickFormatter={fmtTs}
              />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-xs text-slate-600">
            Best VAM over any {fullLabels[selectedIdx]} window per ride
            &nbsp;·&nbsp; grey line: {ROLL_WINDOW}-ride rolling average
            &nbsp;·&nbsp; {chartData.length} rides shown
          </p>
        </>
      )}
    </div>
  )
}

const Skeleton = () => (
  <div className="space-y-3 animate-pulse">
    <div className="flex gap-1">{Array(12).fill(0).map((_, i) => <div key={i} className="h-6 w-8 bg-slate-800 rounded" />)}</div>
    <div className="h-64 bg-slate-800 rounded" />
  </div>
)
