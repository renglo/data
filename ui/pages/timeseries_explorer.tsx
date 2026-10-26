import { useEffect, useMemo, useRef, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react"

interface TimeSeriesExplorerProps {
  portfolio: string
  org: string
}

type ResolutionLabel = "Daily" | "Monthly" | "Yearly"
type Resolution = "day" | "month" | "year"

type ReadingPoint = {
  x: number
  y: number
  label: string
}

type PlottedSeries = {
  name: string
  color: string
  points: ReadingPoint[]
  count: number
  sum: number
  min: number | null
  max: number | null
}

const RESOLUTION_MAP: Record<ResolutionLabel, Resolution> = {
  Daily: "day",
  Monthly: "month",
  Yearly: "year",
}

const COLORS = ["#ef6351", "#2f80ed", "#5b8c5a", "#7c6cf0"]

const explorerCss = `
.ts-explorer { color: #1d2633; font-size: 14px; }
.ts-explorer button, .ts-explorer input { font: inherit; }
.ts-explorer button { cursor: pointer; }
.ts-explorer .content { padding: 28px 32px 24px; min-width: 0; }
.ts-explorer .page-intro { margin-bottom: 24px; }
.ts-explorer .eyebrow { color: #9aa3af; text-transform: uppercase; letter-spacing: .12em; font-size: 10px; font-weight: 700; margin: 0 0 5px; }
.ts-explorer h2 { margin: 0 0 7px; font-size: 26px; letter-spacing: -.04em; font-weight: 700; }
.ts-explorer .subheading, .ts-explorer .panel-header p, .ts-explorer .section-toolbar p { color: #7c8795; margin: 0; font-size: 12px; }
.ts-explorer .panel { background: #fff; border: 1px solid #e3e7ed; border-radius: 10px; box-shadow: 0 2px 6px rgba(28, 42, 58, .025); }
.ts-explorer .query-builder, .ts-explorer .record-card { padding: 22px 24px 20px; }
.ts-explorer .query-builder { margin-bottom: 16px; }
.ts-explorer .record-card { margin-bottom: 28px; }
.ts-explorer .panel-header, .ts-explorer .section-toolbar, .ts-explorer .chart-heading, .ts-explorer .builder-footer, .ts-explorer .coordinates-heading, .ts-explorer .chart-title-row, .ts-explorer .range-result, .ts-explorer .toolbar-actions, .ts-explorer .chart-actions { display: flex; align-items: center; }
.ts-explorer .panel-header, .ts-explorer .section-toolbar, .ts-explorer .chart-heading { justify-content: space-between; align-items: flex-start; }
.ts-explorer .chart-heading { align-items: center; }
.ts-explorer .panel-header h3, .ts-explorer .section-toolbar h3 { margin: 0 0 5px; font-size: 14px; letter-spacing: -.01em; font-weight: 700; }
.ts-explorer .builder-fields, .ts-explorer .put-fields { display: grid; grid-template-columns: 1.5fr 1fr 1fr auto; gap: 14px; margin: 22px 0 8px; align-items: end; }
.ts-explorer .put-fields { grid-template-columns: minmax(0, 1fr) auto; margin-top: 18px; margin-bottom: 0; }
.ts-explorer .timestamp-row { display: flex; align-items: flex-end; gap: 12px; margin-top: 16px; flex-wrap: wrap; }
.ts-explorer .timestamp-row > label { flex: 1 1 280px; display: flex; flex-direction: column; gap: 8px; color: #7f8997; font-size: 11px; font-weight: 700; }
.ts-explorer .timestamp-row > label.millis-field { flex: 0 0 120px; }
.ts-explorer .millis-field input { text-align: right; }
.ts-explorer .calendar-button { border: 0; background: transparent; color: #9aa3af; display: grid; place-items: center; padding: 0; }
.ts-explorer .builder-fields label, .ts-explorer .put-fields label, .ts-explorer .window-nav label { display: flex; flex-direction: column; gap: 8px; color: #7f8997; font-size: 11px; font-weight: 700; }
.ts-explorer .window-nav { display: flex; align-items: flex-end; gap: 10px; margin: 4px 0 8px; }
.ts-explorer .window-nav label { flex: 0 1 220px; }
.ts-explorer .window-nav .secondary-button { min-height: 37px; padding: 0 10px; }
.ts-explorer .input-wrap { display: flex; align-items: center; gap: 9px; background: #fff; border: 1px solid #e3e7ed; border-radius: 7px; color: #9aa3af; padding: 10px 11px; min-height: 37px; }
.ts-explorer .input-wrap input { border: 0; outline: 0; background: transparent; width: 100%; color: #1d2633; font-size: 12px; }
.ts-explorer .input-wrap:focus-within { border-color: #9fb3cf; box-shadow: 0 0 0 3px #edf3fb; }
.ts-explorer .coordinates-widget { border: 1px solid #dfe5ec; background: #fafbfd; border-radius: 8px; padding: 13px 14px; margin: 12px 0 18px; }
.ts-explorer .coordinates-heading { justify-content: space-between; align-items: flex-start; gap: 14px; }
.ts-explorer .coordinates-heading p { margin: 4px 0 0; color: #8a94a2; font-size: 11px; font-weight: 400; }
.ts-explorer .field-label { color: #7f8997; font-size: 11px; font-weight: 700; }
.ts-explorer .coordinate-count { color: #64748b; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; white-space: nowrap; flex: 0 0 auto; }
.ts-explorer .coordinate-input-wrap { margin-top: 11px; display: flex; align-items: center; padding: 9px 10px; border: 1px solid #e3e7ed; border-radius: 7px; background: #fff; }
.ts-explorer .coordinate-input-wrap:focus-within { border-color: #9fb3cf; box-shadow: 0 0 0 3px #edf3fb; }
.ts-explorer .coordinate-input-wrap input { width: 100%; border: 0; outline: 0; background: transparent; font-size: 12px; color: #1d2633; }
.ts-explorer .coordinate-blocks { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
.ts-explorer .coordinate-block { display: inline-flex; align-items: center; gap: 7px; background: #edf3fb; border: 1px solid #d5e2f3; color: #3e5b7b; border-radius: 6px; padding: 6px 9px; font-size: 11px; }
.ts-explorer .coordinate-block b { display: grid; place-items: center; width: 17px; height: 17px; border-radius: 4px; background: #fff; color: #6b86a6; font-size: 10px; }
.ts-explorer .builder-footer { gap: 20px; flex-wrap: wrap; }
.ts-explorer .builder-footer > div:first-child { display: flex; gap: 10px; align-items: center; }
.ts-explorer .segmented { display: flex; border: 1px solid #e3e7ed; border-radius: 6px; padding: 2px; background: #f8f9fb; }
.ts-explorer .segmented button { background: transparent; border: 0; padding: 5px 10px; border-radius: 4px; color: #7b8594; font-size: 11px; }
.ts-explorer .segmented button.active { background: #fff; color: #273241; box-shadow: 0 1px 3px #dfe3e8; font-weight: 700; }
.ts-explorer .range-result { gap: 7px; color: #5c6877; font-size: 11px; margin-left: auto; }
.ts-explorer .status-dot, .ts-explorer .live-pill span { width: 6px; height: 6px; background: #5b8c5a; border-radius: 50%; display: inline-block; }
.ts-explorer .muted { color: #a0a8b2; font-weight: 400; }
.ts-explorer .run-button, .ts-explorer .record-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; border: 0; border-radius: 7px; background: #1d2633; color: white; padding: 9px 14px; font-size: 12px; font-weight: 700; min-height: 37px; }
.ts-explorer .run-button { margin-left: auto; }
.ts-explorer .run-button span { opacity: .55; font-size: 10px; font-weight: 600; }
.ts-explorer button:disabled { opacity: .55; cursor: default; }
.ts-explorer .section-toolbar { margin-bottom: 15px; }
.ts-explorer .toolbar-actions, .ts-explorer .chart-actions { gap: 9px; }
.ts-explorer .compare-keys { min-width: 220px; }
.ts-explorer .compare-toggle { display: flex; align-items: center; gap: 7px; border: 1px solid #e3e7ed; background: #fff; padding: 8px 10px; color: #687483; border-radius: 7px; font-size: 11px; }
.ts-explorer .toggle-knob { width: 16px; height: 10px; background: #c4cbd5; border-radius: 10px; position: relative; flex: 0 0 auto; }
.ts-explorer .toggle-knob:after { content: ''; position: absolute; width: 6px; height: 6px; background: white; border-radius: 50%; top: 2px; left: 2px; }
.ts-explorer .compare-toggle.on { color: #2f80ed; border-color: #a9c8f4; background: #f2f7ff; }
.ts-explorer .compare-toggle.on .toggle-knob { background: #2f80ed; }
.ts-explorer .compare-toggle.on .toggle-knob:after { left: 8px; }
.ts-explorer .secondary-button { display: inline-flex; align-items: center; gap: 7px; padding: 7px 10px; border: 1px solid #e3e7ed; background: #fff; color: #5d6877; border-radius: 7px; font-size: 11px; font-weight: 700; }
.ts-explorer .chart-panel { padding: 21px 24px 18px; }
.ts-explorer .chart-title-row { gap: 9px; }
.ts-explorer .live-pill { display: flex; align-items: center; gap: 5px; color: #5b8c5a; background: #edf7ed; border-radius: 10px; padding: 4px 7px; font-size: 9px; font-weight: 700; }
.ts-explorer .legend { display: flex; gap: 18px; margin: 18px 0 2px 44px; color: #72808f; font-size: 10px; flex-wrap: wrap; }
.ts-explorer .legend span { display: flex; gap: 6px; align-items: center; }
.ts-explorer .legend i { width: 14px; height: 3px; border-radius: 3px; }
.ts-explorer .chart { display: block; width: 100%; height: auto; margin-top: 8px; overflow: visible; }
.ts-explorer .grid-line { stroke: #edf0f3; stroke-width: 1; }
.ts-explorer .axis-label { fill: #9aa3ae; font-size: 10px; }
.ts-explorer .empty-chart { min-height: 180px; display: grid; place-items: center; color: #8a94a2; font-size: 12px; }
.ts-explorer .notice { margin: 12px 0 0; color: #8a4b3c; background: #fff4f1; border: 1px solid #f3d2cb; border-radius: 7px; padding: 8px 10px; font-size: 12px; }
.ts-explorer .notice.ok { color: #3f6b3e; background: #f3faf2; border-color: #d5ead3; }
.ts-explorer .readings { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
.ts-explorer .readings th { text-align: left; color: #7f8997; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; font-weight: 700; padding: 6px 8px; border-bottom: 1px solid #e3e7ed; }
.ts-explorer .readings td { padding: 7px 8px; border-bottom: 1px solid #f0f2f5; color: #1d2633; }
.ts-explorer .readings-wrap { max-height: 240px; overflow: auto; }
.ts-explorer .footer-note { display: flex; justify-content: space-between; gap: 12px; color: #98a2ae; font-size: 10px; padding: 16px 2px; }
.ts-explorer .footer-note strong { color: #697583; font-weight: 600; }
@media (max-width: 980px) {
  .ts-explorer .content { padding: 24px 16px; }
  .ts-explorer .builder-fields, .ts-explorer .put-fields { grid-template-columns: 1fr 1fr; }
  .ts-explorer .builder-fields label:first-child { grid-column: span 2; }
}
@media (max-width: 700px) {
  .ts-explorer .builder-fields, .ts-explorer .put-fields { display: block; }
  .ts-explorer .builder-fields label, .ts-explorer .put-fields label { margin-bottom: 12px; }
  .ts-explorer .builder-footer { align-items: flex-start; }
  .ts-explorer .range-result, .ts-explorer .run-button { margin-left: 0; }
  .ts-explorer .section-toolbar, .ts-explorer .footer-note { flex-direction: column; align-items: flex-start; }
  .ts-explorer .legend { margin-left: 0; }
  .ts-explorer .chart-panel { padding: 16px 12px; overflow: hidden; }
}
`

function splitList(value: string): string[] {
  return value.split(",").map((part) => part.trim()).filter(Boolean)
}

function utcDate(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

function formatInstant(date: Date): string {
  const iso = date.toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 23)}Z`
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0")
}

function toDateTimeLocal(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
}

function chosenInstant(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/)
  if (!match) return null
  const millis = Number((match[7] || "0").padEnd(3, "0").slice(0, 3))
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] || "0"),
    millis,
  )
  return Number.isNaN(date.getTime()) ? null : date
}

function parseUtcDay(value: string): Date {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1))
}

function formatUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addUtcDays(value: string, days: number): string {
  const date = parseUtcDay(value)
  date.setUTCDate(date.getUTCDate() + days)
  return formatUtcDay(date)
}

function windowLengthDays(start: string, end: string): number {
  const span = parseUtcDay(end).getTime() - parseUtcDay(start).getTime()
  return Math.max(1, Math.round(span / 86400000) + 1)
}

function shiftWindow(start: string, end: string, direction: -1 | 1): { start: string; end: string } {
  const days = windowLengthDays(start, end) * direction
  return { start: addUtcDays(start, days), end: addUtcDays(end, days) }
}

function windowEndingOn(day: string, lengthDays: number): { start: string; end: string } {
  return { start: addUtcDays(day, -(Math.max(1, lengthDays) - 1)), end: day }
}

function periodFromDate(value: string, resolution: Resolution): string {
  if (resolution === "year") return value.slice(0, 4)
  if (resolution === "month") return value.slice(0, 7)
  return value.slice(0, 10)
}

function toPoint(raw: unknown, value: unknown): ReadingPoint | null {
  const y = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(y)) return null
  if (typeof raw === "number" || (typeof raw === "string" && /^-?\d+(\.\d+)?$/.test(raw))) {
    const numeric = Number(raw)
    const ms = Math.abs(numeric) < 1e12 ? numeric * 1000 : numeric
    return { x: ms, y, label: formatInstant(new Date(ms)) }
  }
  if (typeof raw === "string" && raw) {
    const iso = raw.length === 4 ? `${raw}-01-01` : raw.length === 7 ? `${raw}-01` : raw
    const parsed = Date.parse(iso)
    if (!Number.isFinite(parsed)) return null
    return { x: parsed, y, label: raw }
  }
  return null
}

function pointsFromDocument(document: Record<string, unknown>): ReadingPoint[] {
  const readings = Array.isArray(document.readings) ? document.readings : []
  const points: ReadingPoint[] = []
  for (const reading of readings) {
    if (!Array.isArray(reading) || reading.length < 2) continue
    const point = toPoint(reading[0], reading[1])
    if (point) points.push(point)
  }
  points.sort((left, right) => left.x - right.x)
  return points
}

function summarize(points: ReadingPoint[], documents: Record<string, unknown>[]): Pick<PlottedSeries, "count" | "sum" | "min" | "max"> {
  let count = 0
  let sum = 0
  let min: number | null = null
  let max: number | null = null
  let usedStats = false
  for (const document of documents) {
    const stats = document.statistics
    if (!stats || typeof stats !== "object") continue
    const record = stats as Record<string, unknown>
    const statCount = Number(record.count)
    const statSum = Number(record.sum)
    if (!Number.isFinite(statCount) || !Number.isFinite(statSum)) continue
    usedStats = true
    count += statCount
    sum += statSum
    const statMin = Number(record.min)
    const statMax = Number(record.max)
    if (Number.isFinite(statMin)) min = min === null ? statMin : Math.min(min, statMin)
    if (Number.isFinite(statMax)) max = max === null ? statMax : Math.max(max, statMax)
  }
  if (usedStats) return { count, sum, min, max }
  for (const point of points) {
    count += 1
    sum += point.y
    min = min === null ? point.y : Math.min(min, point.y)
    max = max === null ? point.y : Math.max(max, point.y)
  }
  return { count, sum, min, max }
}

async function apiJson(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${sessionStorage.accessToken}`)
  if (init.body) headers.set("Content-Type", "application/json")
  const response = await fetch(`${import.meta.env.VITE_API_URL}${path}`, { ...init, headers })
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
  return data
}

