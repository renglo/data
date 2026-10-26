import { useEffect, useMemo, useState } from "react"
import { Activity, BarChart3, ChevronDown, Clock, Layers, LineChart, RefreshCw, Zap } from "lucide-react"

interface LlmUsageProps {
  portfolio: string
  org: string
  revision: number
}

type Range = "hour" | "day"
type ChartView = "line" | "bar"

const SERIES = [
  "llm.requests",
  "llm.errors",
  "llm.latency_ms",
  "llm.input_tokens",
  "llm.output_tokens",
  "llm.reasoning_tokens",
  "llm.cached_tokens",
  "llm.cost_usd",
] as const

type SeriesKey = (typeof SERIES)[number]

type Reading = {
  at: number
  value: number
}

type UsageDocument = {
  key: SeriesKey
  period: string
  dimensions: string[]
  readings: Reading[]
}

type ChartPoint = {
  x: number
  y: number
  label: string
}

type ChartSeries = {
  name: string
  color: string
  points: ChartPoint[]
}

const MODEL_COLORS = ["#2f80ed", "#7c6cf0", "#ef6351", "#5b8c5a", "#d97706", "#3e5b7b"]

function colorFor(name: string) {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) hash = (hash * 31 + name.charCodeAt(index)) >>> 0
  return MODEL_COLORS[hash % MODEL_COLORS.length]
}

function timeWindow(range: Range, now: number) {
  if (range === "hour") return { start: now - 60 * 60 * 1000, end: now }
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return { start: start.getTime(), end: now }
}

function yearsFor(start: number, end: number) {
  const endYear = new Date(end).getUTCFullYear()
  const startYear = new Date(start).getUTCFullYear()
  return startYear === endYear ? [String(endYear)] : [String(startYear), String(endYear)]
}

function utcDaysOverlapping(start: number, end: number) {
  const days: string[] = []
  const cursor = new Date(start)
  cursor.setUTCHours(0, 0, 0, 0)
  while (cursor.getTime() <= end) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return new Set(days)
}

function readingMs(value: number) {
  return value < 1e12 ? value * 1000 : value
}

function formatTick(ms: number, range: Range) {
  const date = new Date(ms)
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return range === "hour" ? `${hours}:${minutes}` : `${hours}:00`
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)
}

function formatMoney(value: number) {
  if (!Number.isFinite(value)) return "—"
  const digits = value !== 0 && Math.abs(value) < 0.01 ? 6 : 2
  return `$${value.toFixed(digits)}`
}

function formatLatency(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—"
  if (value < 1000) return `${Math.round(value)} ms`
  return `${(value / 1000).toFixed(2)} s`
}

