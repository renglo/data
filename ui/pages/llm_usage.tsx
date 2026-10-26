import { useEffect, useMemo, useState } from "react"

interface LlmUsageProps {
  portfolio: string
  org: string
  revision: number
}

type Range = "hour" | "day"
type Metric = "requests" | "tokens" | "cost" | "latency"

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

const METRIC_COLORS = {
  requests: "#2f80ed",
  input: "#ef6351",
  output: "#5b8c5a",
  cost: "#7c6cf0",
  latency: "#2f80ed",
}

const usageCss = `
.llm-usage .toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; margin-top: 16px; }
.llm-usage .toolbar label { margin: 0; min-width: 160px; flex: 0 1 200px; }
.llm-usage .segmented { display: flex; border: 1px solid #e3e7ed; border-radius: 6px; padding: 2px; background: #f8f9fb; }
.llm-usage .segmented button { background: transparent; border: 0; padding: 6px 10px; border-radius: 4px; color: #7b8594; font-size: 11px; font-weight: 700; }
.llm-usage .segmented button.active { background: #fff; color: #273241; box-shadow: 0 1px 3px #dfe3e8; }
.llm-usage .refresh { border: 1px solid #e3e7ed; background: #fff; color: #5d6877; border-radius: 7px; padding: 7px 12px; font-size: 11px; font-weight: 700; }
.llm-usage .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin-top: 18px; }
.llm-usage .card { background: #f8f9fb; border: 1px solid #eef1f5; border-radius: 8px; padding: 12px; }
.llm-usage .card span { display: block; color: #8a94a2; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.llm-usage .card strong { display: block; margin-top: 4px; color: #1d2633; font-size: 18px; letter-spacing: -.03em; }
.llm-usage .chart-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 22px; }
.llm-usage .chart-head p { margin: 0; }
.llm-usage .legend { display: flex; gap: 16px; margin: 8px 0 0; color: #72808f; font-size: 10px; flex-wrap: wrap; }
.llm-usage .legend span { display: flex; gap: 6px; align-items: center; }
.llm-usage .legend i { width: 14px; height: 3px; border-radius: 3px; }
.llm-usage .chart { display: block; width: 100%; height: auto; margin-top: 4px; }
.llm-usage .grid-line { stroke: #edf0f3; stroke-width: 1; }
.llm-usage .axis-label { fill: #9aa3ae; font-size: 10px; }
.llm-usage .table-wrap { overflow-x: auto; }
`

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

