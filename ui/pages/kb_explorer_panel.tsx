import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  portfolio: string;
  org: string;
}

type Chunk = {
  text?: string;
  score?: number;
  location?: Record<string, unknown>;
};

async function apiPost(path: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionStorage.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || data?.message || `Request failed (${res.status})`);
  }
  return data;
}

export default function KbExplorerPanel({ portfolio: _portfolio, org: _org }: Props) {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [query, setQuery] = useState("");
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [answer, setAnswer] = useState("");
  const [filename, setFilename] = useState("runbook.md");
  const [content, setContent] = useState("");
  const [jobId, setJobId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncHint, setSyncHint] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const data = await apiPost("/_rag/status", {});
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "status failed");
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const runRetrieve = async () => {
    setLoading(true);
    setError("");
    setAnswer("");
    try {
      const data = await apiPost("/_rag/retrieve", { query, number_of_results: 5 });
      setChunks(Array.isArray(data.results) ? data.results : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "retrieve failed");
      setChunks([]);
    } finally {
      setLoading(false);
    }
  };

  const runGenerate = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiPost("/_rag/generate", { query, number_of_results: 5 });
      setAnswer(String(data.answer || ""));
      setChunks(
        Array.isArray(data.citations)
          ? data.citations.flatMap((c: { references?: Chunk[] }) => c.references || [])
          : [],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "generate failed");
    } finally {
      setLoading(false);
    }
  };

  const runUpload = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiPost("/_rag/upload", {
        filename,
        content_text: content,
        subpath: "runbooks",
      });
      setSyncHint(`Uploaded ${data.key || filename}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    } finally {
      setLoading(false);
    }
  };

  const startSync = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiPost("/_rag/start_sync", {});
      const id = String(data.ingestion_job_id || "");
      if (id) setJobId(id);
      setSyncHint(`Sync started: ${data.status || "SUBMITTED"} (${id || "no id"})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "start_sync failed");
    } finally {
      setLoading(false);
    }
  };

  const pollSync = async () => {
    if (!jobId) {
      setError("ingestion_job_id required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await apiPost("/_rag/sync_status", { ingestion_job_id: jobId });
      setSyncHint(`Job ${data.ingestion_job_id}: ${data.status}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "sync_status failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Knowledge base</CardTitle>
          <CardDescription>
            Default platform Bedrock KB via `/_rag` (document retrieve / upload / sync).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {status ? (
            <pre className="max-h-28 overflow-auto rounded-md border bg-muted/40 p-2 text-xs">
              {JSON.stringify(
                {
                  kb_id: status.kb_id,
                  rag_docs_bucket: status.rag_docs_bucket,
                  rag_docs_prefix: status.rag_docs_prefix,
                  rag_data_source_id: status.rag_data_source_id,
                  rag_model_arn_configured: status.rag_model_arn_configured,
                },
                null,
                2,
              )}
            </pre>
          ) : (
            <p className="text-muted-foreground">Loading status…</p>
          )}

          <div className="space-y-1">
            <Label>Query</Label>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask the knowledge base…"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={runRetrieve} disabled={loading || !query.trim()}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Retrieve
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={runGenerate}
              disabled={loading || !query.trim() || !status?.rag_model_arn_configured}
            >
              Generate
            </Button>
          </div>

          {answer ? (
            <div className="rounded-md border p-3 text-sm">
              <div className="mb-1 text-xs font-medium text-muted-foreground">Answer</div>
              {answer}
            </div>
          ) : null}

          <div className="space-y-2">
            {chunks.length === 0 ? (
              <p className="text-muted-foreground">No chunks yet.</p>
            ) : (
              chunks.map((c, i) => (
                <div key={i} className="rounded-md border p-2 text-xs">
                  <div className="mb-1 text-muted-foreground">
                    score: {c.score != null ? Number(c.score).toFixed(4) : "—"}
                  </div>
                  <p className="whitespace-pre-wrap">{c.text || ""}</p>
                </div>
              ))
            )}
          </div>

          <div className="space-y-2 border-t pt-3">
            <div className="text-sm font-medium">Upload + sync</div>
            <div className="space-y-1">
              <Label>Filename</Label>
              <Input value={filename} onChange={(e) => setFilename(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Content</Label>
              <Textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={runUpload} disabled={loading || !content}>
                <Upload className="mr-2 h-4 w-4" />
                Upload
              </Button>
              <Button type="button" variant="secondary" onClick={startSync} disabled={loading}>
                Start sync
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                placeholder="ingestion_job_id"
              />
              <Button type="button" variant="outline" onClick={pollSync} disabled={loading}>
                Sync status
              </Button>
            </div>
            {syncHint ? <p className="text-xs text-muted-foreground">{syncHint}</p> : null}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
