import { createContext, useContext } from 'react'

export const TimeRangeContext = createContext({ start: null, end: null, preset: 'all' })
export const useTimeRange = () => useContext(TimeRangeContext)

const PRESETS = [
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: '2y', label: '2Y' },
  { key: '5y', label: '5Y' },
  { key: 'all', label: 'All' },
]

export function getRange(preset) {
  if (preset === 'all') return { start: null, end: null }
  const now = new Date()
  const end = now.toISOString().slice(0, 10)
  const d = new Date(now)
  if (preset === '3m') d.setMonth(d.getMonth() - 3)
  else if (preset === '6m') d.setMonth(d.getMonth() - 6)
  else if (preset === '1y') d.setFullYear(d.getFullYear() - 1)
  else if (preset === '2y') d.setFullYear(d.getFullYear() - 2)
  else if (preset === '5y') d.setFullYear(d.getFullYear() - 5)
  return { start: d.toISOString().slice(0, 10), end }
}

export function TimeRangeSelector({ value, onChange }) {
  return (
    <div className="flex items-center gap-1 bg-slate-800/60 rounded-lg p-1">
      {PRESETS.map(p => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
            value === p.key
              ? 'bg-slate-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}
