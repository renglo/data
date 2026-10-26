import { useEffect, useState } from "react"
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

const explorerCss = `
.llm-explorer { color: #1d2633; font-size: 14px; }
.llm-explorer button, .llm-explorer textarea, .llm-explorer input { font: inherit; }
.llm-explorer button { cursor: pointer; }
.llm-explorer .content { padding: 28px 32px 24px; min-width: 0; }
.llm-explorer .eyebrow { color: #9aa3af; text-transform: uppercase; letter-spacing: .12em; font-size: 10px; font-weight: 700; margin: 0 0 5px; }
.llm-explorer h2 { margin: 0 0 7px; font-size: 26px; letter-spacing: -.04em; font-weight: 700; }
.llm-explorer .subheading, .llm-explorer .panel-header p { color: #7c8795; margin: 0; font-size: 12px; }
.llm-explorer .panel { background: #fff; border: 1px solid #e3e7ed; border-radius: 10px; box-shadow: 0 2px 6px rgba(28, 42, 58, .025); padding: 22px 24px 20px; margin-bottom: 16px; }
.llm-explorer .panel-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.llm-explorer h3 { margin: 0 0 5px; font-size: 14px; letter-spacing: -.01em; font-weight: 700; }
.llm-explorer label { display: flex; flex-direction: column; gap: 8px; color: #7f8997; font-size: 11px; font-weight: 700; margin-top: 16px; }
.llm-explorer textarea { width: 100%; min-height: 96px; resize: vertical; border: 1px solid #e3e7ed; border-radius: 7px; padding: 10px 11px; color: #1d2633; font-size: 13px; font-weight: 400; line-height: 1.45; }
.llm-explorer textarea:focus, .llm-explorer select:focus { outline: 0; border-color: #9fb3cf; box-shadow: 0 0 0 3px #edf3fb; }
.llm-explorer select { width: 100%; border: 1px solid #e3e7ed; border-radius: 7px; padding: 9px 11px; color: #1d2633; background: #fff; font-size: 13px; font-weight: 600; }
.llm-explorer select:disabled { color: #8a94a2; }
.llm-explorer .model-note, .llm-explorer .estimate { margin: 8px 0 0; color: #64748b; font-size: 12px; font-weight: 600; }
.llm-explorer .model-note { font-weight: 400; }
.llm-explorer .estimate.over { color: #8a4b3c; }
.llm-explorer .footer { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-top: 18px; }
.llm-explorer .run-button { margin-left: auto; display: inline-flex; align-items: center; border: 0; border-radius: 7px; background: #1d2633; color: white; padding: 9px 14px; font-size: 12px; font-weight: 700; }
.llm-explorer button:disabled { opacity: .55; cursor: default; }
.llm-explorer .notice { margin: 12px 0 0; color: #8a4b3c; background: #fff4f1; border: 1px solid #f3d2cb; border-radius: 7px; padding: 8px 10px; font-size: 12px; }
.llm-explorer .reply { white-space: pre-wrap; color: #1d2633; font-size: 14px; font-weight: 400; line-height: 1.5; margin: 14px 0 0; }
.llm-explorer .facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px 18px; margin: 16px 0 0; }
.llm-explorer .facts div { min-width: 0; }
.llm-explorer .facts dt { color: #8a94a2; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; margin: 0 0 3px; }
.llm-explorer .facts dd { margin: 0; color: #1d2633; font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
.llm-explorer table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; font-weight: 400; }
.llm-explorer th { text-align: left; color: #8a94a2; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; font-weight: 700; padding: 6px 8px 6px 0; border-bottom: 1px solid #e3e7ed; }
.llm-explorer td { padding: 8px 8px 8px 0; border-bottom: 1px solid #f0f2f5; vertical-align: top; }
.llm-explorer details { margin-top: 14px; }
.llm-explorer summary { cursor: pointer; color: #64748b; font-size: 12px; font-weight: 700; }
.llm-explorer pre { margin: 10px 0 0; padding: 12px; background: #f8f9fb; border: 1px solid #e3e7ed; border-radius: 7px; overflow: auto; font-size: 11px; line-height: 1.45; color: #273241; }
.llm-explorer .empty { color: #8a94a2; font-size: 12px; font-weight: 400; margin: 14px 0 0; }
@media (max-width: 700px) {
  .llm-explorer .content { padding: 24px 16px; }
  .llm-explorer .run-button { margin-left: 0; }
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
  const estimate = estimateInput(system, prompt)
  const overLimit = estimate.characters > PROMPT_CHAR_LIMIT

  const run = async () => {
    const text = prompt.trim()
    if (!selected?.enabled) {
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
      const next = await generate(portfolio, org, messages, selected.model || "default", selected.provider)
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

  return (
    <div className="llm-explorer">
      <style>{explorerCss}</style>
      <main className="content">
        <p className="eyebrow">LLM explorer</p>
        <h2>LLM plane</h2>
        <p className="subheading">Usage for {portfolio}/{org}, then a short prompt. Output is capped at 256 tokens.</p>

        <LlmUsage portfolio={portfolio} org={org} revision={usageRevision} />

        <section className="panel">
          <div className="panel-header">
            <div>
              <h3>Prompt</h3>
              <p>Pick the model first. System text is optional.</p>
            </div>
          </div>
          <label>Model
            <select value={model} onChange={(event) => setModel(event.target.value)} disabled={!models.length}>
              {models.length ? null : <option value="">Loading models…</option>}
              {models.map((item) => (
                <option key={modelKey(item)} value={modelKey(item)} disabled={!item.enabled}>
                  {item.enabled
                    ? `${item.model} — ${item.source}${item.default ? " · default" : ""}`
                    : `${item.source || item.provider} — ${item.reason}`}
                </option>
              ))}
            </select>
          </label>
          {modelsError ? <p className="notice" role="alert">{modelsError}</p> : null}
          {selected ? (
            <p className="model-note">
              {selected.enabled
                ? `${selected.source} · ${selected.model}`
                : selected.reason}
            </p>
          ) : null}
          <label>System
            <textarea value={system} onChange={(event) => setSystem(event.target.value)} placeholder="Optional instruction" />
          </label>
          <label>User
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Say hello in one sentence." />
          </label>
          <p className={overLimit ? "estimate over" : "estimate"}>
            About {estimate.tokens} input tokens · {estimate.characters} characters
            {overLimit ? ` · over the ${PROMPT_CHAR_LIMIT} character limit` : ""}
          </p>
          {error ? <p className="notice" role="alert">{error}</p> : null}
          <div className="footer">
            <button type="button" className="run-button" onClick={() => void run()} disabled={loading || !selected?.enabled || overLimit}>
              {loading ? "Generating…" : "Generate"}
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h3>Reply</h3>
              <p>{output?.model ? `${output.source || output.provider} · ${output.model}` : "The model reply and the call record."}</p>
            </div>
          </div>
          {output?.text ? <p className="reply">{output.text}</p> : <p className="empty">Generate a prompt to see the reply.</p>}
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
          ) : null}
          {output ? (
            <details>
              <summary>Call record</summary>
              <pre>{JSON.stringify(output, null, 2)}</pre>
            </details>
          ) : null}
        </section>
      </main>
    </div>
  )
}