function formatCompact(value: number) {
  if (!Number.isFinite(value)) return "—"
  const abs = Math.abs(value)
  const sign = value < 0 ? "-" : ""
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`
  return formatCount(value)
}

function regression(points: { x: number; y: number }[]) {
  const count = points.length
  if (count < 2) return null
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0
  for (const point of points) {
    sumX += point.x
    sumY += point.y
    sumXY += point.x * point.y
    sumXX += point.x * point.x
  }
  const denom = count * sumXX - sumX * sumX
  if (!denom) return null
  const slope = (count * sumXY - sumX * sumY) / denom
  return { slope, intercept: (sumY - slope * sumX) / count }
}

async function loadSeries(portfolio: string, org: string, key: SeriesKey, year: string) {
  const response = await fetch(
    `${import.meta.env.VITE_API_URL}/_timeseries/${encodeURIComponent(portfolio)}/${encodeURIComponent(org)}/${encodeURIComponent(key)}?period=${encodeURIComponent(year)}`,
    { headers: { Authorization: `Bearer ${sessionStorage.accessToken}` } },
  )
  const text = await response.text()
  let data: Record<string, unknown> = {}
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>
    } catch {
      data = { error: text }
    }
  }
  if (!response.ok || data.success === false) {
    throw new Error(String(data.error || data.message || `Request failed (${response.status})`))
  }
  const output = (data.output || {}) as { series?: Record<string, unknown>[] }
  const documents: UsageDocument[] = []
  for (const item of output.series || []) {
    if (item.resolution !== "day" || typeof item.period !== "string") continue
    const dimensions = Array.isArray(item.dimensions) ? item.dimensions.map(String) : []
    if (dimensions.length !== 4) continue
    const readings = Array.isArray(item.readings) ? item.readings.flatMap((pair) => {
      if (!Array.isArray(pair) || pair.length < 2) return []
      const at = readingMs(Number(pair[0]))
      const value = Number(pair[1])
      if (!Number.isFinite(at) || !Number.isFinite(value)) return []
      return [{ at, value }]
    }) : []
    if (!readings.length) continue
    documents.push({ key, period: item.period, dimensions, readings })
  }
  return documents
}

function bucketed(documents: UsageDocument[], key: SeriesKey, mode: "sum" | "avg", range: Range) {
  const size = range === "hour" ? 60_000 : 3_600_000
  const buckets = new Map<number, { sum: number; count: number }>()
  for (const document of documents) {
    if (document.key !== key) continue
    for (const reading of document.readings) {
      const slot = Math.floor(reading.at / size) * size
      const bucket = buckets.get(slot) || { sum: 0, count: 0 }
      bucket.sum += reading.value
      bucket.count += 1
      buckets.set(slot, bucket)
    }
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([slot, bucket]) => ({
      x: slot,
      y: mode === "avg" ? (bucket.count ? bucket.sum / bucket.count : 0) : bucket.sum,
      label: formatTick(slot, range),
    }))
}

function toChartSeries(name: string, color: string, points: ChartPoint[]): ChartSeries {
  return { name, color, points }
}

function UsageChart({ series, view, domain, range }: { series: ChartSeries[]; view: ChartView; domain: { start: number; end: number }; range: Range }) {
  const width = 640
  const height = 176
  const pad = { t: 10, r: 8, b: 24, l: 46 }
  const drawn = series.filter((item) => item.points.length)
  const points = drawn.flatMap((item) => item.points)
  if (!points.length) return <p className="empty">No token readings for this range.</p>
  const minX = domain.start
  const maxX = domain.end > domain.start ? domain.end : domain.start + 1
  const minY = Math.min(0, ...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const ySpan = maxY - minY || Math.abs(maxY) || 1
  const yMax = maxY + ySpan * 0.08
  const innerW = width - pad.l - pad.r
  const plotX = (x: number) => pad.l + ((x - minX) / (maxX - minX)) * innerW
  const plotY = (y: number) => height - pad.b - ((y - minY) / (yMax - minY)) * (height - pad.t - pad.b)
  const yTicks = [0, 1, 2, 3].map((index) => minY + ((yMax - minY) * index) / 3)
  const xTicks = Array.from({ length: 6 }, (_, index) => minX + ((maxX - minX) * index) / 5)
  const bucket = range === "hour" ? 60_000 : 3_600_000
  const groupWidth = Math.min(28, Math.max(3, (bucket / (maxX - minX)) * innerW * 0.7))
  const barWidth = groupWidth / Math.max(drawn.length, 1)
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Token usage chart">
      <defs>
        <linearGradient id="llm-token-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2f80ed" stopOpacity="0.18" />
          <stop offset="1" stopColor="#2f80ed" stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((value, index) => {
        const y = plotY(value)
        return (
          <g key={index}>
            <line x1={pad.l} x2={width - pad.r} y1={y} y2={y} className="grid-line" />
            <text x={pad.l - 8} y={y + 3} textAnchor="end" className="axis-label">{formatCompact(value)}</text>
          </g>
        )
      })}
      {xTicks.map((value) => (
        <text key={value} x={plotX(value)} y={height - 6} textAnchor="middle" className="axis-label">{formatTick(value, range)}</text>
      ))}
      {view === "line" ? drawn.map((item) => {
        const coords = item.points.map((point) => ({ x: plotX(point.x), y: plotY(point.y) }))
        const first = coords[0]
        const last = coords[coords.length - 1]
        if (!first || !last) return null
        if (coords.length === 1) return <circle key={item.name} cx={first.x} cy={first.y} r="3.5" fill={item.color} />
        const path = coords.map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ")
        const area = `${path} L ${last.x} ${plotY(minY)} L ${first.x} ${plotY(minY)} Z`
        const outputSeries = item.name === "Output tokens"
        return (
          <g key={item.name}>
            {outputSeries ? null : <path d={area} fill="url(#llm-token-fill)" />}
            <path d={path} fill="none" stroke={item.color} strokeWidth={outputSeries ? 2 : 2.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={outputSeries ? "4 4" : undefined} />
          </g>
        )
      }) : drawn.map((item, seriesIndex) => (
        <g key={item.name}>
          {item.points.map((point) => {
            const x = plotX(point.x) - groupWidth / 2 + seriesIndex * barWidth
            const y = plotY(point.y)
            return <rect key={point.x} x={x} y={y} width={Math.max(barWidth - 1, 1)} height={Math.max(0, plotY(minY) - y)} fill={item.color} opacity={item.name === "Output tokens" ? 0.55 : 0.9} rx="1.5" />
          })}
        </g>
      ))}
    </svg>
  )
}

function CostScatter({ points }: { points: { name: string; tokens: number; cost: number; color: string }[] }) {
  const plotted = points.filter((point) => point.tokens > 0 || point.cost > 0)
  if (!plotted.length) return <p className="empty">No cost readings for this range.</p>
  const width = 320
  const height = 155
  const pad = { l: 28, r: 10, t: 14, b: 18 }
  const maxX = Math.max(...plotted.map((point) => point.tokens), 1)
  const maxY = Math.max(...plotted.map((point) => point.cost), 1e-9)
  const xOf = (value: number) => pad.l + (value / maxX) * (width - pad.l - pad.r)
  const yOf = (value: number) => height - pad.b - (value / maxY) * (height - pad.t - pad.b)
  const fit = regression(plotted.map((point) => ({ x: point.tokens, y: point.cost })))
  return (
    <div className="scatter">
      <span className="scatter-y">cost</span>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cost against total tokens">
        {[0.25, 0.5, 0.75, 1].map((step) => (
          <line key={step} x1={pad.l} x2={width - pad.r} y1={yOf(maxY * step)} y2={yOf(maxY * step)} stroke="#e3e7ed" strokeDasharray="3 5" />
        ))}
        {fit ? (
          <line
            x1={xOf(0)}
            y1={yOf(Math.min(maxY, Math.max(0, fit.intercept)))}
            x2={xOf(maxX)}
            y2={yOf(Math.min(maxY, Math.max(0, fit.intercept + fit.slope * maxX)))}
            stroke="#94a3b8"
            strokeDasharray="5 5"
          />
        ) : null}
        {plotted.map((point) => (
          <g key={point.name}>
            <title>{`${point.name}: ${formatCompact(point.tokens)} tokens, ${formatMoney(point.cost)}`}</title>
            <circle cx={xOf(point.tokens)} cy={yOf(point.cost)} r="4" fill={point.color} />
          </g>
        ))}
      </svg>
      <span className="scatter-x">tokens</span>
    </div>
  )
}

function MetricCard({ title, value, note, color, icon: Icon }: { title: string; value: string; note: string; color: string; icon: typeof Zap }) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{title}</span>
        <span className="metric-icon" style={{ color }}><Icon size={16} /></span>
      </div>
      <strong>{value}</strong>
      <div className="metric-note">{note}</div>
    </div>
  )
}

export default function LlmUsage({ portfolio, org, revision }: LlmUsageProps) {
  const [range, setRange] = useState<Range>("hour")
  const [provider, setProvider] = useState("all")
  const [model, setModel] = useState("all")
  const [view, setView] = useState<ChartView>("line")
  const [documents, setDocuments] = useState<UsageDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [refreshTick, setRefreshTick] = useState(0)
  const [asOf, setAsOf] = useState(() => Date.now())

  useEffect(() => {
    setProvider("all")
    setModel("all")
  }, [portfolio, org])

  useEffect(() => {
    let cancelled = false
    const now = Date.now()
    const { start, end } = timeWindow(range, now)
    const days = utcDaysOverlapping(start, end)
    setAsOf(now)
    setLoading(true)
    setError("")
    Promise.all(
      yearsFor(start, end).flatMap((year) => SERIES.map((key) => loadSeries(portfolio, org, key, year))),
    )
      .then((groups) => {
        if (cancelled) return
        setDocuments(groups.flat().filter((item) => days.has(item.period)))
      })
      .catch((exc) => {
        if (cancelled) return
        setDocuments([])
        setError(exc instanceof Error ? exc.message : "Could not load usage")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [portfolio, org, range, revision, refreshTick])

  const span = useMemo(() => timeWindow(range, asOf), [range, asOf])

  const timed = useMemo(
    () => documents.flatMap((item) => {
      const readings = item.readings.filter((reading) => reading.at >= span.start && reading.at <= span.end)
      return readings.length ? [{ ...item, readings }] : []
    }),
    [documents, span],
  )

  const inView = useMemo(
    () => timed.filter((item) => (
      (provider === "all" || item.dimensions[0] === provider)
      && (model === "all" || item.dimensions[1] === model)
    )),
    [timed, provider, model],
  )

  const providers = useMemo(
    () => [...new Set(timed.map((item) => item.dimensions[0]))].sort(),
    [timed],
  )
  const models = useMemo(
    () => [...new Set(timed.filter((item) => provider === "all" || item.dimensions[0] === provider).map((item) => item.dimensions[1]))].sort(),
    [timed, provider],
  )

  useEffect(() => {
    if (model !== "all" && !models.includes(model)) setModel("all")
  }, [model, models])

  const totals = useMemo(() => {
    const total = { requests: 0, errors: 0, input: 0, output: 0, cost: 0, latencySum: 0, latencyCount: 0 }
    for (const item of inView) {
      const sum = item.readings.reduce((count, reading) => count + reading.value, 0)
      if (item.key === "llm.requests") total.requests += sum
      if (item.key === "llm.errors") total.errors += sum
      if (item.key === "llm.input_tokens") total.input += sum
      if (item.key === "llm.output_tokens") total.output += sum
      if (item.key === "llm.cost_usd") total.cost += sum
      if (item.key === "llm.latency_ms") {
        total.latencySum += sum
        total.latencyCount += item.readings.length
      }
    }
    return total
  }, [inView])

  const tokenSeries = useMemo(() => [
    toChartSeries("Input tokens", "#2f80ed", bucketed(inView, "llm.input_tokens", "sum", range)),
    toChartSeries("Output tokens", "#7c6cf0", bucketed(inView, "llm.output_tokens", "sum", range)),
  ], [inView, range])

  const latencyPoints = useMemo(
    () => bucketed(inView, "llm.latency_ms", "avg", range),
    [inView, range],
  )

  const rows = useMemo(() => {
    const grouped = new Map<string, {
      provider: string
      model: string
      status: string
      extension: string
      requests: number
      errors: number
      input: number
      output: number
      latencySum: number
      latencyCount: number
      cost: number
    }>()
    for (const item of inView) {
      const [rowProvider, rowModel, status, extension] = item.dimensions
      const id = item.dimensions.join("\t")
      const row = grouped.get(id) || {
        provider: rowProvider,
        model: rowModel,
        status,
        extension,
        requests: 0,
        errors: 0,
        input: 0,
        output: 0,
        latencySum: 0,
        latencyCount: 0,
        cost: 0,
      }
      const sum = item.readings.reduce((count, reading) => count + reading.value, 0)
      if (item.key === "llm.requests") row.requests += sum
      if (item.key === "llm.errors") row.errors += sum
      if (item.key === "llm.input_tokens") row.input += sum
      if (item.key === "llm.output_tokens") row.output += sum
      if (item.key === "llm.cost_usd") row.cost += sum
      if (item.key === "llm.latency_ms") {
        row.latencySum += sum
        row.latencyCount += item.readings.length
      }
      grouped.set(id, row)
    }
    return [...grouped.values()].sort((left, right) => right.requests - left.requests || left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model))
  }, [inView])

  const modelPoints = useMemo(() => {
    const grouped = new Map<string, { name: string; tokens: number; cost: number; requests: number }>()
    for (const row of rows) {
      const current = grouped.get(row.model) || { name: row.model, tokens: 0, cost: 0, requests: 0 }
      current.tokens += row.input + row.output
      current.cost += row.cost
      current.requests += row.requests
      grouped.set(row.model, current)
    }
    return [...grouped.values()]
      .sort((left, right) => right.requests - left.requests || left.name.localeCompare(right.name))
      .map((point) => ({ ...point, color: colorFor(point.name) }))
  }, [rows])

  const hasUsage = inView.length > 0
  const waiting = loading && !hasUsage && !error
  const latency = totals.latencyCount ? totals.latencySum / totals.latencyCount : null
  const latencyPeak = latencyPoints.length ? Math.max(...latencyPoints.map((point) => point.y)) : null
  const tokenTotal = totals.input + totals.output
  const inputShare = tokenTotal ? (totals.input / tokenTotal) * 100 : 0
  const outputShare = tokenTotal ? (totals.output / tokenTotal) * 100 : 0
  const avgOutput = totals.requests ? Math.round(totals.output / totals.requests) : null
  const rangeLabel = range === "hour" ? "Last 60 minutes" : "Today"

  return (
    <>
      <div className="filters">
        <label className="select-box">
          <span className="select-label">Provider</span>
          <select value={provider} onChange={(event) => setProvider(event.target.value)}>
            <option value="all">All providers</option>
            {providers.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <ChevronDown size={14} />
        </label>
        <label className="select-box">
          <span className="select-label">Model</span>
          <select value={models.includes(model) ? model : "all"} onChange={(event) => setModel(event.target.value)}>
            <option value="all">All models</option>
            {models.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <ChevronDown size={14} />
        </label>
        <label className="select-box">
          <span className="select-label">Time window</span>
          <select value={range} onChange={(event) => setRange(event.target.value as Range)}>
            <option value="hour">Last 60 minutes</option>
            <option value="day">Today</option>
          </select>
          <ChevronDown size={14} />
        </label>
        <div className="filter-spacer" />
        <button type="button" className="filter-button" onClick={() => setRefreshTick((value) => value + 1)} disabled={loading}>
          <RefreshCw size={15} className={loading ? "spin" : undefined} />
          Refresh
        </button>
      </div>
      {error ? <p className="notice" role="alert">{error}</p> : null}
      {waiting ? <p className="empty">Loading usage…</p> : null}
      {!error && !waiting ? (
        <>
          <div className="metric-grid">
            <MetricCard title="Total requests" value={formatCount(totals.requests)} note={`${formatCount(totals.errors)} errors`} color="#d97706" icon={Zap} />
            <MetricCard title="Total cost" value={formatMoney(totals.cost)} note="Estimated" color="#7c6cf0" icon={Activity} />
            <MetricCard title="Avg. latency" value={formatLatency(latency)} note={rangeLabel} color="#2f80ed" icon={Clock} />
            <MetricCard title="Tokens processed" value={formatCompact(tokenTotal)} note={`${formatCompact(totals.input)} in · ${formatCompact(totals.output)} out`} color="#5b8c5a" icon={Layers} />
          </div>
          <div className="dashboard-grid">
            <section className="panel chart-panel">
              <div className="panel-header">
                <div>
                  <h2>Token usage</h2>
                  <p>{range === "hour" ? "Last 60 minutes, one point per minute." : "Today, one point per hour."}</p>
                </div>
                <div className="segmented" role="group" aria-label="Chart view">
                  <button type="button" className={view === "line" ? "active" : ""} onClick={() => setView("line")}><LineChart size={14} />Line</button>
                  <button type="button" className={view === "bar" ? "active" : ""} onClick={() => setView("bar")}><BarChart3 size={14} />Bars</button>
                </div>
              </div>
              <div className="legend">
                <span><i className="dot cyan" />Input tokens</span>
                <span><i className="dot violet" />Output tokens</span>
                <span className="chart-stat">{formatCompact(tokenTotal)} total</span>
              </div>
              <UsageChart series={tokenSeries} view={view} domain={span} range={range} />
            </section>
            <section className="panel donut-panel">
              <div className="panel-header">
                <div>
                  <h2>Token composition</h2>
                  <p>By direction · {rangeLabel.toLowerCase()}</p>
                </div>
              </div>
              <div className="donut-content">
                <div className="donut" style={{ background: tokenTotal ? `conic-gradient(#2f80ed 0 ${inputShare}%, #7c6cf0 ${inputShare}% 100%)` : "#e8edf2" }}>
                  <div className="donut-hole"><strong>{formatCompact(tokenTotal)}</strong><span>tokens</span></div>
                </div>
                <div className="donut-legend">
                  <div><i className="dot cyan" /><span>Input</span><strong>{formatCompact(totals.input)} <small>{tokenTotal ? `${inputShare.toFixed(1)}%` : "—"}</small></strong></div>
                  <div><i className="dot violet" /><span>Output</span><strong>{formatCompact(totals.output)} <small>{tokenTotal ? `${outputShare.toFixed(1)}%` : "—"}</small></strong></div>
                  <div className="donut-foot"><span>Avg. output / request</span><strong>{avgOutput == null ? "—" : `${formatCount(avgOutput)} tokens`}</strong></div>
                </div>
              </div>
            </section>
            <section className="panel scatter-panel">
              <div className="panel-header">
                <div>
                  <h2>Cost efficiency</h2>
                  <p>Cost against total tokens</p>
                </div>
              </div>
              <CostScatter points={modelPoints} />
              {modelPoints.length ? (
                <div className="scatter-footer">
                  {modelPoints.map((point) => (
                    <span key={point.name}><i className="dot" style={{ background: point.color }} />{point.name}</span>
                  ))}
                </div>
              ) : null}
            </section>
          </div>
          <div className="bottom-grid">
            <section className="panel models-panel">
              <div className="panel-header">
                <div>
                  <h2>Model share</h2>
                  <p>Requests and cost by provider, model, status, and extension.</p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th>Provider</th>
                      <th>Status</th>
                      <th>Extension</th>
                      <th>Requests</th>
                      <th>Share</th>
                      <th>Errors</th>
                      <th>Input</th>
                      <th>Output</th>
                      <th>Avg latency</th>
                      <th>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length ? rows.map((row) => {
                      const share = totals.requests ? (row.requests / totals.requests) * 100 : 0
                      return (
                        <tr key={`${row.provider}-${row.model}-${row.status}-${row.extension}`}>
                          <td className="model-name"><i className="dot" style={{ background: colorFor(row.model) }} />{row.model}</td>
                          <td>{row.provider}</td>
                          <td>{row.status}</td>
                          <td>{row.extension}</td>
                          <td>{formatCount(row.requests)}</td>
                          <td><b className="share-bar"><i style={{ width: `${share}%` }} /></b>{share.toFixed(1)}%</td>
                          <td>{formatCount(row.errors)}</td>
                          <td>{formatCount(row.input)}</td>
                          <td>{formatCount(row.output)}</td>
                          <td>{formatLatency(row.latencyCount ? row.latencySum / row.latencyCount : null)}</td>
                          <td>{formatMoney(row.cost)}</td>
                        </tr>
                      )
                    }) : (
                      <tr><td className="empty" colSpan={11}>No LLM usage recorded for this range.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="panel latency-panel">
              <div className="panel-header">
                <div>
                  <h2>Latency</h2>
                  <p>{rangeLabel}</p>
                </div>
              </div>
              {latencyPoints.length ? (
                <div className="latency-chart">
                  <div className="latency-bars">
                    {latencyPoints.map((point) => (
                      <i key={point.x} style={{ height: `${latencyPeak ? Math.max(2, (point.y / latencyPeak) * 100) : 0}%` }} title={`${point.label}: ${formatLatency(point.y)}`} />
                    ))}
                  </div>
                </div>
              ) : <p className="empty">No latency readings for this range.</p>}
              <div className="latency-labels">
                <span>avg <b>{formatLatency(latency)}</b></span>
                <span>peak <b>{formatLatency(latencyPeak)}</b></span>
                <span>errors <b>{formatCount(totals.errors)}</b></span>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </>
  )
}
