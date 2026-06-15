import React, { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell, PieChart, Pie, Brush,
} from 'recharts'
import { useIntensity } from '../../hooks/useAthleteData'

const ZONE_COLORS = ['#64748b', '#22c55e', '#eab308', '#f97316', '#ef4444']
const ZONE_LABELS = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5']

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs space-y-1">
      <p className="text-slate-300 font-medium">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {p.value?.toFixed(0)} min
        </p>
      ))}
    </div>
  )
}

const RADIAN = Math.PI / 180
const PieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, pct, name }) => {
  if (pct < 3) return null
  const r = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + r * Math.cos(-midAngle * RADIAN)
  const y = cy + r * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11}>
      {`${pct}%`}
    </text>
  )
}

export default function IntensityDistributionPanel() {
  const { data, isLoading } = useIntensity()
  const [view, setView] = useState('weekly')
  const [brushIdx, setBrushIdx] = useState(null)

  if (isLoading) return <Skeleton />
  const weekly = data?.weekly || []
  const overall = data?.overall || []
  const zoneNames = data?.zone_names || ZONE_LABELS

  if (!weekly.length) return <Empty text="No activity data with HR streams yet." />

  const defaultStart = Math.max(0, weekly.length - 16)
  const startIdx = brushIdx?.startIndex ?? defaultStart
  const endIdx = brushIdx?.endIndex ?? weekly.length - 1
  const sliced = weekly.slice(startIdx, endIdx + 1)

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex gap-2">
        {['weekly', 'overall'].map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${view === v ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {v === 'weekly' ? 'Weekly Breakdown' : 'All-Time Split'}
          </button>
        ))}
      </div>

      {view === 'weekly' ? (
        <>
          <p className="text-xs text-slate-400">
            Minutes per HR zone per week
            {weekly.length > 16 && <span className="text-slate-600 ml-1">— drag handles to zoom</span>}
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weekly} margin={{ top: 4, right: 8, left: -20, bottom: 4 }} barSize={14}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" tick={{ fontSize: 9 }} tickFormatter={v => v.slice(5)}
                hide={weekly.length > 20} />
              <YAxis tick={{ fontSize: 10 }} unit="m" />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {zoneNames.map((name, i) => (
                <Bar key={name} dataKey={`z${i + 1}_min`} name={name} stackId="a" fill={ZONE_COLORS[i]} />
              ))}
              <Brush
                dataKey="week"
                height={22}
                stroke="#334155"
                fill="#1e293b"
                travellerWidth={6}
                startIndex={defaultStart}
                onChange={({ startIndex, endIndex }) => setBrushIdx({ startIndex, endIndex })}
              />
            </BarChart>
          </ResponsiveContainer>

          <p className="text-xs text-slate-400 mt-1">Run vs Ride weekly minutes</p>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={sliced} margin={{ top: 0, right: 8, left: -20, bottom: 0 }} barSize={14}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" tick={{ fontSize: 9 }} tickFormatter={v => v.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} unit="m" />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="run_min" name="Run" stackId="b" fill="#f97316" />
              <Bar dataKey="ride_min" name="Ride" stackId="b" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </>
      ) : (
        <div className="flex items-center justify-center gap-8">
          <ResponsiveContainer width="60%" height={220}>
            <PieChart>
              <Pie
                data={overall.map((z, i) => ({ ...z, pct: z.pct, fill: ZONE_COLORS[i % ZONE_COLORS.length] }))}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ midAngle, innerRadius, outerRadius, cx, cy, pct, name }) =>
                  PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, pct, name })
                }
                outerRadius={90}
                dataKey="pct"
                nameKey="zone"
              >
                {overall.map((z, i) => (
                  <Cell key={z.zone} fill={ZONE_COLORS[i % ZONE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={v => `${v}%`} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 text-xs">
            {overall.map((z, i) => (
              <div key={z.zone} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm" style={{ background: ZONE_COLORS[i % ZONE_COLORS.length] }} />
                <span className="text-slate-300 w-6">{z.zone}</span>
                <span className="text-slate-400">{z.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const Skeleton = () => (
  <div className="space-y-3 animate-pulse">
    <div className="h-48 bg-slate-800 rounded" />
    <div className="h-24 bg-slate-800 rounded" />
  </div>
)
const Empty = ({ text }) => (
  <div className="flex items-center justify-center h-full text-slate-500 text-sm">{text}</div>
)
