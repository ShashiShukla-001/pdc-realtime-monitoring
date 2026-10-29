import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
  Stack,
  Typography,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material/Select'
import { LiveLineChart } from '../charts/LiveLineChart'
import { CHART_COLORS } from '../../constants'
import { useAlignedBatchesEachSecond } from '../../hooks/useAlignedBatches'
import { alignedChartTs } from '../../utils/alignedChart'
import type { AlignedPoint, PMUWithMeta } from '../../types/dashboard'
import { ExternalChartLegend } from '../../utils/chartLegend'
import { chartLabel, pmuKey } from '../../utils/pmu'

type Props = {
  pmus: PMUWithMeta[]
  kind: 'voltage' | 'current'
}

/** Top-level metric group in the first dropdown. */
type MetricGroup = 'magnitude' | 'angle' | 'analogs'

type ChannelOption = {
  key: string
  label: string
  unit: string
  field?: keyof AlignedPoint
  analogName?: string
}

const V_PHASES = [
  { key: 'va', label: 'VA', unit: 'V', angleKey: 'vaAngle' as const },
  { key: 'vb', label: 'VB', unit: 'V', angleKey: 'vbAngle' as const },
  { key: 'vc', label: 'VC', unit: 'V', angleKey: 'vcAngle' as const },
] as const

const I_PHASES = [
  { key: 'ia', label: 'IA', unit: 'A', angleKey: 'iaAngle' as const },
  { key: 'ib', label: 'IB', unit: 'A', angleKey: 'ibAngle' as const },
  { key: 'ic', label: 'IC', unit: 'A', angleKey: 'icAngle' as const },
] as const

const METRIC_LABEL: Record<MetricGroup, string> = {
  magnitude: 'Magnitude',
  angle: 'Angle',
  analogs: 'Analogs',
}

const CHANNEL_DASH = ['', '6 3', '2 3', '8 3 2 3']

function cfgAnalogNames(pmus: PMUWithMeta[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const pmu of pmus) {
    const names = pmu.cfg?.analogs?.length
      ? pmu.cfg.analogs
      : (pmu.lastChannels?.analogs ?? []).map((a) => a.name)
    for (const name of names) {
      if (!name || seen.has(name)) continue
      seen.add(name)
      out.push(name)
    }
  }
  return out
}

function channelsForGroup(
  group: MetricGroup,
  phaseKeys: typeof V_PHASES | typeof I_PHASES,
  analogNames: string[],
): ChannelOption[] {
  if (group === 'magnitude') {
    return phaseKeys.map((p) => ({
      key: p.key,
      label: p.label,
      unit: p.unit,
      field: p.key,
    }))
  }
  if (group === 'angle') {
    return phaseKeys.map((p) => ({
      key: `${p.key}Angle`,
      label: `${p.label} ∠`,
      unit: '°',
      field: p.angleKey,
    }))
  }
  return analogNames.map((name) => ({
    key: `analog:${name}`,
    label: name,
    unit: '',
    analogName: name,
  }))
}

