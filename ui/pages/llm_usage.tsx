import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Activity, ChevronDown, ChevronLeft, ChevronRight, Clock, Copy, FileJson, Layers, Maximize2, RefreshCw, X, Zap } from "lucide-react"

interface LlmUsageProps {
  portfolio: string
  org: string
  revision: number
}

type Granularity = "month" | "week" | "day" | "hour"

const GRANULARITIES: { id: Granularity; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "day", label: "Day" },
  { id: "hour", label: "Hour" },
]

const SERIES = [
  "llm.requests",
  "llm.errors",
  "llm.latency_ms",
  "llm.input_tokens",
  "llm.output_tokens",
  "llm.reasoning_tokens",
  "llm.cached_tokens",
  "llm.cache_write_5m_tokens",
  "llm.cache_write_1h_tokens",
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

const MODEL_COLORS = [
  "#2f80ed",
  "#7c6cf0",
  "#ef6351",
  "#5b8c5a",
  "#d97706",
  "#0891b2",
  "#db2777",
  "#0f766e",
  "#9333ea",
  "#ca8a04",
  "#dc2626",
  "#4f46e5",
  "#65a30d",
  "#ea580c",
  "#0369a1",
  "#be185d",
]

function colorAt(index: number) {
  if (index < MODEL_COLORS.length) return MODEL_COLORS[index]
  const hue = (index * 137.508) % 360
  return `hsl(${hue.toFixed(1)} 64% 40%)`
}

function pad2(value: number) {
  return String(value).padStart(2, "0")
}

function windowFor(granularity: Granularity, anchorMs: number, now: number) {
  const anchor = new Date(anchorMs)
  let start: Date
  let endExclusive: Date
  if (granularity === "hour") {
    start = new Date(anchor)
    start.setMinutes(0, 0, 0)
    endExclusive = new Date(start.getTime() + 60 * 60 * 1000)
  } else if (granularity === "day") {
    start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
    endExclusive = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 1)
  } else if (granularity === "week") {
    endExclusive = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 1)
    start = new Date(endExclusive)
    start.setDate(start.getDate() - 7)
  } else {
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    endExclusive = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1)
  }
  return {
    start: start.getTime(),
    end: Math.min(endExclusive.getTime() - 1, now),
    endExclusive: endExclusive.getTime(),
  }
}

function shiftAnchor(granularity: Granularity, anchorMs: number, direction: -1 | 1, now: number) {
  const date = new Date(anchorMs)
  if (granularity === "hour") date.setHours(date.getHours() + direction)
  else if (granularity === "week") date.setDate(date.getDate() + direction * 7)
  else if (granularity === "month") {
    const day = date.getDate()
    date.setDate(1)
    date.setMonth(date.getMonth() + direction)
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
    date.setDate(Math.min(day, lastDay))
  } else date.setDate(date.getDate() + direction)
  return Math.min(date.getTime(), now)
}