function formatAxis(metric: Metric, value: number) {
  if (metric === "cost") return formatMoney(value)
  if (metric === "latency") return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}`
  return formatCount(value)
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

function UsageChart({ series, metric, domain, range }: { series: ChartSeries[]; metric: Metric; domain: { start: number; end: number }; range: Range }) {
  const width = 900
  const height = 240
  const pad = { t: 16, r: 16, b: 32, l: 56 }
  const points = series.flatMap((item) => item.points)
  if (!points.length) return <p className="empty">No readings for this metric.</p>
  const minX = domain.start
  const maxX = domain.end > domain.start ? domain.end : domain.start + 1
  const minY = Math.min(0, ...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const ySpan = maxY - minY || Math.abs(maxY) || 1
  const yMax = maxY + ySpan * 0.08
  const plotX = (x: number) => {
    const inner = width - pad.l - pad.r
    if (maxX === minX) return pad.l + inner / 2
    return pad.l + ((x - minX) / (maxX - minX)) * inner
  }
  const plotY = (y: number) => height - pad.b - ((y - minY) / (yMax - minY)) * (height - pad.t - pad.b)
  const yTicks = [minY, minY + (yMax - minY) / 2, yMax]
  const xTicks = Array.from({ length: 7 }, (_, index) => minX + ((maxX - minX) * index) / 6)
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="LLM usage chart">
      {yTicks.map((value) => {
        const y = plotY(value)
        return (
          <g key={value}>
            <line x1={pad.l} x2={width - pad.r} y1={y} y2={y} className="grid-line" />
            <text x={pad.l - 8} y={y + 3} textAnchor="end" className="axis-label">{formatAxis(metric, value)}</text>
          </g>
        )
      })}
      {xTicks.map((value) => (
        <text key={value} x={plotX(value)} y={height - 8} textAnchor="middle" className="axis-label">{formatTick(value, range)}</text>
      ))}
      {series.map((item) => (
        <g key={item.name}>
          {item.points.length > 1 ? (
            <polyline
              points={item.points.map((point) => `${plotX(point.x)},${plotY(point.y)}`).join(" ")}
              fill="none"
              stroke={item.color}
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {item.points.map((point) => (
            <circle key={`${item.name}-${point.x}`} cx={plotX(point.x)} cy={plotY(point.y)} r="3.5" fill={item.color} />
          ))}
        </g>
      ))}
    </svg>
  )
}

export default function LlmUsage({ portfolio, org, revision }: LlmUsageProps) {
  const [range, setRange] = useState<Range>("hour")
  const [provider, setProvider] = useState("all")
  const [model, setModel] = useState("all")
  const [metric, setMetric] = useState<Metric>("requests")
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

  const chartSeries = useMemo(() => {
    if (metric === "tokens") {
      return [
        toChartSeries("Input tokens", METRIC_COLORS.input, bucketed(inView, "llm.input_tokens", "sum", range)),
        toChartSeries("Output tokens", METRIC_COLORS.output, bucketed(inView, "llm.output_tokens", "sum", range)),
      ].filter((item) => item.points.length)
    }
    if (metric === "cost") return [toChartSeries("Estimated cost", METRIC_COLORS.cost, bucketed(inView, "llm.cost_usd", "sum", range))]
    if (metric === "latency") return [toChartSeries("Average latency", METRIC_COLORS.latency, bucketed(inView, "llm.latency_ms", "avg", range))]
    return [toChartSeries("Requests", METRIC_COLORS.requests, bucketed(inView, "llm.requests", "sum", range))]
  }, [inView, metric, range])

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

  const hasUsage = inView.length > 0
  const latency = totals.latencyCount ? totals.latencySum / totals.latencyCount : null

  return (
    <section className="panel llm-usage">
      <style>{usageCss}</style>
      <div className="panel-header">
        <div>
          <h3>Usage</h3>
          <p>Last 60 minutes by default. Today is the local day, by provider, model, status, and extension.</p>
        </div>
        <button type="button" className="refresh" onClick={() => setRefreshTick((value) => value + 1)} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      <div className="toolbar">
        <div className="segmented" role="group" aria-label="Range">
          <button type="button" className={range === "hour" ? "active" : ""} onClick={() => setRange("hour")}>Last 60 minutes</button>
          <button type="button" className={range === "day" ? "active" : ""} onClick={() => setRange("day")}>Day</button>
        </div>
        <label>Provider
          <select value={provider} onChange={(event) => setProvider(event.target.value)}>
            <option value="all">All providers</option>
            {providers.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>Model
          <select value={models.includes(model) ? model : "all"} onChange={(event) => setModel(event.target.value)}>
            <option value="all">All models</option>
            {models.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>
      {error ? <p className="notice" role="alert">{error}</p> : null}
      {!error && loading && !hasUsage ? <p className="empty">Loading usage…</p> : null}
      {!error && !loading && !hasUsage ? <p className="empty">No LLM usage recorded for this range.</p> : null}
      {hasUsage ? (
        <>
          <div className="cards">
            <div className="card"><span>Requests</span><strong>{formatCount(totals.requests)}</strong></div>
            <div className="card"><span>Errors</span><strong>{formatCount(totals.errors)}</strong></div>
            <div className="card"><span>Input tokens</span><strong>{formatCount(totals.input)}</strong></div>
            <div className="card"><span>Output tokens</span><strong>{formatCount(totals.output)}</strong></div>
            <div className="card"><span>Estimated cost</span><strong>{formatMoney(totals.cost)}</strong></div>
            <div className="card"><span>Avg latency</span><strong>{formatLatency(latency)}</strong></div>
          </div>
          <div className="chart-head">
            <p>{range === "hour" ? "Last 60 minutes, one point per minute." : "Today, one point per hour."}</p>
            <div className="segmented" role="group" aria-label="Chart metric">
              {(["requests", "tokens", "cost", "latency"] as Metric[]).map((item) => (
                <button key={item} type="button" className={metric === item ? "active" : ""} onClick={() => setMetric(item)}>
                  {item === "requests" ? "Requests" : item === "tokens" ? "Tokens" : item === "cost" ? "Cost" : "Latency"}
                </button>
              ))}
            </div>
          </div>
          <div className="legend">
            {chartSeries.map((item) => (
              <span key={item.name}><i style={{ backgroundColor: item.color }} />{item.name}</span>
            ))}
          </div>
          <UsageChart series={chartSeries} metric={metric} domain={span} range={range} />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Model</th>
                  <th>Status</th>
                  <th>Extension</th>
                  <th>Requests</th>
                  <th>Errors</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Avg latency</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.provider}-${row.model}-${row.status}-${row.extension}`}>
                    <td>{row.provider}</td>
                    <td>{row.model}</td>
                    <td>{row.status}</td>
                    <td>{row.extension}</td>
                    <td>{formatCount(row.requests)}</td>
                    <td>{formatCount(row.errors)}</td>
                    <td>{formatCount(row.input)}</td>
                    <td>{formatCount(row.output)}</td>
                    <td>{formatLatency(row.latencyCount ? row.latencySum / row.latencyCount : null)}</td>
                    <td>{formatMoney(row.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  )
}
