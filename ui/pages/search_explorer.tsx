import React, { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface SearchExplorerProps {
  portfolio: string;
  org: string;
}

const parseCsvList = (raw: string): string[] | undefined => {
  const list = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
};

const parseJsonObject = (raw: string): Record<string, unknown> | undefined => {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected a JSON object.");
  }
  return parsed as Record<string, unknown>;
};

export default function SearchExplorer({ portfolio, org }: SearchExplorerProps) {
  const [query, setQuery] = useState("");
  const [rings, setRings] = useState("");
  const [fields, setFields] = useState("");
  const [extraFiltersJson, setExtraFiltersJson] = useState("");
  const [boostFieldsJson, setBoostFieldsJson] = useState("");
  const [resolveMatches, setResolveMatches] = useState(true);
  const [limit, setLimit] = useState("20");
  const [offset, setOffset] = useState("0");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [response, setResponse] = useState<unknown>(null);
  const [lastUrl, setLastUrl] = useState("");
  const [lastPayload, setLastPayload] = useState<Record<string, unknown> | null>(null);

  const runSearch = async () => {
    setLoading(true);
    setError("");
    setResponse(null);
    try {
      const url = `${import.meta.env.VITE_API_URL}/_search/${portfolio}/${org}`;
      const payload: Record<string, unknown> = {
        query: query.trim(),
        limit: Number(limit) || 20,
        offset: Number(offset) || 0,
      };
      const filters: Record<string, unknown> = {};

      const ringsList = parseCsvList(rings);
      if (ringsList) filters.rings = ringsList;

      const fieldsList = parseCsvList(fields);
      if (fieldsList) filters.fields = fieldsList;

      const extraFilters = parseJsonObject(extraFiltersJson);
      if (extraFilters) Object.assign(filters, extraFilters);

      const boostFields = parseJsonObject(boostFieldsJson);
      if (boostFields) filters.boost_fields = boostFields;
      if (resolveMatches) filters.resolve = true;

      if (Object.keys(filters).length > 0) {
        payload.filters = filters;
      }

      setLastUrl(url);
      setLastPayload(payload);

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionStorage.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      const body = text ? JSON.parse(text) : {};
      if (!res.ok || body?.success === false) {
        throw new Error(body?.message || `Search failed (${res.status})`);
      }
      setResponse(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-0 flex-1 items-stretch gap-4 overflow-y-auto p-4 pb-8 sm:px-6 sm:py-0 sm:pb-8 md:gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Search Explorer</CardTitle>
          <CardDescription>
            Read-only search calls through `/_search/{portfolio}/{org}`.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-xs text-muted-foreground">
              Enter a query and optional controls. This page uses option 1 contract:
              `filters.rings`, `filters.fields`, and optional `filters.boost_fields`.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-medium">Query</label>
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. tortilla"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !loading) runSearch();
                  }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Rings (comma-separated)</label>
                <Input
                  value={rings}
                  onChange={(e) => setRings(e.target.value)}
                  placeholder="e.g. productora_candidates,productora_project"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Fields (comma-separated)</label>
                <Input
                  value={fields}
                  onChange={(e) => setFields(e.target.value)}
                  placeholder="e.g. title,description"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Limit</label>
                <Input value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="20" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Offset</label>
                <Input value={offset} onChange={(e) => setOffset(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-medium">Extra filters (JSON object)</label>
                <Input
                  value={extraFiltersJson}
                  onChange={(e) => setExtraFiltersJson(e.target.value)}
                  placeholder='e.g. {"status":"active"}'
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-medium">Boost fields (JSON object, sent to filters.boost_fields)</label>
                <Input
                  value={boostFieldsJson}
                  onChange={(e) => setBoostFieldsJson(e.target.value)}
                  placeholder='e.g. {"title":2.0}'
                />
              </div>
              <div className="flex items-end md:col-span-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                  <input
                    type="checkbox"
                    checked={resolveMatches}
                    onChange={(e) => setResolveMatches(e.target.checked)}
                  />
                  Resolve matches in backend (attach `document` on each hit)
                </label>
              </div>
              <div className="flex items-end">
                <Button type="button" onClick={runSearch} disabled={loading} className="gap-1.5">
                  <Search className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                  Run Search
                </Button>
              </div>
            </div>
          </div>

          {lastUrl ? <p className="text-xs text-muted-foreground break-all">POST {lastUrl}</p> : null}
          {lastPayload ? (
            <div className="max-h-[22vh] overflow-auto rounded-md border bg-muted/20 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Payload</p>
              <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed">
                {JSON.stringify(lastPayload, null, 2)}
              </pre>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="max-h-[60vh] overflow-auto rounded-md border bg-muted/20 p-3">
            <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed">
              {response !== null ? JSON.stringify(response, null, 2) : "Run a search query to see results."}
            </pre>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
