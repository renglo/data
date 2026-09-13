import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  portfolio: string;
  org: string;
  readonly?: boolean;
  mode?: "query" | "admin";
}

type Hit = {
  entity_id?: string;
  entity_type?: string;
  score?: number;
  metadata?: Record<string, unknown>;
  attrs?: Record<string, unknown>;
  key?: string;
  updated_at?: string;
};

function vectorBase(portfolio: string, org: string) {
  return `/_vector/${encodeURIComponent(portfolio)}/${encodeURIComponent(org)}`;
}

async function apiJson(path: string, init: RequestInit = {}) {
  const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
    method: init.method || "POST",
    headers: {
      Authorization: `Bearer ${sessionStorage.accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    body: init.body,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || data?.message || `Request failed (${res.status})`);
  }
  return data;
}

export default function VectorExplorerPanel({
  portfolio,
  org,
  readonly = true,
  mode = "query",
}: Props) {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [entityType, setEntityType] = useState("");
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState("10");
  const [hits, setHits] = useState<Hit[]>([]);
  const [items, setItems] = useState<Hit[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [putEntityType, setPutEntityType] = useState("threat_event");
  const [putEntityId, setPutEntityId] = useState("");
  const [putText, setPutText] = useState("");
  const [deleteEntityType, setDeleteEntityType] = useState("threat_event");
  const [deleteEntityId, setDeleteEntityId] = useState("");

  const base = vectorBase(portfolio, org);

  const loadStatus = useCallback(async () => {
    try {
      const data = await apiJson(`${base}/status`, { body: JSON.stringify({}) });
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "status failed");
    }
  }, [base]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const runQuery = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiJson(`${base}/query`, {
        body: JSON.stringify({
          entity_type: entityType.trim() || undefined,
          text: query,
          top_k: Number(topK) || 10,
        }),
      });
      setHits(Array.isArray(data.hits) ? data.hits : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "query failed");
      setHits([]);
    } finally {
      setLoading(false);
    }
  };

  const runList = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiJson(`${base}/list`, {
        body: JSON.stringify({
          entity_type: entityType.trim() || undefined,
          max_results: 100,
        }),
      });
      setItems(Array.isArray(data.items) ? data.items : []);
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "list failed");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const runPut = async () => {
    if (readonly) return;
    setLoading(true);
    setError("");
    try {
      await apiJson(
        `${base}/${encodeURIComponent(putEntityType)}/${encodeURIComponent(putEntityId)}`,
        { body: JSON.stringify({ text: putText }) },
      );
      await runList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "put failed");
    } finally {
      setLoading(false);
    }
  };

  const runDelete = async () => {
    if (readonly) return;
    setLoading(true);
    setError("");
    try {
      await apiJson(
        `${base}/${encodeURIComponent(deleteEntityType)}/${encodeURIComponent(deleteEntityId)}`,
        { method: "DELETE" },
      );
      await runList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete failed");
    } finally {
      setLoading(false);
    }
  };

  const runPurge = async () => {
    if (readonly) return;
    const ok = window.confirm(
      `Purge the Vector DB for ${portfolio}/${org}? This deletes every vector in this org index.`,
    );
    if (!ok) return;
    setLoading(true);
    setError("");
    try {
      await apiJson(`${base}/purge`, { body: JSON.stringify({ confirm: true }) });
      setHits([]);
      setItems([]);
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "purge failed");
    } finally {
      setLoading(false);
    }
  };

  const counts = (status?.counts || {}) as Record<string, number>;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {mode === "admin" ? "Vector admin" : "Vector DB"}
          </CardTitle>
          <CardDescription>
            {mode === "admin"
              ? "Put, delete, or purge this org’s Vector DB. Index name is derived from the current portfolio/org."
              : "Query this org’s Vector DB. Leave entity type empty for org-wide similarity."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {status ? (
            <pre className="max-h-32 overflow-auto rounded-md border bg-muted/40 p-2 text-xs">
              {JSON.stringify(
                {
                  backend: status.backend,
                  bucket: status.bucket,
                  index: status.index,
                  count: status.count,
                  counts: status.counts,
                  embedding_model_id: status.embedding_model_id,
                },
                null,
                2,
              )}
            </pre>
          ) : (
            <p className="text-muted-foreground">Loading status…</p>
          )}

          {Object.keys(counts).length > 0 ? (
            <p className="text-xs text-muted-foreground">
              {Object.entries(counts)
                .map(([type, n]) => `${type}: ${n}`)
                .join(" · ")}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>entity_type (optional)</Label>
              <Input
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                placeholder="threat_event, catalog, campaign…"
              />
            </div>
            {mode === "query" ? (
              <>
                <div className="space-y-1">
                  <Label>top_k</Label>
                  <Input value={topK} onChange={(e) => setTopK(e.target.value)} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Query text</Label>
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="fingerprint or free text"
                  />
                </div>
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {mode === "query" ? (
              <>
                <Button type="button" onClick={runQuery} disabled={loading || !query.trim()}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  Query
                </Button>
                <Button type="button" variant="outline" onClick={() => void runList()} disabled={loading}>
                  List
                </Button>
              </>
            ) : null}
          </div>

          {mode === "admin" && !readonly ? (
            <div className="space-y-3 rounded-md border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Put entity_type</Label>
                  <Input value={putEntityType} onChange={(e) => setPutEntityType(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Put entity_id</Label>
                  <Input value={putEntityId} onChange={(e) => setPutEntityId(e.target.value)} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>text</Label>
                  <Input value={putText} onChange={(e) => setPutText(e.target.value)} />
                </div>
              </div>
              <Button type="button" variant="secondary" onClick={runPut} disabled={loading}>
                Put vector
              </Button>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Delete entity_type</Label>
                  <Input value={deleteEntityType} onChange={(e) => setDeleteEntityType(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Delete entity_id</Label>
                  <Input value={deleteEntityId} onChange={(e) => setDeleteEntityId(e.target.value)} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={runDelete} disabled={loading}>
                  Delete vector
                </Button>
                <Button type="button" variant="destructive" onClick={runPurge} disabled={loading}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Purge org index
                </Button>
                <Button type="button" variant="ghost" onClick={() => void runList()} disabled={loading}>
                  Refresh list
                </Button>
              </div>
            </div>
          ) : null}

          {mode === "admin" && readonly ? (
            <p className="text-sm text-muted-foreground">Read-only. Open with write access to put, delete, or purge.</p>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2">entity_type</th>
                  <th className="p-2">entity_id</th>
                  <th className="p-2">{mode === "query" && hits.length ? "score" : "updated"}</th>
                  <th className="p-2">attrs</th>
                </tr>
              </thead>
              <tbody>
                {(mode === "query" && hits.length ? hits : items).length === 0 ? (
                  <tr>
                    <td className="p-2 text-muted-foreground" colSpan={4}>
                      {mode === "query" ? "No hits" : "No vectors listed"}
                    </td>
                  </tr>
                ) : (
                  (mode === "query" && hits.length ? hits : items).map((h, i) => (
                    <tr key={`${h.key || h.entity_id || i}`} className="border-t">
                      <td className="p-2 font-mono">{String(h.entity_type || "")}</td>
                      <td className="p-2 font-mono">{String(h.entity_id || "")}</td>
                      <td className="p-2">
                        {mode === "query" && h.score != null
                          ? Number(h.score).toFixed(4)
                          : String(h.updated_at || "—")}
                      </td>
                      <td className="p-2 font-mono">
                        <pre className="max-w-md whitespace-pre-wrap break-all">
                          {JSON.stringify(h.attrs || h.metadata || {}, null, 0)}
                        </pre>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
