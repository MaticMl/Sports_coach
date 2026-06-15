import React, { useState, useMemo } from 'react'
import { Activity, RefreshCw, FileText, Cpu, AlertCircle } from 'lucide-react'
import HRDriftPanel from './components/charts/HRDriftPanel'
import IntensityDistributionPanel from './components/charts/IntensityDistributionPanel'
import RunProgressionPanel from './components/charts/RunProgressionPanel'
import InterferencePanel from './components/charts/InterferencePanel'
import ClimbVAMPanel from './components/charts/ClimbVAMPanel'
import PaceHRPanel from './components/charts/PaceHRPanel'
import EquivSpeedPanel from './components/charts/EquivSpeedPanel'
import WellnessPanel from './components/WellnessPanel'
import {
  useAthleteData,
  useSyncStatus,
  useTriggerSync,
  useGenerateReport,
} from './hooks/useAthleteData'
import { TimeRangeContext, TimeRangeSelector, getRange } from './context/TimeRangeContext.jsx'

function SyncBar({ preset, onPresetChange }) {
  const { data: status } = useSyncStatus()
  const { mutate: triggerSync, isPending } = useTriggerSync()
  const { mutate: generateReport, isPending: isGenerating, data: reportData } = useGenerateReport()

  const isSyncing = status?.is_syncing ?? false
  const progress = status && status.total_to_sync > 0
    ? Math.round((status.progress / status.total_to_sync) * 100)
    : null

  return (
    <div className="flex items-center gap-4 text-xs flex-wrap">
      {status && (
        <>
          <div className="flex items-center gap-2 text-slate-400">
            <span className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-yellow-400 animate-pulse' : 'bg-green-500'}`} />
            {isSyncing
              ? `Syncing… ${status.progress}/${status.total_to_sync} streams${progress !== null ? ` (${progress}%)` : ''}`
              : status.last_sync
                ? `Last sync: ${status.last_sync}`
                : 'Not synced'}
          </div>
          <span className="text-slate-600">•</span>
          <span className="text-slate-500">{status.total_activities} activities, {status.synced_streams} streams cached</span>
          {status.error && (
            <span className="text-red-400 flex items-center gap-1">
              <AlertCircle size={12} /> {status.error.slice(0, 60)}
            </span>
          )}
        </>
      )}

      <TimeRangeSelector value={preset} onChange={onPresetChange} />

      <button
        onClick={() => triggerSync()}
        disabled={isPending || isSyncing}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors"
      >
        <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
        {isSyncing ? 'Syncing…' : 'Sync Now'}
      </button>

      <button
        onClick={() => generateReport()}
        disabled={isGenerating}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors"
      >
        <FileText size={12} />
        {isGenerating ? 'Generating…' : 'Export AI Report'}
      </button>

      {reportData?.status === 'ok' && (
        <span className="text-emerald-400 text-xs">
          ✓ Report saved to output/
        </span>
      )}
    </div>
  )
}

const TOP_PANELS = [
  {
    id: 'hr-drift',
    title: 'HR Drift Detection',
    subtitle: 'Z2 aerobic decoupling',
    accent: 'from-green-500/10',
    border: 'border-green-500/20',
    Component: HRDriftPanel,
  },
  {
    id: 'intensity',
    title: 'Intensity Distribution',
    subtitle: 'Time in HR zones per week',
    accent: 'from-yellow-500/10',
    border: 'border-yellow-500/20',
    Component: IntensityDistributionPanel,
  },
  {
    id: 'run-prog',
    title: 'Run Progression',
    subtitle: 'Volume • Z2 pace • HR at pace',
    accent: 'from-orange-500/10',
    border: 'border-orange-500/20',
    Component: RunProgressionPanel,
  },
  {
    id: 'vam',
    title: 'Climb / VAM Analysis',
    subtitle: 'VAM vs HR • Quarterly trend — click dot to open activity',
    accent: 'from-blue-500/10',
    border: 'border-blue-500/20',
    Component: ClimbVAMPanel,
    wide: true,
  },
  {
    id: 'pace-hr',
    title: 'Pace / HR Efficiency',
    subtitle: '1-min segment scatter — click dot to open activity',
    accent: 'from-teal-500/10',
    border: 'border-teal-500/20',
    Component: PaceHRPanel,
  },
]

const INTERFERENCE_PANEL = {
  id: 'interference',
  title: 'Interference Detection',
  subtitle: 'Cycling → Run • HRV • Sleep • Load balance',
  accent: 'from-purple-500/10',
  border: 'border-purple-500/20',
  Component: InterferencePanel,
}

function PanelCard({ title, subtitle, accent, border, Component, wide = false, className = '' }) {
  return (
    <div className={`bg-gradient-to-b ${accent} to-slate-800/50 border ${border} rounded-2xl p-5 flex flex-col gap-3 min-h-[480px] ${wide ? 'xl:col-span-2' : ''} ${className}`}>
      <div className="flex-none">
        <h2 className="text-slate-100 font-semibold text-sm">{title}</h2>
        <p className="text-slate-500 text-xs mt-0.5">{subtitle}</p>
      </div>
      <div className="flex-1 overflow-hidden">
        <Component />
      </div>
    </div>
  )
}

export default function App() {
  const { data: athlete } = useAthleteData()
  const [preset, setPreset] = useState('1y')
  const range = useMemo(() => getRange(preset), [preset])

  return (
    <TimeRangeContext.Provider value={range}>
      <div className="min-h-screen bg-slate-950">
        {/* Header */}
        <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
          <div className="w-full px-6 py-3">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-blue-500 rounded-lg flex items-center justify-center">
                  <Activity size={16} className="text-white" />
                </div>
                <div>
                  <h1 className="text-slate-100 font-semibold text-sm leading-none">Sports Coach</h1>
                  {athlete && (
                    <p className="text-slate-500 text-xs mt-0.5">{athlete.name}</p>
                  )}
                </div>
              </div>
              <div className="flex-1">
                <SyncBar preset={preset} onPresetChange={setPreset} />
              </div>
            </div>
          </div>
        </header>

        {/* Wellness strip */}
        <div className="w-full px-6 pt-5">
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 mb-5">
            <div className="flex items-center gap-2 mb-3">
              <Cpu size={14} className="text-slate-400" />
              <h2 className="text-slate-300 font-semibold text-sm">Wellness Overview</h2>
            </div>
            <WellnessPanel />
          </div>
        </div>

        {/* Main grid */}
        <main className="w-full px-6 pb-8 flex flex-col gap-5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {TOP_PANELS.map(p => (
              <PanelCard key={p.id} {...p} />
            ))}
          </div>
          <PanelCard
            id="equiv-speed"
            title="Cycling Equivalent Speed"
            subtitle="ES = Σv² / Σv — speed-weighted average, one dot per activity"
            accent="from-emerald-500/10"
            border="border-emerald-500/20"
            Component={EquivSpeedPanel}
            className="min-h-[420px]"
          />
          <PanelCard {...INTERFERENCE_PANEL} className="min-h-[520px]" />
        </main>
      </div>
    </TimeRangeContext.Provider>
  )
}
