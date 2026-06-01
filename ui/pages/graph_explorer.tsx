import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { parseBlueprintSourceSpec } from "@/lib/console_utils";
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

interface ToolOutput {
  response: unknown;
  error: string;
  lastUrl: string;
}

const emptyToolOutput = (): ToolOutput => ({
  response: null,
  error: "",
  lastUrl: "",
});

const toUpperSnake = (raw: string): string =>
  String(raw ?? "")
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();

function ToolResultPanel({
  output,
  loading,
  placeholder,
}: {
  output: ToolOutput;
  loading: boolean;
  placeholder: string;
}) {
  return (
    <div className="space-y-2 pt-2">
      {output.lastUrl ? (
        <p className="text-xs text-muted-foreground break-all">POST {output.lastUrl}</p>
      ) : null}
      {output.error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {output.error}
        </div>
      ) : null}
      <div className="max-h-[50vh] overflow-auto rounded-md border bg-muted/20 p-3">
        <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed">
          {loading
            ? "Running query..."
            : output.response !== null
              ? JSON.stringify(output.response, null, 2)
              : placeholder}
        </pre>
      </div>
    </div>
  );
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
  const [loadingKey, setLoadingKey] = useState<"" | "node" | "type" | "traverse">("");
  const [nodeOutput, setNodeOutput] = useState<ToolOutput>(emptyToolOutput);
  const [typeOutput, setTypeOutput] = useState<ToolOutput>(emptyToolOutput);
  const [traverseOutput, setTraverseOutput] = useState<ToolOutput>(emptyToolOutput);

  const fetchGraph = async (path: string, payload: Record<string, unknown>) => {
    const url = `${import.meta.env.VITE_API_URL}/_graph/${portfolio}/${org}/${path}`;
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
    return { url, body };
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

  const applyAliasesToGraphResponse = (
    graphResponse: any,
    _aliasMap: Record<string, EdgeAlias>,
  ) => {
    if (!graphResponse || typeof graphResponse !== "object") {
      return graphResponse;
    }
    const result = { ...graphResponse };

    if (Array.isArray(result.outgoing)) {
      result.outgoing = result.outgoing.map((edge: any) => ({
        ...edge,
        edge_label:
          typeof edge?.edge_label === "string" && edge.edge_label.trim()
            ? edge.edge_label.trim()
            : String(edge?.edge_type || ""),
      }));
    }

    if (Array.isArray(result.incoming)) {
      result.incoming = result.incoming.map((edge: any) => ({
        ...edge,
        edge_label:
          typeof edge?.edge_label === "string" && edge.edge_label.trim()
            ? edge.edge_label.trim()
            : String(edge?.edge_type || ""),
      }));
    }

    if (Array.isArray(result.items)) {
      result.items = result.items.map((edge: any) => ({
        ...edge,
        edge_label:
          typeof edge?.edge_label === "string" && edge.edge_label.trim()
            ? edge.edge_label.trim()
            : String(edge?.edge_type || ""),
      }));
    }

    if (Array.isArray(result.steps)) {
      result.steps = result.steps.map((step: any) => {
        const edge = step?.edge || {};
        const edgeType = String(edge?.edge_type || "");
        const edgeLabel =
          typeof edge?.edge_label === "string" && edge.edge_label.trim()
            ? edge.edge_label.trim()
            : edgeType;
        return {
          ...step,
          edge: {
            ...edge,
            edge_label: edgeLabel,
          },
        };
      });
    }

    return result;
  };

  const runNodeEdges = async () => {
    setLoadingKey("node");
    setNodeOutput((prev) => ({ ...prev, error: "", response: null }));
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

      const { url, body } = await fetchGraph("node-edges", {
        node_id: node,
        edge_types: inferred.map((item) => item.edgeType),
        limit: Number(nodeLimit) || 100,
      });
      setNodeOutput({
        lastUrl: url,
        error: "",
        response: applyAliasesToGraphResponse(body, aliasMap),
      });
    } catch (e) {
      setNodeOutput((prev) => ({
        ...prev,
        error: e instanceof Error ? e.message : "Unknown error",
      }));
    } finally {
      setLoadingKey("");
    }
  };

  const runEdgesByType = async () => {
    setLoadingKey("type");
    setTypeOutput((prev) => ({ ...prev, error: "", response: null }));
    try {
      const { url, body } = await fetchGraph("edges-by-type", {
        edge_type: typeEdgeType.trim(),
        limit: Number(typeLimit) || 100,
      });
      setTypeOutput({
        lastUrl: url,
        error: "",
        response: applyAliasesToGraphResponse(body, {}),
      });
    } catch (e) {
      setTypeOutput((prev) => ({
        ...prev,
        error: e instanceof Error ? e.message : "Unknown error",
      }));
    } finally {
      setLoadingKey("");
    }
  };

  const runTraverse = async () => {
    setLoadingKey("traverse");
    setTraverseOutput((prev) => ({ ...prev, error: "", response: null }));
    try {
      const ring = traverseRing.trim();
      const idx = traverseId.trim();
      if (!ring || !idx) {
        throw new Error("ring and id are required for traversal.");
      }

      const inferred = await inferEdgeDefinitionsFromBlueprint(ring);
      setInferredTraverseEdgeTypes(inferred);
      const aliasMap = buildAliasMap(inferred);
      const nodeId = `${ring}/${idx}`;

      const { url, body } = await fetchGraph("traverse", {
        node_id: nodeId,
        edge_types: inferred.map((item) => item.edgeType),
        dynamic_edge_types: true,
        direction: direction === "backward" ? "backward" : "forward",
        max_depth: Number(maxDepth) || 3,
      });
      setTraverseOutput({
        lastUrl: url,
        error: "",
        response: applyAliasesToGraphResponse(body, aliasMap),
      });
    } catch (e) {
      setTraverseOutput((prev) => ({
        ...prev,
        error: e instanceof Error ? e.message : "Unknown error",
      }));
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
    const idField =
      Array.isArray(blueprint?.indexes?.path) && blueprint.indexes.path.length > 0
        ? String(blueprint.indexes.path[0] ?? "_id").trim() || "_id"
        : "_id";
    const edgeMap = new Map<string, EdgeDefinition>();
    for (const field of blueprint?.fields || []) {
      if (!field || typeof field !== "object" || field.name === undefined || field.name === null) {
        continue;
      }
      const fieldName = String(field.name);
      const sourceSpec = parseBlueprintSourceSpec((field as Record<string, unknown>).source);
      if (sourceSpec) {
        const edgeType = `${fromBlueprint}:${fieldName}:${sourceSpec.target}:${sourceSpec.targetKey}`;
        const sourceLabels =
          field.source && typeof field.source === "object" && !Array.isArray(field.source)
            ? (field.source as Record<string, unknown>).label
            : undefined;
        const sourceAliases = Array.isArray(sourceLabels)
          ? [sourceLabels[0], sourceLabels[1]]
          : [];
        const aliases = Array.isArray(field.edges) && field.edges.length > 0 ? field.edges : sourceAliases;
        const current = edgeMap.get(edgeType) || { edgeType };
        if (!current.outgoingAlias && typeof aliases[0] === "string") {
          current.outgoingAlias = aliases[0];
        }
        if (!current.incomingAlias && typeof aliases[1] === "string") {
          current.incomingAlias = aliases[1];
        }
        edgeMap.set(edgeType, current);
      }

      const literalEnabledRaw = (field as Record<string, unknown>).literal_edge;
      const literalEnabled =
        literalEnabledRaw === true ||
        (typeof literalEnabledRaw === "string" &&
          ["1", "true", "yes", "y", "on"].includes(literalEnabledRaw.trim().toLowerCase()));
      if (literalEnabled) {
        const edgeType = `${fromBlueprint}:${idField}:_literal:${fieldName}`;
        const current = edgeMap.get(edgeType) || { edgeType };
        if (!current.outgoingAlias) {
          current.outgoingAlias = `HAS_${toUpperSnake(fieldName)}`;
        }
        edgeMap.set(edgeType, current);
      }
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
              <ToolResultPanel
                output={nodeOutput}
                loading={loadingKey === "node"}
                placeholder="Run Node Edges to see results."
              />
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
              <ToolResultPanel
                output={typeOutput}
                loading={loadingKey === "type"}
                placeholder="Run Edges By Type to see results."
              />
            </div>
          ) : null}

          {activeTab === "traverse" ? (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs text-muted-foreground">
                Traverse infers edge labels from blueprint fields with valid `source`.
                Forward and backward modes discover edges per hop (outgoing vs incoming) so depth is not limited to the start node blueprint.
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
              <ToolResultPanel
                output={traverseOutput}
                loading={loadingKey === "traverse"}
                placeholder="Run Traverse to see results."
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