function seriesPath(portfolio: string, org: string, key: string) {
  return `/_timeseries/${encodeURIComponent(portfolio)}/${encodeURIComponent(org)}/${encodeURIComponent(key)}`
}

function formatAxisTick(ms: number, resolution: Resolution, spanMs: number): string {
  const iso = new Date(ms).toISOString()
  if (resolution === "year") return iso.slice(0, 4)
  if (resolution === "month") return iso.slice(0, 7)
  if (spanMs < 60_000) return iso.slice(11, 23)
  if (spanMs < 3_600_000) return iso.slice(11, 19)
  return `${iso.slice(5, 10)} ${iso.slice(11, 16)}`
}

function Chart({ series, resolution }: { series: PlottedSeries[]; resolution: Resolution }) {
  const width = 900
  const height = 292
  const pad = { t: 22, r: 18, b: 34, l: 52 }
  const points = series.flatMap((item) => item.points)
  if (!points.length) {
    return <div className="empty-chart">Run a query to plot readings.</div>
  }
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const ySpan = maxY - minY || Math.abs(maxY) || 1
  const yMin = minY - ySpan * 0.08
  const yMax = maxY + ySpan * 0.08
  const xSpan = maxX - minX || 1
  const plotX = (x: number) => pad.l + ((x - minX) / xSpan) * (width - pad.l - pad.r)
  const plotY = (y: number) => height - pad.b - ((y - yMin) / (yMax - yMin)) * (height - pad.t - pad.b)
  const yTicks = [yMin, yMin + (yMax - yMin) / 2, yMax]
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((step) => minX + xSpan * step)
  const formatY = (value: number) => (Math.abs(value) >= 100 || Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2))
  const formatTick = (x: number) => formatAxisTick(x, resolution, maxX - minX)
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Timeseries line chart">
      {yTicks.map((value) => {
        const y = plotY(value)
        return (
          <g key={value}>
            <line x1={pad.l} x2={width - pad.r} y1={y} y2={y} className="grid-line" />
            <text x={pad.l - 8} y={y + 3} textAnchor="end" className="axis-label">{formatY(value)}</text>
          </g>
        )
      })}
      {xTicks.map((value) => (
        <text key={value} x={plotX(value)} y={height - 8} textAnchor="middle" className="axis-label">{formatTick(value)}</text>
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
          {item.points.map((point, index) => (
            <circle key={`${item.name}-${index}`} cx={plotX(point.x)} cy={plotY(point.y)} r="3.5" fill={item.color} />
          ))}
        </g>
      ))}
    </svg>
  )
}

