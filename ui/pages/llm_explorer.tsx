import { useEffect, useState } from "react"
import { ChevronDown, Copy, MessageSquare, Send, ShieldCheck, X, Zap } from "lucide-react"
import LlmUsage from "./llm_usage"

interface LlmExplorerProps {
  portfolio: string
  org: string
}

type ModelChoice = {
  provider: string
  model?: string | null
  default?: boolean
  enabled: boolean
  source?: string | null
  reason?: string | null
}

function modelKey(item: ModelChoice) {
  return `${item.provider}\t${item.model || ""}`
}

const PROMPT_CHAR_LIMIT = 8000

type Usage = {
  input_tokens?: number | null
  output_tokens?: number | null
  reasoning_tokens?: number | null
  cached_tokens?: number | null
}

type Cost = {
  estimated?: number | null
  provider_reported?: number | null
  reconciled?: number | null
  currency?: string
}

type Attempt = {
  attempt_id?: string
  deployment_id?: string
  provider_id?: string
  model_id?: string
  source?: string
  status?: string
  error_type?: string | null
  duration_ms?: number | null
  usage?: Usage
  cost?: Cost
}

type GenerateOutput = {
  text?: string
  status?: string
  source?: string
  provider?: string
  requested_model?: string
  model?: string
  deployment_id?: string
  execution_id?: string
  context?: Record<string, string>
  response_time_ms?: number | null
  stop_reason?: string | null
  request_id?: string | null
  error?: string
  error_type?: string
  usage?: Usage
  cost?: Cost
  attempts?: Attempt[]
  limits?: {
    max_output_tokens?: number
    timeout_seconds?: number
    max_messages?: number
    max_prompt_chars?: number
  }
}

