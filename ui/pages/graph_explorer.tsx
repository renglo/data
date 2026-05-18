import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { 
  Search, 
  Tag,
  CableCar,
  Workflow
 } from "lucide-react";

interface GraphExplorerProps {
  portfolio: string;
  org: string;
}

interface EdgeAlias {
  outgoing?: string;
  incoming?: string;
}

interface EdgeDefinition {
  edgeType: string;
  outgoingAlias?: string;
  incomingAlias?: string;
}

export default function GraphExplorer({ portfolio, org }: GraphExplorerProps) {
  const [activeTab, setActiveTab] = useState<"node" | "type" | "traverse">("node");
  const [nodeRing, setNodeRing] = useState("");
  const [nodeDocId, setNodeDocId] = useState("");
  const [nodeLimit, setNodeLimit] = useState("100");
  const [inferredNodeEdgeTypes, setInferredNodeEdgeTypes] = useState<EdgeDefinition[]>([]);

  const [typeEdgeType, setTypeEdgeType] = useState("");
  const [typeLimit, setTypeLimit] = useState("100");

  const [traverseRing, setTraverseRing] = useState("");
  const [traverseId, setTraverseId] = useState("");
  const [direction, setDirection] = useState("forward");
  const [maxDepth, setMaxDepth] = useState("3");
  const [inferredTraverseEdgeTypes, setInferredTraverseEdgeTypes] = useState<EdgeDefinition[]>([]);
  const [edgeAliasMap, setEdgeAliasMap] = useState<Record<string, EdgeAlias>>({});

  const [loadingKey, setLoadingKey] = useState<"" | "node" | "type" | "traverse">("");
  const [response, setResponse] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [lastUrl, setLastUrl] = useState("");

  const parseEdgeTypes = (raw: string) =>
    raw
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

  const callGraph = async (path: string, payload: Record<string, unknown>) => {
    const url = `${import.meta.env.VITE_API_URL}/_graph/${portfolio}/${org}/${path}`;
    setLastUrl(url);
    setError("");
    setResponse(null);
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
    if (!res.ok) {
      throw new Error(body?.message || `Request failed (${res.status})`);
    }
    return body;
  };

  const buildAliasMap = (definitions: EdgeDefinition[]) => {
    const nextMap: Record<string, EdgeAlias> = {};
    for (const definition of definitions) {
      nextMap[definition.edgeType] = {
        outgoing: definition.outgoingAlias,
        incoming: definition.incomingAlias,
      };
    }
    return nextMap;
  };

  const resolveAlias = (
    edgeType: string,
    aliasMap: Record<string, EdgeAlias>,
    perspective: "outgoing" | "incoming",
  ) => {
    const aliases = aliasMap[edgeType];
    if (!aliases) return edgeType;
    if (perspective === "outgoing") {
      return aliases.outgoing || edgeType;
    }
    return aliases.incoming || edgeType;
  };

  const applyAliasesToGraphResponse = (
    graphResponse: any,
    aliasMap: Record<string, EdgeAlias>,
  ) => {
    if (!graphResponse || typeof graphResponse !== "object") {
      return graphResponse;
    }
    const result = { ...graphResponse };

    if (Array.isArray(result.outgoing)) {
      result.outgoing = result.outgoing.map((edge: any) => ({
        ...edge,
        edge_label: resolveAlias(String(edge?.edge_type || ""), aliasMap, "outgoing"),
      }));
    }

    if (Array.isArray(result.incoming)) {
      result.incoming = result.incoming.map((edge: any) => ({
        ...edge,
        edge_label: resolveAlias(String(edge?.edge_type || ""), aliasMap, "incoming"),
      }));
    }

    if (Array.isArray(result.items)) {
      result.items = result.items.map((edge: any) => ({
        ...edge,
        edge_label_outgoing: resolveAlias(String(edge?.edge_type || ""), aliasMap, "outgoing"),
        edge_label_incoming: resolveAlias(String(edge?.edge_type || ""), aliasMap, "incoming"),
      }));
    }

    if (Array.isArray(result.steps)) {
      const perspective = result.direction === "backward" ? "incoming" : "outgoing";
      result.steps = result.steps.map((step: any) => {
        const edgeType = String(step?.edge?.edge_type || "");
        return {
          ...step,
          edge: {
            ...step?.edge,
            edge_label: resolveAlias(edgeType, aliasMap, perspective),
          },
        };
      });
    }

    return result;
  };

  const runNodeEdges = async () => {
    setLoadingKey("node");
    try {
      const ring = nodeRing.trim();
      const idx = nodeDocId.trim();
      if (!ring || !idx) {
        throw new Error("ring and id are required.");
      }
      const node = `${ring}/${idx}`;
      const inferred = await inferEdgeDefinitionsFromBlueprint(ring);
      setInferredNodeEdgeTypes(inferred);
      const aliasMap = buildAliasMap(inferred);
      setEdgeAliasMap(aliasMap);

      const body = await callGraph("node-edges", {
        node_id: node,
        edge_types: inferred.map((item) => item.edgeType),
        limit: Number(nodeLimit) || 100,
      });
      setResponse(applyAliasesToGraphResponse(body, aliasMap));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingKey("");
    }
  };

  const runEdgesByType = async () => {
    setLoadingKey("type");
    try {
      const body = await callGraph("edges-by-type", {
        edge_type: typeEdgeType.trim(),
        limit: Number(typeLimit) || 100,
      });
      setResponse(applyAliasesToGraphResponse(body, edgeAliasMap));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingKey("");
    }
  };

  const runTraverse = async () => {
    setLoadingKey("traverse");
    try {
      const ring = traverseRing.trim();
      const idx = traverseId.trim();
      if (!ring || !idx) {
        throw new Error("ring and id are required for traversal.");
      }

      const inferred = await inferEdgeDefinitionsFromBlueprint(ring);
      setInferredTraverseEdgeTypes(inferred);
      if (inferred.length === 0) {
        throw new Error(`No valid source relationships found in blueprint for ring '${ring}'.`);
      }
      const aliasMap = buildAliasMap(inferred);
      setEdgeAliasMap(aliasMap);

      const body = await callGraph("traverse", {
        node_id: `${ring}/${idx}`,
        edge_types: inferred.map((item) => item.edgeType),
        dynamic_edge_types: true,
        direction: direction === "backward" ? "backward" : "forward",
        max_depth: Number(maxDepth) || 3,
      });
      setResponse(applyAliasesToGraphResponse(body, aliasMap));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingKey("");
    }
  };

  const inferEdgeDefinitionsFromBlueprint = async (ring: string): Promise<EdgeDefinition[]> => {
    const blueprintUrl = `${import.meta.env.VITE_API_URL}/_blueprint/irma/${ring}?v=last`;
    const blueprintRes = await fetch(blueprintUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${sessionStorage.accessToken}`,
      },
    });
    const blueprintText = await blueprintRes.text();
    const blueprint = blueprintText ? JSON.parse(blueprintText) : {};
    if (!blueprintRes.ok) {
      throw new Error(blueprint?.message || `Could not load blueprint for ring '${ring}'`);
    }
    if (blueprint?.enable_graph === false) {
      return [];
    }

    const fromBlueprint = typeof blueprint?.name === "string" ? blueprint.name : ring;
    const edgeMap = new Map<string, EdgeDefinition>();
    for (const field of blueprint?.fields || []) {
      if (!field || typeof field !== "object" || typeof field.source !== "string" || field.name === undefined || field.name === null) {
        continue;
      }
      const sourceParts = field.source.split(":");
      if (sourceParts.length !== 3 || sourceParts[1] !== "_id") {
        continue;
      }
      const edgeType = `${fromBlueprint}:${String(field.name)}:${sourceParts[0]}:${sourceParts[1]}`;
      const aliases = Array.isArray(field.edges) ? field.edges : [];
      const current = edgeMap.get(edgeType) || { edgeType };
      if (!current.outgoingAlias && typeof aliases[0] === "string") {
        current.outgoingAlias = aliases[0];
      }
      if (!current.incomingAlias && typeof aliases[1] === "string") {
        current.incomingAlias = aliases[1];
      }
      edgeMap.set(edgeType, current);
    }
    return Array.from(edgeMap.values());
  };

  return (
    <main className="grid flex-1 items-stretch gap-4 p-4 sm:px-6 sm:py-0 md:gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Graph Explorer</CardTitle>
          <CardDescription>
            Read-only graph queries through `/_graph/{portfolio}/{org}`.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setActiveTab("node")}
              className={`justify-start gap-2 border ${activeTab === "node" ? "bg-muted" : "bg-transparent"}`}
            >
              <Workflow className="h-4 w-4" />
              Node Edges
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setActiveTab("type")}
              className={`justify-start gap-2 border ${activeTab === "type" ? "bg-muted" : "bg-transparent"}`}
            >
              <Tag className="h-4 w-4" />
              Edges By Type
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setActiveTab("traverse")}
              className={`justify-start gap-2 border ${activeTab === "traverse" ? "bg-muted" : "bg-transparent"}`}
            >
              <CableCar className="h-4 w-4" />
              Traverse
            </Button>
          </div>

          {activeTab === "node" ? (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs text-muted-foreground">
                Uses `ring` to load blueprint and automatically infers edge types from fields with valid
                `source` (`&lt;blueprint_from&gt;:&lt;field_from&gt;:&lt;blueprint_to&gt;:&lt;field_to&gt;`).
              </p>
              <p className="text-xs text-muted-foreground">
                Example: `ring=noma_travel_preferences`, `id=123e4567`, `limit=50`.
              </p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Ring</label>
                  <Input value={nodeRing} onChange={(e) => setNodeRing(e.target.value)} placeholder="e.g. noma_travel_preferences" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">ID</label>
                  <Input value={nodeDocId} onChange={(e) => setNodeDocId(e.target.value)} placeholder="e.g. 123e4567" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Limit</label>
                  <select
                    value={nodeLimit}
                    onChange={(e) => setNodeLimit(e.target.value)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="75">75</option>
                    <option value="100">100</option>
                  </select>
                </div>
                <div className="flex items-end">
                <Button type="button" variant="default" size="sm" onClick={runNodeEdges} disabled={loadingKey !== ""} className="gap-1.5">
                  <Search className={`h-3.5 w-3.5 ${loadingKey === "node" ? "animate-spin" : ""}`} />
                  Run Node Edges
                </Button>
                </div>
              </div>
              <div className="rounded-md border bg-muted/20 p-2 text-xs">
                <span className="font-medium">Inferred edge types:</span>{" "}
                {inferredNodeEdgeTypes.length > 0
                  ? inferredNodeEdgeTypes
                      .map((item) =>
                        item.outgoingAlias || item.incomingAlias
                          ? `${item.edgeType} (${item.outgoingAlias || item.edgeType} / ${item.incomingAlias || item.edgeType})`
                          : item.edgeType,
                      )
                      .join(", ")
                  : "none loaded yet"}
              </div>
            </div>
          ) : null}

          {activeTab === "type" ? (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs text-muted-foreground">
                <strong>`edge_type`</strong>: one edge type to query (required). <strong>`limit`</strong>: page size.
              </p>
              <p className="text-xs text-muted-foreground">
                Example: `edge_type=FOR_USER`, `limit=100`.
              </p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Edge Type</label>
                  <Input
                    value={typeEdgeType}
                    onChange={(e) => setTypeEdgeType(e.target.value)}
                    placeholder="e.g. FOR_USER"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Limit</label>
                  <select
                    value={typeLimit}
                    onChange={(e) => setTypeLimit(e.target.value)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="75">75</option>
                    <option value="100">100</option>
                  </select>
                </div>
                <div />
                <div className="flex items-end">
                <Button type="button" variant="default" size="sm" onClick={runEdgesByType} disabled={loadingKey !== ""} className="gap-1.5">
                  <Search className={`h-3.5 w-3.5 ${loadingKey === "type" ? "animate-spin" : ""}`} />
                  Run Edges By Type
                </Button>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "traverse" ? (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs text-muted-foreground">
                Traverse infers `edge_types` from blueprint fields with valid `source`.
                You only provide start node coordinates and traversal controls.
              </p>
              <p className="text-xs text-muted-foreground">
                Example: `ring=noma_travel_preferences`, `id=123e4567`, `direction=forward`, `max_depth=2`.
              </p>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Ring</label>
                  <Input
                    value={traverseRing}
                    onChange={(e) => setTraverseRing(e.target.value)}
                    placeholder="e.g. noma_travel_preferences"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium">ID</label>
                  <Input value={traverseId} onChange={(e) => setTraverseId(e.target.value)} placeholder="e.g. 123e4567" />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium">Direction</label>
                  <select
                    value={direction}
                    onChange={(e) => setDirection(e.target.value)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="forward">forward</option>
                    <option value="backward">backward</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium">Max Depth</label>
                  <select
                    value={maxDepth}
                    onChange={(e) => setMaxDepth(e.target.value)}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={String(n)}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Button type="button" variant="default" size="sm" onClick={runTraverse} disabled={loadingKey !== ""} className="mt-6 gap-1.5">
                    <Search className={`h-3.5 w-3.5 ${loadingKey === "traverse" ? "animate-spin" : ""}`} />
                    Run Traverse
                  </Button>
                </div>
              </div>

              <div className="rounded-md border bg-muted/20 p-2 text-xs">
                <span className="font-medium">Inferred edge types:</span>{" "}
                {inferredTraverseEdgeTypes.length > 0
                  ? inferredTraverseEdgeTypes
                      .map((item) =>
                        item.outgoingAlias || item.incomingAlias
                          ? `${item.edgeType} (${item.outgoingAlias || item.edgeType} / ${item.incomingAlias || item.edgeType})`
                          : item.edgeType,
                      )
                      .join(", ")
                  : "none loaded yet"}
              </div>
            </div>
          ) : null}

          {lastUrl ? <p className="text-xs text-muted-foreground break-all">POST {lastUrl}</p> : null}
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="max-h-[60vh] overflow-auto rounded-md border bg-muted/20 p-3">
            <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed">
              {response !== null ? JSON.stringify(response, null, 2) : "Run a graph query to see results."}
            </pre>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
