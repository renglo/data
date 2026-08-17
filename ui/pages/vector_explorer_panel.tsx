import { useCallback, useEffect, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  portfolio: string;
  org: string;
  readonly?: boolean;
}

type Hit = {
  entity_id?: string;
  score?: number;
  metadata?: Record<string, unknown>;
  key?: string;
};

async function apiPost(path: string, body: Record<string, unknown>) {
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

export default function VectorExplorerPanel({ portfolio, org, readonly = true }: Props) {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [indexName, setIndexName] = useState("threat-events");
  const [extension, setExtension] = useState("arbitiumtriage");
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState("10");
  const [hits, setHits] = useState<Hit[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [putEntityId, setPutEntityId] = useState("");
  const [putText, setPutText] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const data = await apiPost("/_vector/status", { portfolio, org });
      setStatus(data);
      const indexes = (data.indexes || {}) as Record<string, string>;
      const first = Object.values(indexes)[0];
      if (first && !indexName) setIndexName(first);
    } catch (e) {
      setError(e instanceof Error ? e.message : "status failed");
    }
  }, [portfolio, org, indexName]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const runQuery = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiPost("/_vector/query", {
        portfolio,
        org,
        extension,
        index_name: indexName,
        text: query,
        top_k: Number(topK) || 10,
      });
      setHits(Array.isArray(data.hits) ? data.hits : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "query failed");
      setHits([]);
    } finally {
      setLoading(false);
    }
  };

  const runPut = async () => {
    if (readonly && !showAdmin) return;
    setLoading(true);
    setError("");
    try {
      await apiPost("/_vector/put", {
        portfolio,
        org,
        extension,
        index_name: indexName,
        entity_id: putEntityId,
        text: putText,
      });
      await runQuery();
    } catch (e) {
      setError(e instanceof Error ? e.message : "put failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Vector DB</CardTitle>
          <CardDescription>
            Live entity ANN via platform `/_vector` (S3 Vectors). Filter by extension + portfolio/org.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {status ? (
            <pre className="max-h-32 overflow-auto rounded-md border bg-muted/40 p-2 text-xs">
              {JSON.stringify(
                {
                  backend: status.backend,
                  bucket: status.bucket,
                  indexes: status.indexes,
                  embedding_model_id: status.embedding_model_id,
                },
                null,
                2,
              )}
            </pre>
          ) : (
            <p className="text-muted-foreground">Loading status…</p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Index</Label>
              <Input value={indexName} onChange={(e) => setIndexName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Extension</Label>
              <Input value={extension} onChange={(e) => setExtension(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Query text</Label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="fingerprint or free text"
              />
            </div>
            <div className="space-y-1">
              <Label>top_k</Label>
              <Input value={topK} onChange={(e) => setTopK(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={runQuery} disabled={loading || !query.trim()}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              Query
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowAdmin((v) => !v)}>
              {showAdmin ? "Hide admin" : "Admin put"}
            </Button>
          </div>

          {showAdmin && !readonly ? (
            <div className="space-y-2 rounded-md border p-3">
              <div className="space-y-1">
                <Label>entity_id</Label>
                <Input value={putEntityId} onChange={(e) => setPutEntityId(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>text</Label>
                <Input value={putText} onChange={(e) => setPutText(e.target.value)} />
              </div>
              <Button type="button" variant="secondary" onClick={runPut} disabled={loading}>
                Put vector
              </Button>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2">entity_id</th>
                  <th className="p-2">score</th>
                  <th className="p-2">metadata</th>
                </tr>
              </thead>
              <tbody>
                {hits.length === 0 ? (
                  <tr>
                    <td className="p-2 text-muted-foreground" colSpan={3}>
                      No hits
                    </td>
                  </tr>
                ) : (
                  hits.map((h, i) => (
                    <tr key={`${h.key || h.entity_id || i}`} className="border-t">
                      <td className="p-2 font-mono">{String(h.entity_id || "")}</td>
                      <td className="p-2">{h.score != null ? Number(h.score).toFixed(4) : "—"}</td>
                      <td className="p-2 font-mono">
                        <pre className="max-w-md whitespace-pre-wrap break-all">
                          {JSON.stringify(h.metadata || {}, null, 0)}
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