const planeCss = `
.llm-plane { width: 100%; min-height: 100vh; display: flex; justify-content: center; align-items: flex-start; background: #fff; color: #1d2633; font-size: 14px; }
.llm-plane, .llm-plane * { box-sizing: border-box; }
.llm-plane button, .llm-plane textarea, .llm-plane input { font: inherit; }
.llm-plane button { cursor: pointer; }
.llm-plane button:disabled { opacity: .55; cursor: default; }
.llm-plane .plane-main { flex: 1 1 auto; min-width: 0; max-width: 1080px; }
.llm-plane .content { padding: 28px 32px 48px; }
.llm-plane .page-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
.llm-plane .eyebrow { color: #9aa3af; font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; display: flex; align-items: center; gap: 8px; margin: 0 0 9px; }
.llm-plane .live-dot, .llm-plane .bad-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.llm-plane .live-dot { background: #5b8c5a; }
.llm-plane .bad-dot { background: #ef6351; }
.llm-plane h1 { font-size: 26px; letter-spacing: -.04em; margin: 0 0 6px; font-weight: 700; color: #1d2633; }
.llm-plane .page-heading p, .llm-plane .panel-header p { margin: 0; color: #7c8795; font-size: 12px; }
.llm-plane .panel-header p { font-size: 12px; }
.llm-plane .probe-button, .llm-plane .send-button { display: inline-flex; align-items: center; gap: 8px; background: #1d2633; color: #fff; border: 0; border-radius: 7px; padding: 9px 14px; font-size: 12px; font-weight: 700; }
.llm-plane .probe-button:hover, .llm-plane .send-button:hover { background: #273241; }
.llm-plane .send-button { width: 100%; justify-content: center; }
.llm-plane .filters { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 12px 0; border-top: 1px solid #e3e7ed; border-bottom: 1px solid #e3e7ed; }
.llm-plane .filter-spacer { flex: 1; min-width: 8px; }
.llm-plane .select-box { min-width: 142px; margin: 0; background: #fff; border: 1px solid #e3e7ed; border-radius: 7px; padding: 8px 10px; display: flex; align-items: center; gap: 8px; }
.llm-plane .select-box:focus-within { border-color: #9fb3cf; box-shadow: 0 0 0 3px #edf3fb; }
.llm-plane .select-label { color: #7f8997; font-size: 9px; text-transform: uppercase; letter-spacing: .07em; font-weight: 700; flex-shrink: 0; }
.llm-plane .select-box select { appearance: none; background: transparent; border: 0; color: #1d2633; font-size: 12px; font-weight: 600; min-width: 0; max-width: 220px; outline: none; cursor: pointer; padding: 0; }
.llm-plane .select-box select:disabled { color: #8a94a2; cursor: default; }
.llm-plane .select-box option { color: #1d2633; background: #fff; }
.llm-plane .select-box > svg { margin-left: auto; color: #9aa3af; flex-shrink: 0; pointer-events: none; }
.llm-plane .time-controls { display: flex; align-items: center; gap: 4px; padding: 3px 4px 3px 10px; border: 1px solid #e3e7ed; border-radius: 7px; background: #fff; }
.llm-plane .time-controls:focus-within { border-color: #9fb3cf; box-shadow: 0 0 0 3px #edf3fb; }
.llm-plane .time-controls .icon-btn { width: 26px; height: 26px; border-radius: 5px; }
.llm-plane .time-controls .icon-btn:disabled:hover { background: transparent; color: #5d6877; }
.llm-plane .granularity { display: flex; align-items: center; gap: 1px; border-left: 1px solid #e3e7ed; border-right: 1px solid #e3e7ed; padding: 0 3px; }
.llm-plane .granularity button { border: 0; background: transparent; color: #7b8594; font-size: 11px; font-weight: 700; padding: 5px 7px; border-radius: 4px; }
.llm-plane .granularity button:hover, .llm-plane .granularity button.active { color: #273241; background: #f8f9fb; }
.llm-plane .date-input { color: #1d2633; background: transparent; border: 0; font: inherit; font-size: 12px; font-weight: 600; padding: 4px 6px; width: 132px; color-scheme: light; outline: none; }
.llm-plane .date-input.with-time { width: 176px; }
.llm-plane .filter-button, .llm-plane .icon-btn, .llm-plane .copy-button { border: 0; background: transparent; color: #5d6877; }
.llm-plane .filter-button { border: 1px solid #e3e7ed; background: #fff; border-radius: 7px; padding: 8px 12px; display: inline-flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 700; }
.llm-plane .filter-button:hover, .llm-plane .icon-btn:hover { background: #f8f9fb; color: #1d2633; }
.llm-plane .icon-btn, .llm-plane .copy-button { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 6px; padding: 0; }
.llm-plane .copy-button.copied { color: #5b8c5a; }
.llm-plane .metric-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0 14px; }
.llm-plane .metric-card, .llm-plane .panel { background: #fff; border: 1px solid #e3e7ed; border-radius: 10px; box-shadow: 0 2px 6px rgba(28, 42, 58, .025); }
.llm-plane .metric-card { padding: 16px 17px; background: #f8f9fb; }
.llm-plane .metric-top { display: flex; justify-content: space-between; align-items: center; color: #8a94a2; font-size: 11px; font-weight: 700; margin-bottom: 13px; }
.llm-plane .metric-icon { width: 25px; height: 25px; border: 1px solid currentColor; border-radius: 6px; display: grid; place-items: center; background: #fff; }
.llm-plane .metric-card strong { display: block; font-size: 23px; letter-spacing: -.04em; font-weight: 700; color: #1d2633; }
.llm-plane .metric-note { color: #7c8795; font-size: 11px; margin-top: 8px; }
.llm-plane .dashboard-grid, .llm-plane .bottom-grid { display: grid; grid-template-columns: 1.7fr 1fr; gap: 13px; }
.llm-plane .chart-panel { grid-row: span 2; display: flex; flex-direction: column; min-height: 0; }
.llm-plane .usage-charts { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.llm-plane .chart-slot { position: relative; flex: 1; min-height: 0; }
.llm-plane .chart-slot .chart { position: absolute; inset: 0; width: 100%; height: 100%; }
.llm-plane .chart-caption { margin: 14px 0 0; color: #8a94a2; font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
.llm-plane .bottom-grid { margin-top: 13px; }
.llm-plane .panel { padding: 17px; }
.llm-plane .panel-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.llm-plane .chart-actions { display: flex; align-items: center; gap: 8px; }
.llm-plane .modal-actions { justify-content: flex-end; margin: 2px 0 4px; }
.llm-plane .chart-modal { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 28px 20px; }
.llm-plane .chart-modal-backdrop { position: absolute; inset: 0; background: rgba(29, 38, 51, .45); }
.llm-plane .chart-modal-card { position: relative; z-index: 1; width: min(1080px, 100%); max-height: calc(100vh - 56px); overflow: auto; background: #fff; border: 1px solid #e3e7ed; border-radius: 12px; box-shadow: 0 18px 50px rgba(28, 42, 58, .2); padding: 20px 22px 18px; }
.llm-plane .chart-modal .scatter { height: auto; padding-bottom: 22px; }
.llm-plane .chart-modal .scatter svg { width: 100%; height: auto; }
.llm-plane .chart-modal .axis-label, .llm-plane .chart-modal .ratio-label, .llm-plane .chart-modal .blend-label { font-size: 12px; }
.llm-plane .data-view { margin: 12px 0 0; max-height: min(68vh, 720px); overflow: auto; background: #f8f9fb; border: 1px solid #e3e7ed; border-radius: 8px; padding: 12px; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #273241; white-space: pre; }
.llm-plane .panel h2 { margin: 0 0 5px; font-size: 14px; font-weight: 700; color: #1d2633; letter-spacing: -.01em; }
.llm-plane .segmented { display: flex; border: 1px solid #e3e7ed; border-radius: 6px; padding: 2px; background: #f8f9fb; }
.llm-plane .segmented button { background: transparent; border: 0; color: #7b8594; padding: 5px 10px; border-radius: 4px; display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 700; }
.llm-plane .segmented button.active { color: #273241; background: #fff; box-shadow: 0 1px 3px #dfe3e8; }
.llm-plane .legend { display: flex; gap: 16px; color: #72808f; font-size: 11px; margin: 16px 0 4px; align-items: center; flex-wrap: wrap; }
.llm-plane .legend span, .llm-plane .scatter-footer span { display: inline-flex; align-items: center; }
.llm-plane .dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.llm-plane .legend .dot, .llm-plane .scatter-footer .dot { margin-right: 6px; }
.llm-plane .cyan { background: #2f80ed; }
.llm-plane .violet { background: #7c6cf0; }
.llm-plane .chart-stat { color: #1d2633; margin-left: auto; font-weight: 700; }
.llm-plane .chart { display: block; width: 100%; height: auto; }
.llm-plane .grid-line { stroke: #edf0f3; stroke-width: 1; }
.llm-plane .axis-label { fill: #9aa3ae; font-size: 10px; }
.llm-plane .donut-content { display: flex; align-items: center; gap: 20px; padding: 18px 4px 4px; }
.llm-plane .donut { width: 127px; height: 127px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; }
.llm-plane .donut-hole { width: 89px; height: 89px; border-radius: 50%; background: #fff; display: flex; flex-direction: column; justify-content: center; align-items: center; }
.llm-plane .donut-hole strong { font-size: 16px; letter-spacing: -.03em; color: #1d2633; }
.llm-plane .donut-hole span { color: #8a94a2; font-size: 10px; margin-top: 2px; }
.llm-plane .donut-legend { flex: 1; min-width: 0; }
.llm-plane .donut-legend > div:not(.donut-foot) { display: grid; grid-template-columns: auto 1fr; gap: 4px 8px; align-items: center; margin: 8px 0; color: #72808f; font-size: 11px; }
.llm-plane .donut-legend > div strong { grid-column: 2; color: #1d2633; font-size: 12px; }
.llm-plane .donut-legend small { color: #8a94a2; font-weight: 400; margin-left: 4px; }
.llm-plane .donut-foot { border-top: 1px solid #e3e7ed; margin-top: 12px; padding-top: 12px; display: flex; justify-content: space-between; gap: 8px; color: #7c8795; font-size: 11px; }
.llm-plane .donut-foot strong { color: #1d2633; font-size: 12px; }
.llm-plane .scatter { position: relative; height: 174px; padding: 8px 0 8px 8px; }
.llm-plane .scatter svg { width: 100%; height: 100%; }
.llm-plane .scatter-y, .llm-plane .scatter-x { position: absolute; color: #9aa3ae; font-size: 10px; }
.llm-plane .scatter-y { top: 8px; left: 0; }
.llm-plane .scatter-x { right: 4px; bottom: 0; }
.llm-plane .scatter-footer { display: flex; flex-wrap: wrap; gap: 8px 13px; color: #72808f; font-size: 11px; margin-top: 8px; }
.llm-plane .scatter-footer small { margin-left: 4px; color: #1d2633; font-weight: 700; }
.llm-plane .ratio-label { fill: #5d6877; font-size: 8px; font-weight: 700; }
.llm-plane .blend-label { fill: #1d2633; font-size: 8px; font-weight: 700; }
.llm-plane .blend-line { width: 14px; height: 0; border-top: 1.5px dashed #1d2633; display: inline-block; margin-right: 6px; }
.llm-plane .table-wrap { overflow-x: auto; margin-top: 12px; }
.llm-plane table { width: 100%; border-collapse: collapse; min-width: 880px; }
.llm-plane th { text-align: left; color: #8a94a2; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; font-weight: 700; padding: 8px 10px 8px 0; border-bottom: 1px solid #e3e7ed; }
.llm-plane td { padding: 10px 10px 10px 0; border-top: 1px solid #f0f2f5; color: #1d2633; font-size: 12px; vertical-align: middle; }
.llm-plane .model-name { display: flex; align-items: center; gap: 8px; color: #1d2633; font-weight: 600; }
.llm-plane .share-bar { display: inline-block; width: 42px; height: 4px; border-radius: 4px; background: #e8edf2; margin-right: 7px; vertical-align: middle; }
.llm-plane .share-bar i { display: block; height: 100%; background: #2f80ed; border-radius: 4px; }
.llm-plane .latency-summary { display: flex; align-items: flex-end; gap: 12px; margin-top: 16px; }
.llm-plane .latency-stat { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; }
.llm-plane .latency-track { height: 120px; width: 100%; display: flex; align-items: flex-end; justify-content: center; border-bottom: 1px solid #e3e7ed; }
.llm-plane .latency-track i { width: min(100%, 36px); display: block; border-radius: 4px 4px 0 0; background: linear-gradient(#7c6cf0, #d9d3f8); }
.llm-plane .latency-track i.errors { background: linear-gradient(#ef6351, #f6d2cb); }
.llm-plane .latency-stat b { margin-top: 8px; color: #1d2633; font-size: 12px; font-weight: 700; letter-spacing: -.02em; white-space: nowrap; }
.llm-plane .latency-stat small { margin-top: 2px; color: #8a94a2; font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
.llm-plane .probe-drawer { width: 340px; flex: 0 0 340px; background: #fff; border-left: 1px solid #e3e7ed; position: sticky; top: 0; align-self: flex-start; max-height: 100vh; overflow: auto; }
.llm-plane .probe-header { padding: 22px 18px 16px; border-bottom: 1px solid #e3e7ed; display: flex; justify-content: space-between; gap: 12px; position: sticky; top: 0; background: #fff; z-index: 1; }
.llm-plane .probe-header h2 { margin: 0 0 5px; font-size: 16px; font-weight: 700; color: #1d2633; }
.llm-plane .probe-header p { margin: 0; color: #7c8795; font-size: 12px; line-height: 1.45; }
.llm-plane .probe-icon { width: 19px; height: 19px; display: inline-grid; place-items: center; border-radius: 5px; color: #2f80ed; background: #edf3fb; }
.llm-plane .probe-body { padding: 18px; }
.llm-plane .probe-body .select-box { width: 100%; margin-bottom: 10px; }
.llm-plane .probe-body .select-box select { max-width: none; flex: 1; }
.llm-plane .field-label { display: block; color: #7f8997; text-transform: uppercase; letter-spacing: .08em; font-size: 10px; font-weight: 700; margin: 16px 0 8px; }
.llm-plane textarea { width: 100%; min-height: 96px; resize: vertical; background: #fff; color: #1d2633; border: 1px solid #e3e7ed; border-radius: 7px; padding: 10px 11px; font-size: 13px; line-height: 1.5; outline: none; }
.llm-plane textarea:focus { border-color: #9fb3cf; box-shadow: 0 0 0 3px #edf3fb; }
.llm-plane .probe-meta { display: flex; justify-content: space-between; gap: 8px; color: #8a94a2; font-size: 11px; margin: 10px 0 14px; }
.llm-plane .probe-meta span:first-child { color: #5b8c5a; display: inline-flex; align-items: center; gap: 5px; }
.llm-plane .response-box { border: 1px solid #e3e7ed; background: #f8f9fb; border-radius: 7px; margin-top: 14px; padding: 12px; }
.llm-plane .response-box.error { border-color: #f3d2cb; background: #fff4f1; }
.llm-plane .response-top { display: flex; justify-content: space-between; align-items: center; color: #5b8c5a; font-size: 12px; font-weight: 700; }
.llm-plane .response-box.error .response-top { color: #8a4b3c; }
.llm-plane .response-top span { display: inline-flex; align-items: center; gap: 6px; }
.llm-plane .response-box p { color: #1d2633; font-size: 13px; line-height: 1.5; margin: 11px 0; white-space: pre-wrap; font-weight: 400; }
.llm-plane .response-tokens { border-top: 1px solid #e3e7ed; padding-top: 9px; display: flex; justify-content: space-between; gap: 8px; color: #8a94a2; font-size: 10px; }
.llm-plane .response-tokens b { display: block; color: #1d2633; margin-top: 3px; font-size: 12px; }
.llm-plane .probe-note { display: flex; gap: 8px; color: #7c8795; font-size: 11px; line-height: 1.45; margin-top: 18px; }
.llm-plane .probe-note svg { flex-shrink: 0; color: #9aa3af; }
.llm-plane .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; margin: 14px 0 0; }
.llm-plane .facts dt { color: #8a94a2; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; margin: 0 0 3px; }
.llm-plane .facts dd { margin: 0; color: #1d2633; font-size: 12px; font-weight: 600; overflow-wrap: anywhere; }
.llm-plane .probe-body table { min-width: 520px; margin-top: 14px; }
.llm-plane details { margin-top: 14px; }
.llm-plane summary { cursor: pointer; color: #3e5b7b; font-size: 12px; font-weight: 700; }
.llm-plane pre { margin: 8px 0 0; padding: 12px; background: #f8f9fb; border: 1px solid #e3e7ed; border-radius: 7px; overflow: auto; font-size: 11px; line-height: 1.45; color: #273241; }
.llm-plane .notice { margin: 12px 0 0; color: #8a4b3c; background: #fff4f1; border: 1px solid #f3d2cb; border-radius: 7px; padding: 8px 10px; font-size: 12px; }
.llm-plane .empty { color: #8a94a2; font-size: 12px; margin: 14px 0 0; }
.llm-plane td.empty { border-top: 0; }
.llm-plane .estimate { margin: 8px 0 0; color: #64748b; font-size: 12px; font-weight: 600; }
.llm-plane .estimate.over { color: #8a4b3c; }
.llm-plane .model-note { margin: 0 0 4px; color: #64748b; font-size: 12px; }
@keyframes llm-plane-spin { to { transform: rotate(360deg); } }
.llm-plane .spin { animation: llm-plane-spin .8s linear infinite; }
@media (min-width: 640px) {
  .llm-plane { margin-left: -.5rem; width: calc(100% + .5rem); }
}
@media (max-width: 1100px) {
  .llm-plane .dashboard-grid, .llm-plane .bottom-grid { grid-template-columns: 1fr; }
  .llm-plane .chart-panel { grid-row: auto; }
}
@media (max-width: 860px) {
  .llm-plane { flex-direction: column; }
  .llm-plane .probe-drawer { width: 100%; flex-basis: auto; position: static; max-height: none; border-left: 0; border-top: 1px solid #e3e7ed; }
  .llm-plane .metric-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 720px) {
  .llm-plane .content { padding: 22px 16px 36px; }
  .llm-plane .page-heading { flex-direction: column; align-items: stretch; }
  .llm-plane .probe-button { justify-content: center; }
  .llm-plane .metric-card strong { font-size: 19px; }
  .llm-plane .donut-content { flex-direction: column; align-items: flex-start; }
  .llm-plane .time-controls { flex-wrap: wrap; }
}
`