function formatAnchorInput(ms: number, granularity: Granularity) {
  const date = new Date(ms)
  const day = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
  if (granularity !== "hour") return day
  return `${day}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function anchorFromInput(value: string, currentMs: number, granularity: Granularity, now: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value)
  if (!match) return currentMs
  const current = new Date(currentMs)
  const withTime = granularity === "hour" && match[4] != null
  const next = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    withTime ? Number(match[4]) : current.getHours(),
    withTime ? Number(match[5]) : current.getMinutes(),
    0,
    0,
  )
  const parsed = next.getTime()
  if (!Number.isFinite(parsed)) return currentMs
  return Math.min(parsed, now)
}

function bucketMs(granularity: Granularity) {
  if (granularity === "hour") return 60_000
  if (granularity === "day") return 3_600_000
  return 86_400_000
}

function formatWindowLabel(span: { start: number; end: number }, granularity: Granularity) {
  const start = new Date(span.start)
  const end = new Date(span.end)
  const day = (value: Date) => value.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  const clock = (value: Date) => value.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  if (granularity === "hour") return `${day(start)}, ${clock(start)} – ${clock(end)}`
  if (granularity === "day") return start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  if (start.toDateString() === end.toDateString()) return day(start)
  if (start.getFullYear() !== end.getFullYear()) {
    const full = (value: Date) => value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    return `${full(start)} – ${full(end)}`
  }
  return `${day(start)} – ${day(end)}`
}

function bucketCaption(granularity: Granularity) {
  if (granularity === "hour") return "One point per minute"
  if (granularity === "day") return "One point per hour"
  return "One point per day"
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

function formatTick(ms: number, granularity: Granularity) {
  const date = new Date(ms)
  if (granularity === "hour") return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  if (granularity === "day") return `${pad2(date.getHours())}:00`
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
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

function formatPerMillion(value: number) {
  if (!Number.isFinite(value)) return "—"
  const digits = value !== 0 && Math.abs(value) < 0.01 ? 4 : 2
  return `$${value.toFixed(digits)} / 1M`
}

function formatCostRatio(cost: number, tokens: number) {
  if (!(tokens > 0) || !Number.isFinite(cost)) return "—"
  return formatPerMillion((cost / tokens) * 1_000_000)
}

type ModelRates = {
  input_per_million: number
  output_per_million: number
  cache_write_5m_per_million: number | null
  cache_write_1h_per_million: number | null
  cache_read_per_million: number | null
  reasoning_per_million: number | null
}

function numberOrNull(value: unknown) {
  if (value == null || value === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function portion(tokens: number, pricePerMillion: number | null) {
  if (!(tokens > 0) || pricePerMillion == null || !Number.isFinite(pricePerMillion)) return 0
  return (tokens / 1_000_000) * pricePerMillion
}

function quoteCost(usage: { input: number; output: number; cached: number; reasoning: number; cacheWrite5m: number; cacheWrite1h: number }, rates: ModelRates) {
  return (
    portion(usage.input, rates.input_per_million)
    + portion(usage.output, rates.output_per_million)
    + portion(usage.cached, rates.cache_read_per_million)
    + portion(usage.cacheWrite5m, rates.cache_write_5m_per_million)
    + portion(usage.cacheWrite1h, rates.cache_write_1h_per_million)
    + portion(usage.reasoning, rates.reasoning_per_million)
  )
}

function formatCompact(value: number) {
  if (!Number.isFinite(value)) return "—"
  const abs = Math.abs(value)
  const sign = value < 0 ? "-" : ""
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`
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

function bucketStart(at: number, granularity: Granularity) {
  if (granularity === "week" || granularity === "month") {
    const date = new Date(at)
    date.setHours(0, 0, 0, 0)
    return date.getTime()
  }
  const size = bucketMs(granularity)
  return Math.floor(at / size) * size
}

function bucketed(documents: UsageDocument[], key: SeriesKey, mode: "sum" | "avg", granularity: Granularity) {
  const buckets = new Map<number, { sum: number; count: number }>()
  for (const document of documents) {
    if (document.key !== key) continue
    for (const reading of document.readings) {
      const slot = bucketStart(reading.at, granularity)
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
      label: formatTick(slot, granularity),
    }))
}

function toChartSeries(name: string, color: string, points: ChartPoint[]): ChartSeries {
  return { name, color, points }
}

function nextBucket(slot: number, granularity: Granularity) {
  if (granularity === "week" || granularity === "month") {
    const date = new Date(slot)
    date.setDate(date.getDate() + 1)
    return date.getTime()
  }
  return slot + bucketMs(granularity)
}

function cumulativeSeries(series: ChartSeries[], domain: { start: number; end: number }, granularity: Granularity): ChartSeries[] {
  const slots: number[] = []
  let cursor = bucketStart(domain.start, granularity)
  while (cursor <= domain.end && slots.length < 400) {
    const bucketEnd = nextBucket(cursor, granularity)
    if (bucketEnd > domain.start) slots.push(cursor)
    cursor = bucketEnd
  }
  return series.map((item) => {
    const bySlot = new Map(item.points.map((point) => [point.x, point.y]))
    let total = 0
    const points: ChartPoint[] = [{ x: domain.start, y: 0, label: formatTick(domain.start, granularity) }]
    for (const slot of slots) {
      total += bySlot.get(slot) || 0
      const x = Math.min(Math.max(nextBucket(slot, granularity) - 1, domain.start), domain.end)
      const previous = points[points.length - 1]
      if (previous && x <= previous.x) {
        previous.y = total
        continue
      }
      points.push({ x, y: total, label: formatTick(slot, granularity) })
    }
    return { name: item.name, color: item.color, points }
  })
}

