import React, { useState, useMemo } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LineChart, Line, Legend, Brush,
} from 'recharts'
import { useClimbVAM } from '../../hooks/useAthleteData'

const YEAR_COLORS = {
  '2015': '#475569', '2016': '#64748b', '2017': '#7c8fa0',
  '2018': '#94a3b8', '2019': '#cbd5e1', '2020': '#38bdf8',
  '2021': '#34d399', '2022': '#fbbf24', '2023': '#f87171',
  '2024': '#a78bfa', '2025': '#fb923c', '2026': '#4ade80',
}
const DEFAULT_COLOR = '#94a3b8'

function yearOf(d) { return String(d || '').slice(0, 4) }
function colorFor(d) { return YEAR_COLORS[yearOf(d)] || DEFAULT_COLOR }

function hrPerVam(c) {
  if (!c.avg_hr || !c.vam) return null
  return c.avg_hr / c.vam * 100
}

function openActivity(id) {
  if (id) window.open(`https://intervals.icu/activities/${id}`, '_blank')
}

function Dot({ cx, cy, payload, onClick }) {
  const color = colorFor(payload?.date)
  return (
    <circle
      cx={cx} cy={cy} r={5}
      fill={color} fillOpacity={0.9}
      stroke="rgba(255,255,255,0.25)" strokeWidth={1}
      style={{ cursor: payload?.activity_id ? 'pointer' : 'default' }}
      onClick={() => onClick?.(payload)}
    />
  )
}

const ScatterTip = ({ active, payload, metric }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  const eff = hrPerVam(d)
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs space-y-1 shadow-xl">
      <p className="font-medium" style={{ color: colorFor(d?.date) }}>{d?.date}</p>
      <p className="text-slate-400">VAM: <span className="text-blue-300 font-semibold">{d?.vam} m/hr</span></p>
      {d?.est_power_wkg != null && (
        <p className="text-slate-400">Est. Power: <span className="text-emerald-400 font-semibold">{d?.est_power_wkg} W/kg</span>
          <span className="text-slate-600 ml-1">({d?.est_power_w} W @ {d?.rider_mass_kg} kg)</span>
        </p>
      )}
      {d?.gradient_pct != null && (
        <p className="text-slate-400">Gradient: <span className="text-slate-200">{d.gradient_pct}%</span></p>
      )}
      <p className="text-slate-400">HR: <span className="text-red-400">{d?.hr} bpm</span></p>
      <p className="text-slate-400">Duration: <span className="text-slate-200">{d?.duration_min?.toFixed(1)} min</span></p>
      {eff != null && <p className="text-slate-400">HR/VAM: <span className="text-amber-300">{eff.toFixed(2)}</span><span className="text-slate-600"> ×100</span></p>}
      {d?.activity_id && <p className="text-slate-600 mt-1">Click to open activity</p>}
    </div>
  )
}