export default function TimeSeriesExplorer({ portfolio, org }: TimeSeriesExplorerProps) {
  const [resolutionLabel, setResolutionLabel] = useState<ResolutionLabel>("Daily")
  const [compare, setCompare] = useState(false)
  const [keyName, setKeyName] = useState("checkout.completed")
  const [compareKeys, setCompareKeys] = useState("")
  const [start, setStart] = useState(() => `${utcDate().slice(0, 8)}01`)
  const [end, setEnd] = useState(() => utcDate())
  const [coordinateInput, setCoordinateInput] = useState("")
  const [valueInput, setValueInput] = useState("")
  const [useCurrentTime, setUseCurrentTime] = useState(true)
  const [chosenTime, setChosenTime] = useState(() => toDateTimeLocal(new Date()))
  const [millisDraft, setMillisDraft] = useState<string | null>(null)
  const [browserNow, setBrowserNow] = useState(() => new Date())
  const timeInput = useRef<HTMLInputElement>(null)
  const [series, setSeries] = useState<PlottedSeries[]>([])
  const [queryError, setQueryError] = useState("")
  const [recordError, setRecordError] = useState("")
  const [status, setStatus] = useState("")
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const [queriedAt, setQueriedAt] = useState("")

  const resolution = RESOLUTION_MAP[resolutionLabel]
  const coordinates = useMemo(() => splitList(coordinateInput), [coordinateInput])

  useEffect(() => {
    const timer = window.setInterval(() => setBrowserNow(new Date()), 50)
    return () => window.clearInterval(timer)
  }, [])
  const pointCount = series.reduce((total, item) => total + item.points.length, 0)

  const loadSeries = async (range?: { start: string; end: string }) => {
    const startDate = range?.start || start
    const endDate = range?.end || end
    const names = [keyName.trim(), ...(compare ? splitList(compareKeys) : [])].filter(Boolean)
    const unique = names.filter((name, index) => names.indexOf(name) === index)
    if (!unique.length) throw new Error("Timeseries key is required")
    if (unique.some((name) => name.includes("/") || name.includes("#"))) {
      throw new Error("A timeseries key cannot contain / or #")
    }
    if (!startDate || !endDate || startDate > endDate) throw new Error("Choose a start date on or before the end date")
    const params = new URLSearchParams({
      start: periodFromDate(startDate, resolution),
      end: periodFromDate(endDate, resolution),
      resolution,
    })
    coordinates.forEach((dimension) => params.append("dimensions", dimension))
    const plotted = await Promise.all(unique.map(async (name, index) => {
      const data = await apiJson(`${seriesPath(portfolio, org, name)}?${params.toString()}`)
      const output = (data.output || {}) as Record<string, unknown>
      const documents = Array.isArray(output.series) ? output.series as Record<string, unknown>[] : []
      const points = documents.flatMap((document) => pointsFromDocument(document))
      points.sort((left, right) => left.x - right.x)
      return {
        name,
        color: COLORS[index % COLORS.length],
        points,
        ...summarize(points, documents),
      }
    }))
    setSeries(plotted)
    setQueriedAt("Updated just now")
  }

  const applyWindow = async (range: { start: string; end: string }) => {
    setStart(range.start)
    setEnd(range.end)
    if (!queriedAt) return
    setLoading(true)
    setQueryError("")
    try {
      await loadSeries(range)
    } catch (exc) {
      setSeries([])
      setQueryError(exc instanceof Error ? exc.message : "query failed")
    } finally {
      setLoading(false)
    }
  }

  const runQuery = async () => {
    setLoading(true)
    setQueryError("")
    try {
      await loadSeries()
    } catch (exc) {
      setSeries([])
      setQueryError(exc instanceof Error ? exc.message : "query failed")
    } finally {
      setLoading(false)
    }
  }

  const recordReading = async () => {
    const name = keyName.trim()
    const value = Number(valueInput)
    if (!name) {
      setRecordError("Timeseries key is required")
      return
    }
    if (name.includes("/") || name.includes("#")) {
      setRecordError("A timeseries key cannot contain / or #")
      return
    }
    if (!Number.isFinite(value)) {
      setRecordError("Reading value must be a number")
      return
    }
    const recordedAt = useCurrentTime ? new Date() : chosenInstant(chosenTime)
    if (!recordedAt) {
      setRecordError("Choose a timestamp")
      return
    }
    setRecording(true)
    setRecordError("")
    setStatus("")
    try {
      const body: Record<string, unknown> = {
        value,
        dimensions: coordinates,
        resolution,
        timestamp: recordedAt.getTime() / 1000,
      }
      await apiJson(seriesPath(portfolio, org, name), {
        method: "POST",
        body: JSON.stringify(body),
      })
      setStatus(`Recorded ${value} on ${name} at ${formatInstant(recordedAt)}`)
      setValueInput("")
      const recordedDay = utcDate(recordedAt)
      const nextStart = recordedDay < start ? recordedDay : start
      const nextEnd = recordedDay > end ? recordedDay : end
      if (nextStart !== start) setStart(nextStart)
      if (nextEnd !== end) setEnd(nextEnd)
      try {
        await loadSeries({ start: nextStart, end: nextEnd })
        setQueryError("")
      } catch (exc) {
        setQueryError(exc instanceof Error ? exc.message : "query failed")
      }
    } catch (exc) {
      setRecordError(exc instanceof Error ? exc.message : "put failed")
    } finally {
      setRecording(false)
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault()
        void runQuery()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  const reset = () => {
    setSeries([])
    setQueryError("")
    setRecordError("")
    setStatus("")
    setCompare(false)
    setQueriedAt("")
  }

  const tableRows = series.flatMap((item) => item.points.map((point) => ({ key: item.name, ...point })))
  const combined = series.reduce((total, item) => {
    total.count += item.count
    total.sum += item.sum
    if (item.min !== null) total.min = total.min === null ? item.min : Math.min(total.min, item.min)
    if (item.max !== null) total.max = total.max === null ? item.max : Math.max(total.max, item.max)
    return total
  }, { count: 0, sum: 0, min: null as number | null, max: null as number | null })
  const average = combined.count ? combined.sum / combined.count : null

  return (
    <div className="ts-explorer">
      <style>{explorerCss}</style>
      <main className="content">
        <div className="page-intro">
          <p className="eyebrow">TimeSeries explorer</p>
          <h2>Timeseries overview</h2>
          <p className="subheading">Choose a reading, date range, and resolution to retrieve it, or record a new reading on the same key.</p>
        </div>

        <section className="panel query-builder">
          <div className="panel-header">
            <div>
              <h3>Timeseries parameters</h3>
              <p>Enter the key and date range for the reading you want to retrieve.</p>
            </div>
          </div>
          <div className="builder-fields">
            <label>Timeseries key
              <div className="input-wrap">
                <input value={keyName} onChange={(event) => setKeyName(event.target.value)} placeholder="e.g. checkout.completed" />
              </div>
            </label>
            <label>Start date
              <div className="input-wrap">
                <CalendarDays size={16} />
                <input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
              </div>
            </label>
            <label>End date
              <div className="input-wrap">
                <CalendarDays size={16} />
                <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
              </div>
            </label>
          </div>
          <div className="window-nav" role="group" aria-label="Date window">
            <button
              type="button"
              className="secondary-button"
              aria-label="Previous window"
              onClick={() => void applyWindow(shiftWindow(start, end, -1))}
              disabled={loading || !start || !end}
            >
              <ChevronLeft size={16} />
            </button>
            <label>Jump to day
              <div className="input-wrap">
                <CalendarDays size={16} />
                <input
                  type="date"
                  aria-label="Jump to day"
                  value={end}
                  onChange={(event) => {
                    const day = event.target.value
                    if (!day) return
                    void applyWindow(windowEndingOn(day, windowLengthDays(start || day, end || day)))
                  }}
                />
              </div>
            </label>
            <button
              type="button"
              className="secondary-button"
              aria-label="Next window"
              onClick={() => void applyWindow(shiftWindow(start, end, 1))}
              disabled={loading || !start || !end}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="coordinates-widget">
            <div className="coordinates-heading">
              <div>
                <span className="field-label">Coordinates</span>
                <p>Comma-separated dimensions are applied in order.</p>
              </div>
              <span className="coordinate-count">{coordinates.length} blocks</span>
            </div>
            <div className="coordinate-input-wrap">
              <input aria-label="Comma-separated coordinates" value={coordinateInput} onChange={(event) => setCoordinateInput(event.target.value)} placeholder="zone37, sensor34" />
            </div>
            <div className="coordinate-blocks" aria-live="polite">
              {coordinates.map((coordinate, index) => (
                <span className="coordinate-block" key={`${coordinate}-${index}`}><b>{index + 1}</b>{coordinate}</span>
              ))}
            </div>
          </div>
          {queryError ? <p className="notice" role="alert">{queryError}</p> : null}
          <div className="builder-footer">
            <div>
              <span className="field-label">Resolution</span>
              <div className="segmented" role="group" aria-label="Resolution">
                {(Object.keys(RESOLUTION_MAP) as ResolutionLabel[]).map((item) => (
                  <button type="button" key={item} className={resolutionLabel === item ? "active" : ""} onClick={() => setResolutionLabel(item)}>{item}</button>
                ))}
              </div>
            </div>
            <div className="range-result">
              <span className="status-dot" />
              {pointCount ? `${pointCount} plotted points` : resolutionLabel}
              {queriedAt ? <span className="muted">· {queriedAt}</span> : <span className="muted">· Monthly and yearly read rollup documents</span>}
            </div>
            <button type="button" className="run-button" onClick={() => void runQuery()} disabled={loading}>
              {loading ? "Running…" : "Run query"} <span>⌘ ↵</span>
            </button>
          </div>
        </section>

        <section className="panel record-card">
          <div className="panel-header">
            <div>
              <h3>Record a reading</h3>
              <p>Store a value on this key, using the browser clock or a time you choose.</p>
            </div>
            <button
              type="button"
              className={`compare-toggle ${useCurrentTime ? "on" : ""}`}
              onClick={() => {
                setUseCurrentTime((current) => {
                  if (current) {
                    setChosenTime(toDateTimeLocal(new Date()))
                    setMillisDraft(null)
                  }
                  return !current
                })
              }}
            >
              <span className="toggle-knob" /> {useCurrentTime ? "Current time" : "Choose time"}
            </button>
          </div>
          <div className="timestamp-row">
            {useCurrentTime ? (
              <label>Timestamp
                <div className="input-wrap">
                  <input readOnly aria-label="Browser timestamp" value={formatInstant(browserNow)} />
                </div>
              </label>
            ) : (
              <>
                <label>Timestamp
                  <div className="input-wrap">
                    <button
                      type="button"
                      className="calendar-button"
                      aria-label="Open calendar"
                      onClick={() => {
                        const input = timeInput.current
                        if (!input) return
                        if (typeof input.showPicker === "function") input.showPicker()
                        else input.focus()
                      }}
                    >
                      <CalendarDays size={16} />
                    </button>
                    <input
                      ref={timeInput}
                      type="datetime-local"
                      step="0.001"
                      aria-label="Chosen timestamp"
                      value={chosenTime.slice(0, 23)}
                      onChange={(event) => {
                        const raw = event.target.value
                        const match = raw.match(/^(.*T\d{2}:\d{2}(?::\d{2})?)(?:\.(\d{1,3}))?$/)
                        if (!match) return
                        const clock = match[1].length === 16 ? `${match[1]}:00` : match[1]
                        const fraction = match[2]
                          ? match[2].padEnd(3, "0").slice(0, 3)
                          : (chosenTime.split(".")[1] || "000").padEnd(3, "0").slice(0, 3)
                        setChosenTime(`${clock}.${fraction}`)
                        setMillisDraft(null)
                      }}
                    />
                  </div>
                </label>
                <label className="millis-field">Fraction
                  <div className="input-wrap">
                    <input
                      inputMode="numeric"
                      aria-label="Fraction of a second"
                      value={millisDraft ?? (chosenTime.split(".")[1] || "000")}
                      onChange={(event) => {
                        const digits = event.target.value.replace(/\D/g, "").slice(0, 3)
                        setMillisDraft(digits)
                        const fraction = (digits || "0").padEnd(3, "0").slice(0, 3)
                        setChosenTime(`${chosenTime.slice(0, 19)}.${fraction}`)
                      }}
                      onBlur={() => setMillisDraft(null)}
                    />
                  </div>
                </label>
              </>
            )}
          </div>
          <div className="put-fields">
            <label>Reading value
              <div className="input-wrap">
                <input inputMode="decimal" value={valueInput} onChange={(event) => setValueInput(event.target.value)} placeholder="22.3" />
              </div>
            </label>
            <button type="button" className="record-button" onClick={() => void recordReading()} disabled={recording}>
              {recording ? "Recording…" : "Record reading"}
            </button>
          </div>
          {recordError ? <p className="notice" role="alert">{recordError}</p> : null}
          {status ? <p className="notice ok">{status}</p> : null}
        </section>

        <div className="section-toolbar">
          <div>
            <h3>Timeseries output</h3>
            <p>{compare ? "Multiple keys plotted on the same graph." : "Your selected reading, visualized as a line graph."}</p>
          </div>
          <div className="toolbar-actions">
            {compare ? (
              <label className="input-wrap compare-keys">
                <input aria-label="Keys to compare" value={compareKeys} onChange={(event) => setCompareKeys(event.target.value)} placeholder="checkout.started, checkout.failed" />
              </label>
            ) : null}
            <button type="button" className={`compare-toggle ${compare ? "on" : ""}`} onClick={() => setCompare((current) => !current)}>
              <span className="toggle-knob" /> Compare multiple keys
            </button>
          </div>
        </div>

        <section className="panel chart-panel">
          <div className="panel-header chart-heading">
            <div>
              <div className="chart-title-row">
                <h3>{compare && series.length > 1 ? "Comparison chart" : (keyName || "Untitled timeseries")}</h3>
                {series.length ? <span className="live-pill"><span /> Query result</span> : null}
              </div>
              <p>
                {resolutionLabel} · {periodFromDate(start, resolution)} – {periodFromDate(end, resolution)}
                {average !== null ? ` · avg ${average.toFixed(2)} · min ${combined.min} · max ${combined.max}` : ""}
              </p>
            </div>
            <div className="chart-actions">
              <button type="button" className="secondary-button" onClick={reset}><RotateCcw size={14} /> Reset</button>
            </div>
          </div>
          {series.length ? (
            <div className="legend">
              {series.map((item) => <span key={item.name}><i style={{ backgroundColor: item.color }} />{item.name}</span>)}
            </div>
          ) : null}
          {pointCount ? <Chart series={series} resolution={resolution} /> : <div className="empty-chart">{queriedAt ? "No readings in this range." : "Run a query to plot readings."}</div>}
          {tableRows.length ? (
            <div className="readings-wrap">
              <table className="readings">
                <thead>
                  <tr><th>Key</th><th>Time</th><th>Value</th></tr>
                </thead>
                <tbody>
                  {tableRows.map((row, index) => (
                    <tr key={`${row.key}-${row.x}-${index}`}>
                      <td>{row.key}</td>
                      <td>{row.label}</td>
                      <td>{row.y}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
        <footer className="footer-note">
          <span>Showing {resolutionLabel.toLowerCase()} resolution</span>
          <span>Data source: <strong>{portfolio}/{org}</strong></span>
        </footer>
      </main>
    </div>
  )
}