export function PhasorMagnitudeChart({ pmus, kind }: Props) {
  const phaseKeys = kind === 'voltage' ? V_PHASES : I_PHASES
  const analogNames = useMemo(
    () => (kind === 'voltage' ? cfgAnalogNames(pmus) : []),
    [kind, pmus],
  )

  const metricGroups = useMemo<MetricGroup[]>(() => {
    const groups: MetricGroup[] = ['magnitude', 'angle']
    if (analogNames.length) groups.push('analogs')
    return groups
  }, [analogNames.length])

  const [metric, setMetric] = useState<MetricGroup>('magnitude')
  const activeMetric = metricGroups.includes(metric) ? metric : 'magnitude'

  const channelOptions = useMemo(
    () => channelsForGroup(activeMetric, phaseKeys, analogNames),
    [activeMetric, phaseKeys, analogNames],
  )

  const allChannelKeys = useMemo(() => channelOptions.map((c) => c.key), [channelOptions])
  const channelKeySig = allChannelKeys.join('\0')

  const [selectedChannels, setSelectedChannels] = useState<string[]>(() => allChannelKeys)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())

  // When metric / channel catalog changes, select all and clear legend hides.
  useEffect(() => {
    setSelectedChannels(allChannelKeys)
    setHidden(new Set())
  }, [activeMetric, channelKeySig])

  const selectedOptions = useMemo(
    () => channelOptions.filter((c) => selectedChannels.includes(c.key)),
    [channelOptions, selectedChannels],
  )

  const unit =
    selectedOptions[0]?.unit ??
    (activeMetric === 'angle' ? '°' : kind === 'voltage' ? 'V' : 'A')

  const chartSeries = useMemo(() => {
    const out: {
      dataKey: string
      name: string
      color: string
      dash?: string
      channelKey: string
    }[] = []
    let seriesIdx = 0
    // Color each line uniquely. (Color-by-PMU alone made IA/IB/IC identical for 1 PMU → fuzzy band.)
    selectedOptions.forEach((ch, chIdx) => {
      pmus.forEach((pmu) => {
        const suffix = ch.analogName ? pmuKey(ch.analogName) : ch.key
        out.push({
          dataKey: `${pmuKey(pmu.name)}__${suffix}`,
          name:
            pmus.length === 1
              ? ch.label
              : `${chartLabel(pmu)} · ${ch.label}`,
          color: CHART_COLORS[seriesIdx % CHART_COLORS.length],
          dash: CHANNEL_DASH[chIdx % CHANNEL_DASH.length] || undefined,
          channelKey: ch.key,
        })
        seriesIdx++
      })
    })
    return out
  }, [selectedOptions, pmus])

  const seriesKeys = useMemo(() => chartSeries.map((s) => s.dataKey), [chartSeries])
  const seriesKeySig = seriesKeys.join('\0')

  const activeHidden = useMemo(() => {
    const next = new Set<string>()
    for (const k of hidden) {
      if (seriesKeys.includes(k)) next.add(k)
    }
    return next
  }, [hidden, seriesKeySig])

  const channelSummary =
    selectedOptions.length === channelOptions.length
      ? 'all'
      : selectedOptions.map((c) => c.label).join(', ') || 'none'

  const subtitle = `${METRIC_LABEL[activeMetric]} · ${channelSummary} · ${pmus.length} PMU${pmus.length === 1 ? '' : 's'}`

  const onMetricChange = (e: SelectChangeEvent<MetricGroup>) => {
    setMetric(e.target.value as MetricGroup)
  }

  const onChannelsChange = (e: SelectChangeEvent<string[]>) => {
    const value = e.target.value
    const next = typeof value === 'string' ? value.split(',') : value
    if (next.length === 0 && allChannelKeys.length > 0) return
    setSelectedChannels(next)
    setHidden(new Set())
  }

  /** Legend only toggles visibility — click again to show (no need to reopen Channels). */
  const onLegendToggle = (dataKey: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(dataKey)) {
        next.delete(dataKey)
        return next
      }
      const visible = seriesKeys.filter((k) => !next.has(k) && k !== dataKey)
      if (visible.length === 0) return prev
      next.add(dataKey)
      return next
    })
  }

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardHeader
        title={kind === 'voltage' ? 'Voltage trends' : 'Current trends'}
        subheader={subtitle}
        action={
          <Stack
            direction="row"
            spacing={1}
            sx={{ mr: 1, mt: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}
          >
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel id={`${kind}-metric-label`}>Metric</InputLabel>
              <Select
                labelId={`${kind}-metric-label`}
                label="Metric"
                value={activeMetric}
                onChange={onMetricChange}
              >
                {metricGroups.map((g) => (
                  <MenuItem key={g} value={g}>
                    {METRIC_LABEL[g]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 148, maxWidth: 220 }}>
              <InputLabel id={`${kind}-channels-label`}>Channels</InputLabel>
              <Select
                labelId={`${kind}-channels-label`}
                multiple
                value={selectedChannels.filter((k) => allChannelKeys.includes(k))}
                onChange={onChannelsChange}
                input={<OutlinedInput label="Channels" />}
                renderValue={(selected) => {
                  if (!selected.length) return 'None'
                  if (selected.length === allChannelKeys.length) return 'All'
                  return channelOptions
                    .filter((c) => selected.includes(c.key))
                    .map((c) => c.label)
                    .join(', ')
                }}
              >
                {channelOptions.map((opt) => (
                  <MenuItem key={opt.key} value={opt.key}>
                    <Checkbox size="small" checked={selectedChannels.includes(opt.key)} />
                    <ListItemText primary={opt.label} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        }
        slotProps={{
          title: { variant: 'h6', sx: { fontSize: '1rem' } },
          subheader: { sx: { color: 'text.secondary', fontSize: 13 } },
        }}
        sx={{
          flexWrap: 'wrap',
          gap: 1,
          '& .MuiCardHeader-action': { m: 0, alignSelf: 'center' },
        }}
      />
      <CardContent sx={{ pt: 0 }}>
        <Box sx={{ width: '100%', minWidth: 0 }}>
          {!selectedOptions.length ? (
            <Typography sx={{ p: 2, color: 'text.secondary' }}>
              Select at least one channel to plot.
            </Typography>
          ) : (
            <>
              <MagnitudeCanvas
                pmus={pmus}
                kind={kind}
                selectedOptions={selectedOptions}
                chartSeries={chartSeries}
                activeHidden={activeHidden}
                activeMetric={activeMetric}
                unit={unit}
              />
              <ExternalChartLegend
                items={chartSeries.map((s) => ({ key: s.dataKey, name: s.name, color: s.color }))}
                hidden={activeHidden}
                onToggle={onLegendToggle}
              />
            </>
          )}
        </Box>
      </CardContent>
    </Card>
  )
}

function MagnitudeCanvas({
  pmus,
  kind,
  selectedOptions,
  chartSeries,
  activeHidden,
  activeMetric,
  unit,
}: {
  pmus: PMUWithMeta[]
  kind: 'voltage' | 'current'
  selectedOptions: ChannelOption[]
  chartSeries: { dataKey: string; name: string; color: string; dash?: string }[]
  activeHidden: Set<string>
  activeMetric: MetricGroup
  unit: string
}) {
  const batches = useAlignedBatchesEachSecond()
  const data = useMemo(() => {
    return batches.map((batch) => {
      const row: { ts: number } & Record<string, number | undefined> = { ts: alignedChartTs(batch) }
      for (const ch of selectedOptions) {
        for (const pmu of pmus) {
          const suffix = ch.analogName ? pmuKey(ch.analogName) : ch.key
          const key = `${pmuKey(pmu.name)}__${suffix}`
          const point = batch.points?.[pmu.name]
          let value: number | undefined
          if (ch.analogName) {
            const v = point?.analogs?.[ch.analogName]
            value = typeof v === 'number' ? v : undefined
          } else if (ch.field) {
            const v = point?.[ch.field]
            value = typeof v === 'number' ? v : undefined
          }
          row[key] = value
        }
      }
      return row
    })
  }, [batches, pmus, selectedOptions])

  const hasNumeric = data.some((row) =>
    chartSeries.some((series) => typeof row[series.dataKey] === 'number'),
  )

  if (!data.length) {
    return (
      <Typography sx={{ p: 2, color: 'text.secondary' }}>
        Waiting for aligned {kind} ticks…
      </Typography>
    )
  }
  if (!hasNumeric && activeMetric === 'analogs') {
    return (
      <Typography sx={{ p: 2, color: 'text.secondary' }}>
        No analog values on aligned ticks yet. Waiting…
      </Typography>
    )
  }

  const series = chartSeries
    .filter((item) => !activeHidden.has(item.dataKey))
    .map((item) => ({
      key: item.dataKey,
      name: item.name,
      color: item.color,
      dash: item.dash,
    }))

  return (
    <Box sx={{ width: '100%', height: { xs: 220, sm: 250 } }}>
      <LiveLineChart
        rows={data}
        series={series}
        yDigits={activeMetric === 'analogs' ? 3 : 2}
        unit={unit}
        yBounds={
          activeMetric === 'magnitude'
            ? (_min, max) => [0, max > 0 ? max : 1]
            : undefined
        }
      />
    </Box>
  )
}