function approximateTokens(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).reduce((sum, word) => sum + Math.max(1, Math.ceil(word.length / 4)), 0)
}

function estimateInput(system: string, user: string) {
  const parts = [system, user].map((value) => value.trim()).filter(Boolean)
  const characters = parts.reduce((sum, value) => sum + value.length, 0)
  const tokens = parts.reduce((sum, value) => sum + approximateTokens(value), 0) + parts.length * 4
  return { characters, tokens }
}

async function loadModels(portfolio: string, org: string) {
  const response = await fetch(
    `${import.meta.env.VITE_API_URL}/_llm/${encodeURIComponent(portfolio)}/${encodeURIComponent(org)}/models`,
    { headers: { Authorization: `Bearer ${sessionStorage.accessToken}` } },
  )
  const data = await response.json()
  if (!response.ok || data.success === false) {
    throw new Error(String(data.error || `Request failed (${response.status})`))
  }
  return (data.output?.models || []) as ModelChoice[]
}

async function generate(portfolio: string, org: string, messages: { role: string; content: string }[], model: string, provider: string) {
  const response = await fetch(
    `${import.meta.env.VITE_API_URL}/_llm/${encodeURIComponent(portfolio)}/${encodeURIComponent(org)}/generate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionStorage.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages, model, provider }),
    },
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
  const output = (data.output || {}) as GenerateOutput
  if ((!response.ok || data.success === false) && !data.output) {
    throw new Error(String(data.error || data.message || `Request failed (${response.status})`))
  }
  if (data.success === false && data.error && !output.error) {
    output.error = String(data.error)
    output.error_type = data.error_type ? String(data.error_type) : undefined
  }
  return output
}

function shown(value: string | number | null | undefined) {
  return value == null || value === "" ? "—" : String(value)
}

function formatDuration(value: number | null | undefined) {
  if (value == null) return "—"
  if (value < 1000) return `${value} ms`
  return `${(value / 1000).toFixed(2)} s`
}

function formatMoney(value: number | null | undefined, currency?: string) {
  if (value == null) return "—"
  return `${value} ${currency || "USD"}`
}

export default function LlmExplorer({ portfolio, org }: LlmExplorerProps) {
  const [models, setModels] = useState<ModelChoice[]>([])
  const [model, setModel] = useState("")
  const [modelsError, setModelsError] = useState("")
  const [system, setSystem] = useState("")
  const [prompt, setPrompt] = useState("Say hello in one sentence.")
  const [output, setOutput] = useState<GenerateOutput | null>(null)
  const [roundTripMs, setRoundTripMs] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [usageRevision, setUsageRevision] = useState(0)
  const [probeOpen, setProbeOpen] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    setModelsError("")
    loadModels(portfolio, org)
      .then((list) => {
        if (cancelled) return
        setModels(list)
        setModel((current) => {
          if (list.some((item) => modelKey(item) === current && item.enabled)) return current
          const preferred = list.find((item) => item.enabled && item.default) || list.find((item) => item.enabled)
          return preferred ? modelKey(preferred) : ""
        })
      })
      .catch((exc) => {
        if (!cancelled) setModelsError(exc instanceof Error ? exc.message : "Could not load models")
      })
    return () => {
      cancelled = true
    }
  }, [portfolio, org])

  const selected = models.find((item) => modelKey(item) === model) || null
  const probeProviders = [...new Set(models.map((item) => item.provider))].sort()
  const selectedProvider = selected?.provider || probeProviders[0] || ""
  const providerModels = models.filter((item) => item.provider === selectedProvider)
  const estimate = estimateInput(system, prompt)
  const overLimit = estimate.characters > PROMPT_CHAR_LIMIT

  const chooseProvider = (provider: string) => {
    const list = models.filter((item) => item.provider === provider)
    const preferred = list.find((item) => item.enabled && item.default) || list.find((item) => item.enabled) || list[0]
    setModel(preferred ? modelKey(preferred) : "")
  }

  const copyReply = async () => {
    if (!output?.text) return
    try {
      await navigator.clipboard.writeText(output.text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  const run = async () => {
    const text = prompt.trim()
    if (!selected?.enabled || !selected.model) {
      setError(selected?.reason || "Select an available model")
      return
    }
    if (!text) {
      setError("A prompt is required")
      return
    }
    if (overLimit) {
      setError(`Prompt is limited to ${PROMPT_CHAR_LIMIT} characters`)
      return
    }
    const messages = []
    if (system.trim()) messages.push({ role: "system", content: system.trim() })
    messages.push({ role: "user", content: text })
    setLoading(true)
    setError("")
    const started = performance.now()
    try {
      const next = await generate(portfolio, org, messages, selected.model, selected.provider)
      setRoundTripMs(Math.round(performance.now() - started))
      setOutput(next)
      setError(next.error || "")
      setUsageRevision((value) => value + 1)
    } catch (exc) {
      setRoundTripMs(Math.round(performance.now() - started))
      setOutput(null)
      setError(exc instanceof Error ? exc.message : "generate failed")
    } finally {
      setLoading(false)
    }
  }

  const usage = output?.usage
  const cost = output?.cost
  const limits = output?.limits
  const facts: [string, string][] = output ? [
    ["Status", shown(output.status)],
    ["Source", shown(output.source)],
    ["Provider", shown(output.provider)],
    ["Alias", shown(output.requested_model)],
    ["Model", shown(output.model)],
    ["Deployment", shown(output.deployment_id)],
    ["Tokens in", shown(usage?.input_tokens)],
    ["Tokens out", shown(usage?.output_tokens)],
    ["Reasoning tokens", shown(usage?.reasoning_tokens)],
    ["Cached tokens", shown(usage?.cached_tokens)],
    ["Response time", formatDuration(output.response_time_ms)],
    ["Round trip", formatDuration(roundTripMs)],
    ["Stop reason", shown(output.stop_reason)],
    ["Estimated cost", formatMoney(cost?.estimated, cost?.currency)],
    ["Provider cost", formatMoney(cost?.provider_reported, cost?.currency)],
    ["Reconciled cost", formatMoney(cost?.reconciled, cost?.currency)],
    ["Error type", shown(output.error_type)],
    ["Request id", shown(output.request_id)],
    ["Execution", shown(output.execution_id)],
    ["Extension", shown(output.context?.extension_id)],
    ["Output cap", limits?.max_output_tokens == null ? "—" : `${limits.max_output_tokens} tokens`],
    ["Timeout", limits?.timeout_seconds == null ? "—" : `${limits.timeout_seconds} s`],
  ] : []

  const failed = Boolean(output?.error || error)
  const statusLabel = output ? shown(output.status) : (error ? "Error" : "")

  return (
    <div className="llm-plane">
      <style>{planeCss}</style>
      <div className="plane-main">
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><span className="live-dot" />Live monitoring</div>
              <h1>LLM overview</h1>
              <p>Usage, cost, and performance for {portfolio}/{org}.</p>
            </div>
            {probeOpen ? null : (
              <button type="button" className="probe-button" aria-expanded={false} onClick={() => setProbeOpen(true)}>
                <MessageSquare size={16} />
                Troubleshooting probe
              </button>
            )}
          </div>
          <LlmUsage portfolio={portfolio} org={org} revision={usageRevision} />
        </div>
      </div>
      {probeOpen ? (
        <aside className="probe-drawer">
          <div className="probe-header">
            <div>
              <div className="eyebrow"><span className="probe-icon"><MessageSquare size={14} /></span>Debug tool</div>
              <h2>Troubleshooting probe</h2>
              <p>Send a request and inspect the normalized response. Output is capped at 256 tokens.</p>
            </div>
            <button type="button" className="icon-btn" aria-label="Close probe" onClick={() => setProbeOpen(false)}><X size={17} /></button>
          </div>
          <div className="probe-body">
            <label className="select-box">
              <span className="select-label">Provider</span>
              <select value={selectedProvider} onChange={(event) => chooseProvider(event.target.value)} disabled={!models.length}>
                {models.length ? null : <option value="">Loading models…</option>}
                {probeProviders.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <ChevronDown size={14} />
            </label>
            <label className="select-box">
              <span className="select-label">Model</span>
              <select value={model} onChange={(event) => setModel(event.target.value)} disabled={!providerModels.length}>
                {providerModels.length ? null : <option value="">Loading models…</option>}
                {providerModels.map((item) => (
                  <option key={modelKey(item)} value={modelKey(item)} disabled={!item.enabled}>
                    {item.enabled
                      ? `${item.model}${item.default ? " · default" : ""}`
                      : `${item.model || item.source || item.provider} — ${item.reason}`}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
            {modelsError ? <p className="notice" role="alert">{modelsError}</p> : null}
            {selected ? <p className="model-note">{selected.enabled ? `${selected.source} · ${selected.model}` : selected.reason}</p> : null}
            <label className="field-label" htmlFor="llm-system">System</label>
            <textarea id="llm-system" value={system} onChange={(event) => setSystem(event.target.value)} placeholder="Optional instruction" />
            <label className="field-label" htmlFor="llm-message">Message</label>
            <textarea id="llm-message" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Say hello in one sentence." />
            <p className={overLimit ? "estimate over" : "estimate"}>
              About {estimate.tokens} input tokens · {estimate.characters} characters
              {overLimit ? ` · over the ${PROMPT_CHAR_LIMIT} character limit` : ""}
            </p>
            <div className="probe-meta">
              <span><ShieldCheck size={14} />Normalized output</span>
              <span>max 256 tokens</span>
            </div>
            {error ? <p className="notice" role="alert">{error}</p> : null}
            <button type="button" className="send-button" onClick={() => void run()} disabled={loading || !selected?.enabled || overLimit}>
              {loading ? "Sending…" : <><Send size={16} />Send request</>}
            </button>
            {output ? (
              <div className={failed ? "response-box error" : "response-box"}>
                <div className="response-top">
                  <span><i className={failed ? "bad-dot" : "live-dot"} />{statusLabel} · {formatDuration(output.response_time_ms ?? roundTripMs)}</span>
                  <button type="button" className={copied ? "copy-button copied" : "copy-button"} aria-label="Copy reply" onClick={() => void copyReply()} disabled={!output.text}>
                    <Copy size={14} />
                  </button>
                </div>
                {output.text ? <p>{output.text}</p> : <p>{output.error || "No text in the response."}</p>}
                <div className="response-tokens">
                  <span>Input <b>{shown(usage?.input_tokens)}</b></span>
                  <span>Output <b>{shown(usage?.output_tokens)}</b></span>
                  <span>Cost <b>{formatMoney(cost?.estimated, cost?.currency)}</b></span>
                </div>
              </div>
            ) : <p className="empty">Send a request to see the reply.</p>}
            {output ? (
              <dl className="facts">
                {facts.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {output?.attempts?.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Attempt</th>
                      <th>Source</th>
                      <th>Model</th>
                      <th>Status</th>
                      <th>In</th>
                      <th>Out</th>
                      <th>Time</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {output.attempts.map((attempt, index) => (
                      <tr key={attempt.attempt_id || index}>
                        <td>{index + 1}</td>
                        <td>{shown(attempt.source)}</td>
                        <td>{shown(attempt.model_id)}</td>
                        <td>{shown(attempt.status)}</td>
                        <td>{shown(attempt.usage?.input_tokens)}</td>
                        <td>{shown(attempt.usage?.output_tokens)}</td>
                        <td>{formatDuration(attempt.duration_ms)}</td>
                        <td>{shown(attempt.error_type)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {output ? (
              <details>
                <summary>Call record</summary>
                <pre>{JSON.stringify(output, null, 2)}</pre>
              </details>
            ) : null}
            <div className="probe-note"><Zap size={15} /><span>Requests go through the LLM plane. Provider credentials stay on the server.</span></div>
          </div>
        </aside>
      ) : null}
    </div>
  )
}
