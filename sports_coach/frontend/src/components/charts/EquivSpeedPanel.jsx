import React, { useMemo } from 'react'
import {
  ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Line, Brush,
} from 'recharts'
import { useEquivSpeed } from '../../hooks/useAthleteData'

const YEAR_COLORS = {
  '2015': '#475569', '2016': '#64748b', '2017': '#7c8fa0',
  '2018': '#94a3b8', '2019': '#cbd5e1', '2020': '#38bdf8',
  '2021': '#34d399', '2022': '#fbbf24', '2023': '#f87171',
  '2024': '#a78bfa', '2025': '#fb923c', '2026': '#4ade80',
}
const DEFAULT_COLOR = '#94a3b8'

function yearOf(d) { return String(d || '').slice(0, 4) }
function colorFor(d) { return YEAR_COLORS[yearOf(d)] || DEFAULT_COLOR }

function openActivity(id) {
  if (id) window.open(`https://intervals.icu/activities/${id}`, '_blank')
}

function fmtTs(ts) {
  const d = new Date(ts)
  return `${d.toLocaleString('default', { month: 'short' })} '${String(d.getFullYear()).slice(2)}`
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d?.activity_id) return null   // hovering rolling avg only — skip
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs space-y-1 shadow-xl">
      <p className="font-medium" style={{ color: colorFor(d.date) }}>{d.date}</p>
      <p className="text-slate-300 truncate max-w-[200px]">{d.activity_name}</p>
      <p className="text-slate-400">ES: <span className="text-emerald-400 font-semibold">{d.es_kmh} km/h</span></p>
      <p className="text-slate-400">Avg speed: <span className="text-slate-200">{d.avg_speed_kmh} km/h</span></p>
      <p className="text-slate-400">ES − avg: <span className={d.es_kmh - d.avg_speed_kmh >= 0 ? 'text-blue-300' : 'text-slate-500'}>
        +{(d.es_kmh - d.avg_speed_kmh).toFixed(2)} km/h
      </span></p>
      {d.distance_km && <p className="text-slate-400">Distance: <span className="text-slate-200">{d.distance_km} km</span></p>}
      <p className="text-slate-600 mt-1">Click dot to open activity</p>
    </div>
  )
}

const ActivityDot = (props) => {
  const { cx, cy, payload } = props
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

export default function EquivSpeedPanel() {
  const { data, isLoading } = useEquivSpeed()
  const activities = data?.activities || []

  const brushStart = useMemo(() => Math.max(0, activities.length - 60), [activities.length])

  const allYears = useMemo(
    () => [...new Set(activities.map(a => yearOf(a.date)))].sort(),
    [activities]
  )

  if (isLoading) return <Skeleton />
  if (!activities.length) return (
    <p className="text-slate-500 text-xs pt-4">No cycling activities with stream data found.</p>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-xs text-slate-400">
          ES = Σv² / Σv — faster segments weighted more than slower ones · click dot to open activity
        </p>
        <div className="flex gap-3 flex-wrap">
          {allYears.map(y => {
            const c = YEAR_COLORS[y] || DEFAULT_COLOR
            return (
              <div key={y} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: c }} />
                <span className="text-xs" style={{ color: c }}>{y}</span>
              </div>
            )
          })}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={activities} margin={{ top: 8, right: 24, left: -10, bottom: 8 }}>
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
            unit=" km/h"
            domain={['auto', 'auto']}
            width={60}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Rolling average trend line */}
          <Line
            dataKey="rolling_avg_es"
            stroke="#64748b"
            strokeWidth={2}
            dot={false}
            activeDot={false}
            type="monotone"
            name="8-ride avg"
          />

          {/* Individual activity dots — transparent connecting line, custom dots */}
          <Line
            dataKey="es_kmh"
            stroke="transparent"
            strokeWidth={0}
            dot={<ActivityDot />}
            activeDot={false}
            type="linear"
            name="ES"
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

      <p className="text-xs text-slate-600 flex-none">
        ES (Lee Naish) — grey line: {8}-ride rolling average · {activities.length} activities total
      </p>
    </div>
  )
}

const Skeleton = () => (
  <div className="space-y-3 animate-pulse h-full">
    <div className="h-4 w-80 bg-slate-800 rounded" />
    <div className="flex-1 h-full bg-slate-800 rounded" />
  </div>
)