function UsageChart({ series, mode, domain, granularity, large = false, size }: { series: ChartSeries[]; mode: "bar" | "line"; domain: { start: number; end: number }; granularity: Granularity; large?: boolean; size?: { width: number; height: number } }) {
  const width = size?.width || (large ? 960 : 640)
  const height = size?.height || (large ? 440 : 176)
  const pad = large ? { t: 18, r: 20, b: 40, l: 68 } : { t: 10, r: 8, b: 24, l: 46 }
  const drawn = series.filter((item) => item.points.length)
  const points = drawn.flatMap((item) => item.points)
  if (!points.length) return null
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
  const xTickCount = large ? 8 : 6
  const xTicks = Array.from({ length: xTickCount }, (_, index) => minX + ((maxX - minX) * index) / (xTickCount - 1))
  const bucket = bucketMs(granularity)
  const groupWidth = Math.min(large ? 40 : 28, Math.max(3, (bucket / (maxX - minX)) * innerW * 0.7))
  const barWidth = groupWidth / Math.max(drawn.length, 1)
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={mode === "line" ? "Cumulative token usage" : "Token usage by bucket"}>
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
        <text key={value} x={plotX(value)} y={height - 6} textAnchor="middle" className="axis-label">{formatTick(value, granularity)}</text>
      ))}
      {mode === "line" ? drawn.map((item) => {
        const coords = item.points.map((point) => ({ x: plotX(point.x), y: plotY(point.y) }))
        const first = coords[0]
        if (!first) return null
        if (coords.length === 1) return <circle key={item.name} cx={first.x} cy={first.y} r="3.5" fill={item.color} />
        const path = coords.map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ")
        return <path key={item.name} d={path} fill="none" stroke={item.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
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

function ChartSlot({ children }: { children: (size: { width: number; height: number }) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const update = () => {
      const next = { width: Math.floor(node.clientWidth), height: Math.floor(node.clientHeight) }
      setSize((current) => (current.width === next.width && current.height === next.height ? current : next))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return <div className="chart-slot" ref={ref}>{size.width > 0 && size.height > 0 ? children(size) : null}</div>
}

function TokenCharts({ series, domain, granularity, large = false }: { series: ChartSeries[]; domain: { start: number; end: number }; granularity: Granularity; large?: boolean }) {
  if (!series.some((item) => item.points.length)) return <p className="empty">No token readings for this range.</p>
  const cumulative = cumulativeSeries(series, domain, granularity)
  if (large) {
    return (
      <div className="usage-charts">
        <UsageChart series={series} mode="bar" domain={domain} granularity={granularity} large />
        <p className="chart-caption">Cumulative</p>
        <UsageChart series={cumulative} mode="line" domain={domain} granularity={granularity} large />
      </div>
    )
  }
  return (
    <div className="usage-charts">
      <ChartSlot>{(size) => <UsageChart series={series} mode="bar" domain={domain} granularity={granularity} size={size} />}</ChartSlot>
      <p className="chart-caption">Cumulative</p>
      <ChartSlot>{(size) => <UsageChart series={cumulative} mode="line" domain={domain} granularity={granularity} size={size} />}</ChartSlot>
    </div>
  )
}

type CostPoint = {
  provider: string
  model: string
  input: number
  output: number
  tokens: number
  cost: number
  color: string
}

function logSpan(values: number[]) {
  const logs = values.filter((value) => value > 0).map((value) => Math.log10(value))
  const low = Math.min(...logs)
  const high = Math.max(...logs)
  const pad = Math.max((high - low) * 0.18, 0.2)
  return { min: 10 ** (low - pad), max: 10 ** (high + pad) }
}

function logTicks(min: number, max: number) {
  const start = Math.floor(Math.log10(min))
  const end = Math.ceil(Math.log10(max))
  const marks = end - start <= 2 ? [1, 2, 5] : [1]
  const ticks: number[] = []
  for (let exponent = start; exponent <= end; exponent += 1) {
    for (const mark of marks) {
      const value = mark * 10 ** exponent
      if (value >= min && value <= max) ticks.push(value)
    }
  }
  return ticks
}

function clipRateLine(slope: number, minX: number, maxX: number, minY: number, maxY: number) {
  if (!(slope > 0)) return null
  const inside: { x: number; y: number }[] = []
  const consider = (x: number, y: number) => {
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) inside.push({ x, y })
  }
  consider(minX, slope * minX)
  consider(maxX, slope * maxX)
  consider(minY / slope, minY)
  consider(maxY / slope, maxY)
  if (inside.length < 2) return null
  inside.sort((left, right) => left.x - right.x)
  return { x1: inside[0].x, y1: inside[0].y, x2: inside[inside.length - 1].x, y2: inside[inside.length - 1].y }
}

function CostScatter({ points, large = false, scale = "linear" }: { points: CostPoint[]; large?: boolean; scale?: "linear" | "log" }) {
  const plotted = points.filter((point) => point.tokens > 0 && point.cost > 0)
  if (!plotted.length) return <p className="empty">No recorded cost for this range.</p>
  const width = large ? 960 : 320
  const height = large ? 520 : 155
  const pad = large ? { l: 78, r: 24, t: 16, b: 36 } : { l: 44, r: 12, t: 12, b: 22 }
  const logarithmic = scale === "log"
  const xSpan = logarithmic
    ? logSpan(plotted.map((point) => point.tokens))
    : { min: 0, max: Math.max(...plotted.map((point) => point.tokens), 0) * 1.15 || 1 }
  const ySpan = logarithmic
    ? logSpan(plotted.map((point) => point.cost))
    : { min: 0, max: Math.max(...plotted.map((point) => point.cost), 0) * 1.15 || 1 }
  const xOf = (value: number) => pad.l + (logarithmic
    ? (Math.log10(value) - Math.log10(xSpan.min)) / (Math.log10(xSpan.max) - Math.log10(xSpan.min))
    : value / xSpan.max) * (width - pad.l - pad.r)
  const yOf = (value: number) => height - pad.b - (logarithmic
    ? (Math.log10(value) - Math.log10(ySpan.min)) / (Math.log10(ySpan.max) - Math.log10(ySpan.min))
    : value / ySpan.max) * (height - pad.t - pad.b)
  const yTicks = logarithmic ? logTicks(ySpan.min, ySpan.max) : [0, 0.5, 1].map((step) => ySpan.max * step)
  const xTicks = logarithmic ? logTicks(xSpan.min, xSpan.max) : [0, 0.5, 1].map((step) => xSpan.max * step)
  const radius = large ? 8 : 5
  return (
    <div className="scatter">
      <span className="scatter-y">cost</span>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={logarithmic ? "Logarithmic cost against logarithmic tokens. Each dashed line is that model's cost per million tokens." : "Cost against tokens. Each dashed line is that model's cost per million tokens."}>
        {yTicks.map((value) => (
          <g key={`y-${value}`}>
            <line x1={pad.l} x2={width - pad.r} y1={yOf(value)} y2={yOf(value)} stroke="#e3e7ed" strokeDasharray="3 5" />
            {large ? <text x={pad.l - 8} y={yOf(value) + 3} textAnchor="end" className="axis-label">{formatMoney(value)}</text> : null}
          </g>
        ))}
        {large ? xTicks.map((value) => (
          <text key={`x-${value}`} x={xOf(value)} y={height - 12} textAnchor="middle" className="axis-label">{formatCompact(value)}</text>
        )) : null}
        {plotted.map((point) => {
          const slope = point.cost / point.tokens
          const line = logarithmic
            ? clipRateLine(slope, xSpan.min, xSpan.max, ySpan.min, ySpan.max)
            : slope > 0 && slope * xSpan.max <= ySpan.max
              ? { x1: 0, y1: 0, x2: xSpan.max, y2: slope * xSpan.max }
              : slope > 0
                ? { x1: 0, y1: 0, x2: ySpan.max / slope, y2: ySpan.max }
                : null
          if (!line) return null
          return (
            <line
              key={`slope-${point.provider}-${point.model}`}
              x1={xOf(line.x1)}
              y1={yOf(line.y1)}
              x2={xOf(line.x2)}
              y2={yOf(line.y2)}
              stroke={point.color}
              strokeWidth={large ? 1.5 : 1.25}
              strokeDasharray={large ? "7 5" : "4 3"}
              strokeLinecap="round"
            />
          )
        })}
        {plotted.map((point) => (
          <g key={`${point.provider}-${point.model}`}>
            <title>{`${point.model}\nProvider: ${point.provider}\nInput tokens: ${formatCount(point.input)}\nOutput tokens: ${formatCount(point.output)}\nCost: ${formatMoney(point.cost)}\nCost/tokens: ${formatCostRatio(point.cost, point.tokens)}`}</title>
            <circle cx={xOf(point.tokens)} cy={yOf(point.cost)} r={radius} fill={point.color} stroke="#fff" strokeWidth="1.5" />
          </g>
        ))}
      </svg>
      <span className="scatter-x">tokens</span>
    </div>
  )
}

function ChartModal({ title, subtitle, onClose, actions, children }: { title: string; subtitle: string; onClose: () => void; actions?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])
  return (
    <div className="chart-modal">
      <div className="chart-modal-backdrop" onClick={onClose} />
      <div className="chart-modal-card" role="dialog" aria-modal="true" aria-label={title}>
        <div className="panel-header">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <div className="chart-actions">
            {actions}
            <button type="button" className="icon-btn" aria-label={`Close ${title}`} onClick={onClose}><X size={16} /></button>
          </div>
        </div>
        {children}
      </div>
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
  const [granularity, setGranularity] = useState<Granularity>("day")
  const [anchor, setAnchor] = useState(() => Date.now())
  const [provider, setProvider] = useState("all")
  const [model, setModel] = useState("all")
  const [costScale, setCostScale] = useState<"linear" | "log">("linear")
  const [expanded, setExpanded] = useState<null | "usage" | "cost">(null)
  const [dataOpen, setDataOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const closeChart = useCallback(() => setExpanded(null), [])
  const closeData = useCallback(() => {
    setDataOpen(false)
    setCopied(false)
  }, [])
  const [documents, setDocuments] = useState<UsageDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [refreshTick, setRefreshTick] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [loadedKey, setLoadedKey] = useState("")
  const [rates, setRates] = useState<Map<string, ModelRates>>(new Map())
  const [rateStatus, setRateStatus] = useState<"pending" | "ready" | "unavailable">("pending")
  const requestKey = [portfolio, org, granularity, anchor, revision, refreshTick].join("\t")
  const ready = loadedKey === requestKey

  useEffect(() => {
    setProvider("all")
    setModel("all")
  }, [portfolio, org])

  useEffect(() => {
    let cancelled = false
    fetch(
      `${import.meta.env.VITE_API_URL}/_llm/${encodeURIComponent(portfolio)}/${encodeURIComponent(org)}/models`,
      { headers: { Authorization: `Bearer ${sessionStorage.accessToken}` } },
    )
      .then((response) => response.json())
      .then((data: { success?: boolean; output?: { models?: { model?: string; rates?: ModelRates }[] } }) => {
        if (cancelled) return
        if (data.success === false) {
          setRateStatus("unavailable")
          return
        }
        const next = new Map<string, ModelRates>()
        for (const item of data.output?.models || []) {
          if (!item.model || !item.rates) continue
          const input = Number(item.rates.input_per_million)
          const output = Number(item.rates.output_per_million)
          if (!Number.isFinite(input) || !Number.isFinite(output)) continue
          next.set(item.model, {
            input_per_million: input,
            output_per_million: output,
            cache_write_5m_per_million: numberOrNull(item.rates.cache_write_5m_per_million),
            cache_write_1h_per_million: numberOrNull(item.rates.cache_write_1h_per_million),
            cache_read_per_million: numberOrNull(item.rates.cache_read_per_million),
            reasoning_per_million: numberOrNull(item.rates.reasoning_per_million),
          })
        }
        setRates(next)
        setRateStatus("ready")
      })
      .catch(() => {
        if (!cancelled) setRateStatus("unavailable")
      })
    return () => {
      cancelled = true
    }
  }, [portfolio, org])

  useEffect(() => {
    let cancelled = false
    const key = requestKey
    const current = Date.now()
    const { start, end } = windowFor(granularity, anchor, current)
    const days = utcDaysOverlapping(start, end)
    setNow(current)
    setLoading(true)
    setError("")
    Promise.all(
      yearsFor(start, end).flatMap((year) => SERIES.map((seriesKey) => loadSeries(portfolio, org, seriesKey, year))),
    )
      .then((groups) => {
        if (cancelled) return
        setDocuments(groups.flat().filter((item) => days.has(item.period)))
        setLoadedKey(key)
      })
      .catch((exc) => {
        if (cancelled) return
        setDocuments([])
        setLoadedKey(key)
        setError(exc instanceof Error ? exc.message : "Could not load usage")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [requestKey, granularity, anchor, portfolio, org])

  const span = useMemo(() => windowFor(granularity, anchor, now), [granularity, anchor, now])
  const atLatest = span.endExclusive - 1 >= now
  const windowLabel = formatWindowLabel(span, granularity)

  const moveWindow = (direction: -1 | 1) => {
    const current = Date.now()
    setNow(current)
    setAnchor((value) => shiftAnchor(granularity, value, direction, current))
  }

  const timed = useMemo(
    () => (ready ? documents : []).flatMap((item) => {
      const readings = item.readings.filter((reading) => reading.at >= span.start && reading.at <= span.end)
      return readings.length ? [{ ...item, readings }] : []
    }),
    [documents, ready, span],
  )

  const inView = useMemo(
    () => timed.filter((item) => (
      (provider === "all" || item.dimensions[0] === provider)
      && (model === "all" || item.dimensions[1] === model)
    )),
    [timed, provider, model],
  )

  const storedData = useMemo(() => {
    const series = inView.map((item) => {
      const [seriesProvider, seriesModel, status, extension] = item.dimensions
      return {
        key: item.key,
        period: item.period,
        dimensions: item.dimensions,
        provider: seriesProvider,
        model: seriesModel,
        status,
        extension,
        readings: item.readings.map((reading) => ({
          at: reading.at,
          at_iso: new Date(reading.at).toISOString(),
          value: reading.value,
        })),
      }
    })
    const payload = {
      portfolio,
      org,
      window: {
        granularity,
        label: windowLabel,
        start: new Date(span.start).toISOString(),
        end: new Date(span.end).toISOString(),
      },
      filters: { provider, model },
      dimension_order: ["provider", "model", "status", "extension"],
      series,
    }
    const readingCount = series.reduce((count, item) => count + item.readings.length, 0)
    return { text: JSON.stringify(payload, null, 2), seriesCount: series.length, readingCount }
  }, [inView, portfolio, org, granularity, windowLabel, span, provider, model])

  const providers = useMemo(
    () => [...new Set(timed.map((item) => item.dimensions[0]))].sort(),
    [timed],
  )
  const models = useMemo(
    () => [...new Set(timed.filter((item) => provider === "all" || item.dimensions[0] === provider).map((item) => item.dimensions[1]))].sort(),
    [timed, provider],
  )

  useEffect(() => {
    if (!ready) return
    if (provider !== "all" && !providers.includes(provider)) setProvider("all")
  }, [ready, provider, providers])

  useEffect(() => {
    if (!ready) return
    if (model !== "all" && !models.includes(model)) setModel("all")
  }, [ready, model, models])

  const totals = useMemo(() => {
    const total = { requests: 0, errors: 0, input: 0, output: 0, latencySum: 0, latencyCount: 0 }
    for (const item of inView) {
      const sum = item.readings.reduce((count, reading) => count + reading.value, 0)
      if (item.key === "llm.requests") total.requests += sum
      if (item.key === "llm.errors") total.errors += sum
      if (item.key === "llm.input_tokens") total.input += sum
      if (item.key === "llm.output_tokens") total.output += sum
      if (item.key === "llm.latency_ms") {
        total.latencySum += sum
        total.latencyCount += item.readings.length
      }
    }
    return total
  }, [inView])

  const tokenSeries = useMemo(() => [
    toChartSeries("Input tokens", "#2f80ed", bucketed(inView, "llm.input_tokens", "sum", granularity)),
    toChartSeries("Output tokens", "#7c6cf0", bucketed(inView, "llm.output_tokens", "sum", granularity)),
  ], [inView, granularity])

  const latencyPoints = useMemo(
    () => bucketed(inView, "llm.latency_ms", "avg", granularity),
    [inView, granularity],
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
      cached: number
      reasoning: number
      cacheWrite5m: number
      cacheWrite1h: number
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
        cached: 0,
        reasoning: 0,
        cacheWrite5m: 0,
        cacheWrite1h: 0,
        latencySum: 0,
        latencyCount: 0,
        cost: 0,
      }
      const sum = item.readings.reduce((count, reading) => count + reading.value, 0)
      if (item.key === "llm.requests") row.requests += sum
      if (item.key === "llm.errors") row.errors += sum
      if (item.key === "llm.input_tokens") row.input += sum
      if (item.key === "llm.output_tokens") row.output += sum
      if (item.key === "llm.cached_tokens") row.cached += sum
      if (item.key === "llm.reasoning_tokens") row.reasoning += sum
      if (item.key === "llm.cache_write_5m_tokens") row.cacheWrite5m += sum
      if (item.key === "llm.cache_write_1h_tokens") row.cacheWrite1h += sum
      if (item.key === "llm.cost_usd") row.cost += sum
      if (item.key === "llm.latency_ms") {
        row.latencySum += sum
        row.latencyCount += item.readings.length
      }
      grouped.set(id, row)
    }
    return [...grouped.values()]
      .map((row) => {
        if (rateStatus !== "ready" || rates.size === 0) return row
        const card = rates.get(row.model)
        return card ? { ...row, cost: quoteCost(row, card) } : { ...row, cost: Number.NaN }
      })
      .sort((left, right) => right.requests - left.requests || left.provider.localeCompare(right.provider) || left.model.localeCompare(right.model))
  }, [inView, rates, rateStatus])

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
      .map((point, index) => ({ ...point, color: colorAt(index) }))
  }, [rows])

  const modelColor = useMemo(
    () => new Map(modelPoints.map((point) => [point.name, point.color])),
    [modelPoints],
  )

  const hasUsage = inView.length > 0
  const waiting = (!ready || loading) && !hasUsage && !error
  const latency = totals.latencyCount ? totals.latencySum / totals.latencyCount : null
  const latencyPeak = latencyPoints.length ? Math.max(...latencyPoints.map((point) => point.y)) : null
  const tokenTotal = totals.input + totals.output
  const inputShare = tokenTotal ? (totals.input / tokenTotal) * 100 : 0
  const outputShare = tokenTotal ? (totals.output / tokenTotal) * 100 : 0
  const avgOutput = totals.requests ? Math.round(totals.output / totals.requests) : null
  const costPoints = useMemo(() => {
    const grouped = new Map<string, CostPoint>()
    for (const row of rows) {
      const id = `${row.provider}\t${row.model}`
      const current = grouped.get(id) || {
        provider: row.provider,
        model: row.model,
        input: 0,
        output: 0,
        tokens: 0,
        cost: 0,
        color: modelColor.get(row.model) || colorAt(0),
      }
      current.input += row.input
      current.output += row.output
      current.tokens += row.input + row.output + row.cached + row.cacheWrite5m + row.cacheWrite1h
      current.cost += row.cost
      grouped.set(id, current)
    }
    return [...grouped.values()]
      .filter((point) => point.tokens > 0 && point.cost > 0)
      .map((point) => ({ ...point, color: modelColor.get(point.model) || point.color }))
      .sort((left, right) => right.cost - left.cost || left.model.localeCompare(right.model))
  }, [rows, modelColor])
  const shownCost = rows.reduce((sum, row) => sum + (Number.isFinite(row.cost) ? row.cost : 0), 0)

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
        <div className="time-controls">
          <span className="select-label">Time window</span>
          <button type="button" className="icon-btn" aria-label="Previous time window" onClick={() => moveWindow(-1)}>
            <ChevronLeft size={16} />
          </button>
          <div className="granularity" role="group" aria-label="Time granularity">
            {GRANULARITIES.map((option) => (
              <button key={option.id} type="button" className={granularity === option.id ? "active" : ""} onClick={() => setGranularity(option.id)}>{option.label}</button>
            ))}
          </div>
          <input
            className={granularity === "hour" ? "date-input with-time" : "date-input"}
            aria-label="Anchor date"
            type={granularity === "hour" ? "datetime-local" : "date"}
            value={formatAnchorInput(anchor, granularity)}
            max={formatAnchorInput(now, granularity)}
            onChange={(event) => {
              const current = Date.now()
              setNow(current)
              setAnchor((value) => anchorFromInput(event.target.value, value, granularity, current))
            }}
          />
          <button type="button" className="icon-btn" aria-label="Next time window" onClick={() => moveWindow(1)} disabled={atLatest}>
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="filter-spacer" />
        <button type="button" className="filter-button" onClick={() => setDataOpen(true)} disabled={!ready}>
          <FileJson size={15} />
          Stored data
        </button>
        <button type="button" className="filter-button" onClick={() => setRefreshTick((value) => value + 1)} disabled={loading}>
          <RefreshCw size={15} className={loading ? "spin" : undefined} />
          Refresh
        </button>
      </div>
      {dataOpen ? (
        <ChartModal
          title="Stored data"
          subtitle={`${storedData.seriesCount} series · ${formatCount(storedData.readingCount)} readings · ${windowLabel}`}
          onClose={closeData}
          actions={(
            <button
              type="button"
              className="filter-button"
              onClick={() => {
                void navigator.clipboard.writeText(storedData.text).then(() => {
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 2000)
                }).catch(() => setCopied(false))
              }}
            >
              <Copy size={14} />
              {copied ? "Copied" : "Copy"}
            </button>
          )}
        >
          <pre className="data-view">{storedData.text}</pre>
        </ChartModal>
      ) : null}
      {error ? <p className="notice" role="alert">{error}</p> : null}
      {waiting ? <p className="empty">Loading usage…</p> : null}
      {!error && !waiting ? (
        <>
          <div className="metric-grid">
            <MetricCard title="Total requests" value={formatCount(totals.requests)} note={`${formatCount(totals.errors)} errors`} color="#d97706" icon={Zap} />
            <MetricCard title="Total cost" value={formatMoney(shownCost)} note="From the rate card" color="#7c6cf0" icon={Activity} />
            <MetricCard title="Avg. latency" value={formatLatency(latency)} note={windowLabel} color="#2f80ed" icon={Clock} />
            <MetricCard title="Tokens processed" value={formatCompact(tokenTotal)} note={`${formatCompact(totals.input)} in · ${formatCompact(totals.output)} out`} color="#5b8c5a" icon={Layers} />
          </div>
          <div className="dashboard-grid">
            <section className="panel chart-panel">
              <div className="panel-header">
                <div>
                  <h2>Token usage</h2>
                  <p>{bucketCaption(granularity)} · {windowLabel}</p>
                </div>
                <div className="chart-actions">
                  <button type="button" className="icon-btn" aria-label="Expand token usage" onClick={() => setExpanded("usage")}><Maximize2 size={15} /></button>
                </div>
              </div>
              <div className="legend">
                <span><i className="dot cyan" />Input tokens</span>
                <span><i className="dot violet" />Output tokens</span>
                <span className="chart-stat">{formatCompact(tokenTotal)} total</span>
              </div>
              <TokenCharts series={tokenSeries} domain={span} granularity={granularity} />
            </section>
            <section className="panel donut-panel">
              <div className="panel-header">
                <div>
                  <h2>Token composition</h2>
                  <p>By direction · {windowLabel}</p>
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
                  <p>Tokens priced from the rate card. The key is that cost divided by tokens.</p>
                </div>
                <div className="chart-actions">
                  <div className="segmented" role="group" aria-label="Cost axis scale">
                    <button type="button" className={costScale === "linear" ? "active" : ""} onClick={() => setCostScale("linear")}>Linear</button>
                    <button type="button" className={costScale === "log" ? "active" : ""} onClick={() => setCostScale("log")}>Log</button>
                  </div>
                  <button type="button" className="icon-btn" aria-label="Expand cost efficiency" onClick={() => setExpanded("cost")}><Maximize2 size={15} /></button>
                </div>
              </div>
              <CostScatter points={costPoints} scale={costScale} />
              {costPoints.length ? (
                <div className="scatter-footer">
                  {costPoints.map((point) => (
                    <span key={`${point.provider}-${point.model}`}><i className="dot" style={{ background: point.color }} />{point.model}<small>{formatCostRatio(point.cost, point.tokens)}</small></span>
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
                  <p>Requests and cost by provider, model, status, and extension · {windowLabel}</p>
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
                          <td className="model-name"><i className="dot" style={{ background: modelColor.get(row.model) }} />{row.model}</td>
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
                  <p>{windowLabel}</p>
                </div>
              </div>
              <div className="latency-summary">
                {([
                  ["Avg", formatLatency(latency), latencyPeak && latency != null ? (latency / latencyPeak) * 100 : 0, ""],
                  ["Peak", formatLatency(latencyPeak), latencyPeak ? 100 : 0, ""],
                  ["Errors", formatCount(totals.errors), totals.requests ? Math.min(100, (totals.errors / totals.requests) * 100) : 0, "errors"],
                ] as const).map(([label, value, height, tone]) => (
                  <div key={label} className="latency-stat">
                    <div className="latency-track">
                      <i className={tone} style={{ height: `${height > 0 ? Math.max(height, 4) : 0}%` }} />
                    </div>
                    <b>{value}</b>
                    <small>{label}</small>
                  </div>
                ))}
              </div>
            </section>
          </div>
          {expanded === "usage" ? (
            <ChartModal title="Token usage" subtitle={`${bucketCaption(granularity)} · ${windowLabel}`} onClose={closeChart}>
              <div className="legend">
                <span><i className="dot cyan" />Input tokens</span>
                <span><i className="dot violet" />Output tokens</span>
                <span className="chart-stat">{formatCompact(tokenTotal)} total</span>
              </div>
              <TokenCharts series={tokenSeries} domain={span} granularity={granularity} large />
            </ChartModal>
          ) : null}
          {expanded === "cost" ? (
            <ChartModal title="Cost efficiency" subtitle="Tokens priced from the rate card. The key is that cost divided by tokens." onClose={closeChart}>
              <div className="chart-actions modal-actions">
                <div className="segmented" role="group" aria-label="Cost axis scale">
                  <button type="button" className={costScale === "linear" ? "active" : ""} onClick={() => setCostScale("linear")}>Linear</button>
                  <button type="button" className={costScale === "log" ? "active" : ""} onClick={() => setCostScale("log")}>Log</button>
                </div>
              </div>
              <CostScatter points={costPoints} scale={costScale} large />
              {costPoints.length ? (
                <div className="scatter-footer">
                  {costPoints.map((point) => (
                    <span key={`${point.provider}-${point.model}`}><i className="dot" style={{ background: point.color }} />{point.model}<small>{formatCostRatio(point.cost, point.tokens)}</small></span>
                  ))}
                </div>
              ) : null}
            </ChartModal>
          ) : null}
        </>
      ) : null}
    </>
  )
}