function SortTh({ label, title, sortKey, current, dir, onSort, align = 'right' }) {
  const active = current === sortKey
  return (
    <th
      title={title}
      onClick={() => onSort(sortKey)}
      className={`py-1 pr-2 cursor-pointer select-none text-${align} whitespace-nowrap transition-colors ${
        active ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      {label}{active ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )
}

function DurationFilter({ minDur, maxDur, onMin, onMax, count, total }) {
  const hasFilter = minDur !== '' || maxDur !== ''
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
      <span className="text-slate-500">Duration:</span>
      <input
        type="number" min="0" placeholder="min"
        value={minDur} onChange={e => onMin(e.target.value)}
        className="w-14 bg-slate-800/80 border border-slate-700 rounded px-2 py-0.5 text-slate-200 text-center focus:outline-none focus:border-blue-500"
      />
      <span>–</span>
      <input
        type="number" min="0" placeholder="max"
        value={maxDur} onChange={e => onMax(e.target.value)}
        className="w-14 bg-slate-800/80 border border-slate-700 rounded px-2 py-0.5 text-slate-200 text-center focus:outline-none focus:border-blue-500"
      />
      <span className="text-slate-500">min</span>
      {hasFilter && (
        <button onClick={() => { onMin(''); onMax('') }} className="text-slate-600 hover:text-slate-300 transition-colors ml-1">
          ✕
        </button>
      )}
      {hasFilter && <span className="text-slate-600">{count}/{total} climbs</span>}
    </div>
  )
}

function MetricToggle({ metric, onChange }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-slate-600 mr-1">Y-axis:</span>
      {[['vam', 'VAM'], ['wkg', 'W/kg']].map(([key, label]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-2 py-0.5 rounded font-medium transition-colors ${
            metric === key ? 'bg-blue-500/30 text-blue-300' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export default function ClimbVAMPanel() {
  const { data, isLoading } = useClimbVAM()
  const [view, setView] = useState('vam_hr')
  const [selectedYears, setSelectedYears] = useState(new Set())
  const [minDur, setMinDur] = useState('')
  const [maxDur, setMaxDur] = useState('')
  const [sortKey, setSortKey] = useState('vam')
  const [sortDir, setSortDir] = useState('desc')
  const [metric, setMetric] = useState('vam') // 'vam' | 'wkg'

  const scatter = data?.vam_hr_scatter || []
  const trend = data?.vam_trend || []
  const recent = data?.climbs || []
  const riderMass = data?.rider_mass_kg || 75

  const STRING_KEYS = new Set(['date', 'activity_name'])
  const tableData = useMemo(() => {
    const filtered = recent.filter(c => {
      if (minDur !== '' && c.duration_min < parseFloat(minDur)) return false
      if (maxDur !== '' && c.duration_min > parseFloat(maxDur)) return false
      return true
    })
    return [...filtered].sort((a, b) => {
      let va = sortKey === 'hr_vam' ? hrPerVam(a) : a[sortKey]
      let vb = sortKey === 'hr_vam' ? hrPerVam(b) : b[sortKey]
      if (va == null) return 1
      if (vb == null) return -1
      if (STRING_KEYS.has(sortKey)) {
        return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
      }
      return sortDir === 'asc' ? va - vb : vb - va
    })
  }, [recent, minDur, maxDur, sortKey, sortDir])

  if (isLoading) return <Skeleton />

  const allYears = [...new Set(scatter.map(s => yearOf(s.date)))].sort()

  const toggle = (y) =>
    setSelectedYears(prev => {
      const next = new Set(prev)
      next.has(y) ? next.delete(y) : next.add(y)
      return next
    })

  const applyDurFilter = (items) => {
    let r = items
    if (minDur !== '') r = r.filter(c => c.duration_min >= parseFloat(minDur))
    if (maxDur !== '') r = r.filter(c => c.duration_min <= parseFloat(maxDur))
    return r
  }

  const yearFiltered = selectedYears.size === 0 ? scatter : scatter.filter(s => selectedYears.has(yearOf(s.date)))
  const visible = applyDurFilter(yearFiltered)

  const handleSort = (key) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  // Y-axis config for scatter charts
  const yDataKey = metric === 'wkg' ? 'est_power_wkg' : 'vam'
  const yAxisLabel = metric === 'wkg' ? 'Est. Power (W/kg)' : 'VAM (m/hr)'
  const yUnit = metric === 'wkg' ? ' W/kg' : ' m/hr'
  const yDomain = metric === 'wkg' ? ['dataMin - 0.5', 'dataMax + 0.5'] : ['dataMin - 50', 'dataMax + 50']
  // Filter out points with null power when in wkg mode
  const visibleFiltered = metric === 'wkg' ? visible.filter(s => s.est_power_wkg != null) : visible

  const hasQuarterlyPower = trend.some(t => t.avg_power_wkg != null)

  const YearFilter = () => (
    <div className="flex gap-1.5 flex-wrap items-center">
      <button
        onClick={() => setSelectedYears(new Set())}
        className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${selectedYears.size === 0 ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
      >
        All
      </button>
      {allYears.map(y => {
        const c = YEAR_COLORS[y] || DEFAULT_COLOR
        const active = selectedYears.has(y)
        return (
          <button
            key={y}
            onClick={() => toggle(y)}
            style={{ color: c, borderColor: c + '70', background: active ? c + '25' : 'transparent' }}
            className="px-2 py-0.5 rounded text-xs font-medium border transition-colors"
          >
            {y}
            <span className="ml-1 opacity-50 text-[10px]">({scatter.filter(s => yearOf(s.date) === y).length})</span>
          </button>
        )
      })}
    </div>
  )

  const MakeDot = (onClick) => (props) => <Dot {...props} onClick={onClick} />

  const TABS = [
    { key: 'vam_hr',  label: 'vs HR' },
    { key: 'vam_dur', label: 'vs Duration' },
    { key: 'trend',   label: 'Quarterly Trend' },
    { key: 'recent',  label: 'Climbs' },
  ]

  const sharedSortProps = { current: sortKey, dir: sortDir, onSort: handleSort }

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Tab row + metric toggle */}
      <div className="flex gap-2 flex-wrap items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                view === key ? 'bg-blue-500/30 text-blue-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {(view === 'vam_hr' || view === 'vam_dur') && (
          <MetricToggle metric={metric} onChange={setMetric} />
        )}
      </div>

      {/* Duration filter */}
      {view !== 'trend' && (
        <DurationFilter
          minDur={minDur} maxDur={maxDur}
          onMin={setMinDur} onMax={setMaxDur}
          count={view === 'recent' ? tableData.length : visibleFiltered.length}
          total={view === 'recent' ? applyDurFilter(recent).length : yearFiltered.length}
        />
      )}

      {/* ── Scatter: VAM or W/kg vs HR ──────────────────────────────────── */}
      {view === 'vam_hr' && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-slate-400">
              {metric === 'wkg'
                ? 'Est. power (Martin et al. 1998) vs HR — upper-left = high power at low HR'
                : 'Upper-left = most efficient • click dot to open activity'}
            </p>
            <YearFilter />
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 8, right: 16, left: 40, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="hr" name="HR" type="number"
                domain={['dataMin - 5', 'dataMax + 5']}
                tick={{ fontSize: 10, fill: '#64748b' }} unit=" bpm"
                label={{ value: 'Avg HR (bpm)', position: 'insideBottom', offset: -14, fontSize: 10, fill: '#64748b' }}
              />
              <YAxis
                dataKey={yDataKey} name={yAxisLabel} type="number"
                domain={yDomain}
                tick={{ fontSize: 10, fill: '#64748b' }} unit={yUnit}
                label={{ value: yAxisLabel, angle: -90, position: 'insideLeft', offset: -30, fontSize: 10, fill: '#64748b' }}
              />
              <ZAxis range={[1, 1]} />
              <Tooltip content={<ScatterTip metric={metric} />} />
              <Scatter data={visibleFiltered} shape={MakeDot((p) => openActivity(p?.activity_id))} />
            </ScatterChart>
          </ResponsiveContainer>
          <ColorLegend years={allYears} scatter={scatter} />
        </>
      )}

      {/* ── Scatter: VAM or W/kg vs Duration ─────────────────────────── */}
      {view === 'vam_dur' && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-slate-400">
              {metric === 'wkg'
                ? 'Sustained power over longer climbs — upper-right = strongest'
                : 'Longer climbs at higher VAM = stronger sustained power • click dot'}
            </p>
            <YearFilter />
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart margin={{ top: 8, right: 16, left: 40, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="duration_min" name="Duration" type="number"
                domain={[0, 'dataMax + 5']}
                tick={{ fontSize: 10, fill: '#64748b' }} unit=" min"
                label={{ value: 'Climb duration (min)', position: 'insideBottom', offset: -14, fontSize: 10, fill: '#64748b' }}
              />
              <YAxis
                dataKey={yDataKey} name={yAxisLabel} type="number"
                domain={yDomain}
                tick={{ fontSize: 10, fill: '#64748b' }} unit={yUnit}
                label={{ value: yAxisLabel, angle: -90, position: 'insideLeft', offset: -30, fontSize: 10, fill: '#64748b' }}
              />
              <ZAxis range={[1, 1]} />
              <Tooltip content={<ScatterTip metric={metric} />} />
              <Scatter data={visibleFiltered} shape={MakeDot((p) => openActivity(p?.activity_id))} />
            </ScatterChart>
          </ResponsiveContainer>
          <ColorLegend years={allYears} scatter={scatter} />
        </>
      )}

      {/* ── Quarterly Trend — VAM + W/kg + HR ───────────────────────────── */}
      {view === 'trend' && (
        <>
          <p className="text-xs text-slate-400">
            Avg VAM per quarter (left) {hasQuarterlyPower ? '— Est. power W/kg (right, Martin et al. 1998)' : ''}
          </p>
          <ResponsiveContainer width="100%" height={290}>
            <LineChart data={trend} margin={{ top: 8, right: 50, left: 10, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="quarter" tick={{ fontSize: 10, fill: '#64748b' }} hide={trend.length > 12} />
              <YAxis yAxisId="vam" tick={{ fontSize: 10, fill: '#60a5fa' }} unit=" m/hr" />
              <YAxis yAxisId="wkg" orientation="right" tick={{ fontSize: 10, fill: '#34d399' }} unit=" W/kg" />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return (
                    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-xs shadow-xl">
                      <p className="text-slate-300 font-medium mb-1">{label}</p>
                      {payload.map((p, i) => (
                        <p key={i} style={{ color: p.color }}>
                          {p.name}: {Number(p.value).toFixed(p.name === 'Est. W/kg' ? 2 : 0)}
                          {p.name === 'Avg VAM' ? ' m/hr' : ' W/kg'}
                        </p>
                      ))}
                      <p className="text-slate-500 mt-1">{payload[0]?.payload?.count} climbs · avg HR {payload[0]?.payload?.avg_hr} bpm</p>
                    </div>
                  )
                }}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line yAxisId="vam" type="monotone" dataKey="avg_vam" name="Avg VAM"
                stroke="#60a5fa" dot={{ r: 4, fill: '#60a5fa', strokeWidth: 0 }} strokeWidth={2} />
              {hasQuarterlyPower && (
                <Line yAxisId="wkg" type="monotone" dataKey="avg_power_wkg" name="Est. W/kg"
                  stroke="#34d399" dot={{ r: 4, fill: '#34d399', strokeWidth: 0 }} strokeWidth={2} />
              )}
              {trend.length > 8 && (
                <Brush dataKey="quarter" height={22} stroke="#334155" fill="#1e293b" travellerWidth={6}
                  startIndex={Math.max(0, trend.length - 8)} />
              )}
            </LineChart>
          </ResponsiveContainer>
          {trend.length >= 2 && (
            <div className="flex gap-4 flex-wrap text-xs">
              <span className="text-slate-400">
                VAM {trend[0].quarter}→{trend[trend.length - 1].quarter}:{' '}
                <span className={trend[trend.length - 1].avg_vam >= trend[0].avg_vam ? 'text-green-400' : 'text-red-400'}>
                  {trend[trend.length - 1].avg_vam >= trend[0].avg_vam ? '▲' : '▼'}
                  {Math.abs(trend[trend.length - 1].avg_vam - trend[0].avg_vam).toFixed(0)} m/hr
                </span>
              </span>
              {hasQuarterlyPower && trend[0].avg_power_wkg && trend[trend.length - 1].avg_power_wkg && (
                <span className="text-slate-400">
                  Power:{' '}
                  <span className={trend[trend.length - 1].avg_power_wkg >= trend[0].avg_power_wkg ? 'text-green-400' : 'text-red-400'}>
                    {trend[trend.length - 1].avg_power_wkg >= trend[0].avg_power_wkg ? '▲' : '▼'}
                    {Math.abs(trend[trend.length - 1].avg_power_wkg - trend[0].avg_power_wkg).toFixed(2)} W/kg
                  </span>
                </span>
              )}
            </div>
          )}
          <p className="text-xs text-slate-600">
            Martin et al. 1998 — weight from wellness log (current: {riderMass} kg), 8 kg bike, CdA 0.32 m², Crr 0.004; pre-history default 105 kg
          </p>
        </>
      )}

      {/* ── Climbs table ────────────────────────────────────────────────── */}
      {view === 'recent' && (
        <div className="overflow-auto flex-1 -mx-1">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-900/95 backdrop-blur-sm">
              <tr className="border-b border-slate-700">
                <SortTh label="Date"    sortKey="date"             align="left"  {...sharedSortProps} />
                <SortTh label="Activity" sortKey="activity_name"   align="left"  {...sharedSortProps} />
                <SortTh label="↑ m"    sortKey="elevation_gain_m"  title="Elevation gain (m)"              {...sharedSortProps} />
                <SortTh label="Grad%"  sortKey="gradient_pct"      title="Gradient (%)"                    {...sharedSortProps} />
                <SortTh label="Dur"    sortKey="duration_min"      title="Duration (min)"                  {...sharedSortProps} />
                <SortTh label="VAM"    sortKey="vam"               title="VAM (m/hr)"                      {...sharedSortProps} />
                <SortTh label="HR"     sortKey="avg_hr"            title="Avg heart rate"                  {...sharedSortProps} />
                <SortTh label="HR/VAM" sortKey="hr_vam"            title="HR ÷ VAM × 100 — lower = better" {...sharedSortProps} />
                <SortTh label="W/kg"   sortKey="est_power_wkg"     title="Est. power W/kg (Martin 1998)"          {...sharedSortProps} />
                <SortTh label="W"      sortKey="est_power_w"       title="Est. absolute power (W)"                {...sharedSortProps} />
                <SortTh label="kg"     sortKey="rider_mass_kg"     title="Rider weight used for power calc"       {...sharedSortProps} />
              </tr>
            </thead>
            <tbody>
              {tableData.map((c, i) => {
                const eff = hrPerVam(c)
                return (
                  <tr
                    key={i}
                    className={`border-b border-slate-800/60 transition-colors ${c.activity_id ? 'cursor-pointer hover:bg-slate-800/60' : 'hover:bg-slate-800/30'}`}
                    onClick={() => openActivity(c.activity_id)}
                    title={c.activity_id ? 'Click to open in intervals.icu' : ''}
                  >
                    <td className="py-1.5 pr-2 font-medium whitespace-nowrap" style={{ color: colorFor(c.date) }}>{c.date}</td>
                    <td className="py-1.5 pr-2 text-slate-300 truncate max-w-[110px]">{c.activity_name}</td>
                    <td className="py-1.5 pr-2 text-right text-slate-300">{c.elevation_gain_m}m</td>
                    <td className="py-1.5 pr-2 text-right text-slate-400">{c.gradient_pct != null ? `${c.gradient_pct}%` : '—'}</td>
                    <td className="py-1.5 pr-2 text-right text-slate-400">{c.duration_min}m</td>
                    <td className="py-1.5 pr-2 text-right text-blue-300 font-semibold">{c.vam}</td>
                    <td className="py-1.5 pr-2 text-right text-red-400">{c.avg_hr}</td>
                    <td className={`py-1.5 pr-2 text-right font-mono ${eff != null ? (eff < 12 ? 'text-green-400' : eff < 16 ? 'text-yellow-400' : 'text-red-400') : 'text-slate-600'}`}>
                      {eff != null ? eff.toFixed(2) : '—'}
                    </td>
                    <td className={`py-1.5 pr-2 text-right font-mono font-semibold ${c.est_power_wkg != null ? 'text-emerald-400' : 'text-slate-600'}`}>
                      {c.est_power_wkg != null ? `${c.est_power_wkg}` : '—'}
                    </td>
                    <td className="py-1.5 pr-2 text-right text-slate-400">
                      {c.est_power_w != null ? `${c.est_power_w}W` : '—'}
                    </td>
                    <td className="py-1.5 text-right text-slate-600">
                      {c.rider_mass_kg != null ? `${c.rider_mass_kg}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {tableData.length === 0 && (
            <p className="text-center text-slate-500 py-8 text-xs">No climbs match the current duration filter.</p>
          )}
        </div>
      )}
    </div>
  )
}

function ColorLegend({ years, scatter }) {
  return (
    <div className="flex gap-4 flex-wrap">
      {years.map(y => {
        const c = YEAR_COLORS[y] || DEFAULT_COLOR
        return (
          <div key={y} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c }} />
            <span className="text-xs" style={{ color: c }}>{y}</span>
            <span className="text-xs text-slate-600">({scatter.filter(s => yearOf(s.date) === y).length})</span>
          </div>
        )
      })}
    </div>
  )
}

const Skeleton = () => (
  <div className="space-y-3 animate-pulse">
    <div className="flex gap-2">
      {[1, 2, 3, 4].map(i => <div key={i} className="h-7 w-28 bg-slate-800 rounded" />)}
    </div>
    <div className="h-72 bg-slate-800 rounded" />
  </div>
)
