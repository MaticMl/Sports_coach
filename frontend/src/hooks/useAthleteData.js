import { useContext } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { TimeRangeContext } from '../context/TimeRangeContext.jsx'

// Build API base URL from window.location so it works in dev (/)
// and behind the HA ingress proxy (/api/hassio_ingress/<token>/).
// Ensure the pathname ends with / before appending 'api'.
const _p = window.location.pathname
const _base = (_p.endsWith('/') ? _p : _p + '/') + 'api'
const api = axios.create({ baseURL: _base })

// Strip null/undefined so they aren't sent as empty strings
const clean = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))

const fetch = (url, params) => api.get(url, { params: clean(params) }).then(r => r.data)

const useDateRange = () => useContext(TimeRangeContext)

export const useAthleteData = () => useQuery({ queryKey: ['athlete'], queryFn: () => fetch('/athlete', {}) })
export const useSyncStatus = () => useQuery({ queryKey: ['sync-status'], queryFn: () => fetch('/sync/status', {}), refetchInterval: 3000 })
export const useWellness = () => useQuery({ queryKey: ['wellness'], queryFn: () => fetch('/wellness', {}) })

export const useHRDrift = () => {
  const { start, end } = useDateRange()
  return useQuery({ queryKey: ['hr-drift', start, end], queryFn: () => fetch('/hr-drift', { start, end }) })
}

export const useIntensity = () => {
  const { start, end } = useDateRange()
  return useQuery({ queryKey: ['intensity', start, end], queryFn: () => fetch('/intensity', { start, end }) })
}

export const useRunProgression = () => {
  const { start, end } = useDateRange()
  return useQuery({ queryKey: ['run-progression', start, end], queryFn: () => fetch('/run-progression', { start, end }) })
}

export const useInterference = () => {
  const { start, end } = useDateRange()
  return useQuery({ queryKey: ['interference', start, end], queryFn: () => fetch('/interference', { start, end }) })
}

export const useClimbVAM = () => {
  const { start, end } = useDateRange()
  return useQuery({ queryKey: ['climb-vam', start, end], queryFn: () => fetch('/climb-vam', { start, end }) })
}

export const usePaceHR = () => {
  const { start, end } = useDateRange()
  return useQuery({ queryKey: ['pace-hr', start, end], queryFn: () => fetch('/pace-hr', { start, end }) })
}

export const useEquivSpeed = () => {
  const { start, end } = useDateRange()
  return useQuery({ queryKey: ['equiv-speed', start, end], queryFn: () => fetch('/equiv-speed', { start, end }) })
}

export const useTriggerSync = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/sync'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sync-status'] }),
  })
}

export const useReadiness = () =>
  useQuery({ queryKey: ['readiness'], queryFn: () => fetch('/readiness', {}) })

export const useVAMCurve = () => {
  const { start, end } = useDateRange()
  return useQuery({ queryKey: ['vam-curve', start, end], queryFn: () => fetch('/vam-curve', { start, end }) })
}

export const useGenerateReport = () =>
  useMutation({ mutationFn: () => api.post('/generate-report') })
