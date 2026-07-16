import type { RadialGraphLink, RadialGraphNode, RadialGraphNodeDetails } from "./radial-graph";

interface GraphEdgeRecord {
  edge_label?: string;
  edge_type?: string;
  from_node_id?: string;
  to_node_id?: string;
  projection?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  extras?: Record<string, unknown>;
  /** @deprecated */
  properties?: Record<string, unknown>;
  /** @deprecated */
  qualifiers?: Record<string, unknown>;
}

interface GraphNodeEdgesResponse {
  node_id?: string;
  incoming?: GraphEdgeRecord[];
  outgoing?: GraphEdgeRecord[];
  [key: string]: unknown;
}

interface RadialGraphModel {
  centerId: string;
  nodes: RadialGraphNode[];
  links: RadialGraphLink[];
}

function shortNodeId(nodeId: string): string {
  const value = String(nodeId || "").trim();
  if (!value) return "Unknown";
  const slashSplit = value.split("/");
  const tail = slashSplit[slashSplit.length - 1] || value;
  return tail.length > 12 ? `${tail.slice(0, 12)}...` : tail;
}

function toGraphNodeEdgesResponse(input: unknown): GraphNodeEdgesResponse {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return input as GraphNodeEdgesResponse;
}

function isLiteralNodeId(nodeId: string): boolean {
  const value = String(nodeId || "").trim();
  return value.startsWith("_literal/") || value.startsWith("_dangling/");
}

function getLiteralValueFromEdge(edge: GraphEdgeRecord): string | undefined {
  const extras = edge.extras && typeof edge.extras === "object" ? edge.extras : {};
  const legacy = edge.properties && typeof edge.properties === "object" ? edge.properties : {};
  const value = extras.value ?? legacy.value;
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value).trim();
}

function projectionEntriesForRole(
  projection: Record<string, unknown> | undefined,
  role: "from" | "to",
): Record<string, string> {
  const prefix = `${role}.`;
  const entries: Record<string, string> = {};
  if (!projection || typeof projection !== "object") return entries;
  for (const [key, rawValue] of Object.entries(projection).sort(([a], [b]) => a.localeCompare(b))) {
    if (!key.startsWith(prefix)) continue;
    if (key.endsWith("._caption")) continue;
    const text = formatDetailValue(rawValue);
    if (text) entries[key] = text;
  }
  return entries;
}

function attributeEntries(bag: Record<string, unknown> | undefined): Record<string, string> {
  const entries: Record<string, string> = {};
  if (!bag || typeof bag !== "object") return entries;
  for (const [key, rawValue] of Object.entries(bag).sort(([a], [b]) => a.localeCompare(b))) {
    const text = formatDetailValue(rawValue);
    if (text) entries[key] = text;
  }
  return entries;
}

function edgeAttributeBag(edge: GraphEdgeRecord): Record<string, unknown> {
  const attributes = edge.attributes && typeof edge.attributes === "object" ? edge.attributes : {};
  const extras = edge.extras && typeof edge.extras === "object" ? edge.extras : {};
  if (Object.keys(attributes).length || Object.keys(extras).length) {
    return { ...extras, ...attributes };
  }
  const legacy = edge.qualifiers && typeof edge.qualifiers === "object" ? edge.qualifiers : {};
  const legacyProps = edge.properties && typeof edge.properties === "object" ? edge.properties : {};
  return { ...legacyProps, ...legacy };
}

function mergeNodeDetails(
  existing: RadialGraphNodeDetails | undefined,
  incoming: RadialGraphNodeDetails,
): RadialGraphNodeDetails {
  return {
    projection: { ...(existing?.projection ?? {}), ...incoming.projection },
    attributes: { ...(existing?.attributes ?? {}), ...incoming.attributes },
    qualifiers: { ...(existing?.qualifiers ?? {}), ...(incoming.qualifiers ?? incoming.attributes) },
  };
}

function edgeDetailsForNode(edge: GraphEdgeRecord, role: "from" | "to"): RadialGraphNodeDetails {
  const bag = attributeEntries(edgeAttributeBag(edge));
  return {
    projection: projectionEntriesForRole(edge.projection, role),
    attributes: bag,
    qualifiers: bag,
  };
}

function relationshipClassFromEdge(edge: GraphEdgeRecord): string | undefined {
  const bag = edgeAttributeBag(edge);
  const text = formatDetailValue(bag["relationship_class"]);
  return text || undefined;
}

function upsertNode(
  nodeMap: Map<string, RadialGraphNode>,
  nodeId: string,
  patch: Partial<RadialGraphNode> & { details?: RadialGraphNodeDetails },
): void {
  const existing = nodeMap.get(nodeId);
  const mergedDetails = patch.details
    ? mergeNodeDetails(existing?.details, patch.details)
    : existing?.details;
  nodeMap.set(nodeId, {
    id: nodeId,
    label: patch.label ?? existing?.label ?? shortNodeId(nodeId),
    direction: patch.direction ?? existing?.direction ?? "both",
    incomingCount: patch.incomingCount ?? existing?.incomingCount ?? 0,
    outgoingCount: patch.outgoingCount ?? existing?.outgoingCount ?? 0,
    details: mergedDetails,
  });
}

function getProjectionRoleCaption(edge: GraphEdgeRecord, role: "from" | "to"): string | undefined {
  const projection = edge.projection && typeof edge.projection === "object" ? edge.projection : {};
  const captionKey = `${role}._caption`;
  const explicitCaption = projection[captionKey];
  if (explicitCaption !== undefined && explicitCaption !== null) {
    const text = String(explicitCaption).trim();
    if (text) return text;
  }

  const prefix = `${role}.`;
  const values: string[] = [];
  for (const [key, rawValue] of Object.entries(projection).sort(([a], [b]) => a.localeCompare(b))) {
    if (!key.startsWith(prefix)) continue;
    if (key.endsWith("._caption")) continue;
    if (rawValue === undefined || rawValue === null) continue;
    const text = String(rawValue).trim();
    if (text) values.push(text);
  }
  if (values.length === 0) return undefined;
  return values.join(" | ");
}

function getNeighborLabel(edge: GraphEdgeRecord, direction: "incoming" | "outgoing", fallbackNodeId: string): string {
  if (isLiteralNodeId(fallbackNodeId)) {
    const literalValue = getLiteralValueFromEdge(edge);
    if (literalValue) return literalValue;
  }
  const role = direction === "incoming" ? "from" : "to";
  const projectionCaption = getProjectionRoleCaption(edge, role);
  if (projectionCaption) return projectionCaption;
  return shortNodeId(fallbackNodeId);
}

function getNodeLabelFromProjection(
  edge: GraphEdgeRecord,
  nodeRole: "from" | "to",
  fallbackNodeId: string,
): string {
  if (isLiteralNodeId(fallbackNodeId)) {
    const literalValue = getLiteralValueFromEdge(edge);
    if (literalValue) return literalValue;
  }
  const projectionCaption = getProjectionRoleCaption(edge, nodeRole);
  if (projectionCaption) return projectionCaption;
  return shortNodeId(fallbackNodeId);
}

function resolveCenterNodeLabel(
  centerId: string,
  incomingEdges: GraphEdgeRecord[],
  outgoingEdges: GraphEdgeRecord[],
): string {
  if (isLiteralNodeId(centerId)) {
    for (const edge of [...outgoingEdges, ...incomingEdges]) {
      const literalValue = getLiteralValueFromEdge(edge);
      if (literalValue) return literalValue;
    }
  }
  for (const edge of outgoingEdges) {
    const fromId = String(edge?.from_node_id || "").trim();
    if (fromId !== centerId) continue;
    const caption = getProjectionRoleCaption(edge, "from");
    if (caption) return caption;
  }
  for (const edge of incomingEdges) {
    const toId = String(edge?.to_node_id || "").trim();
    if (toId !== centerId) continue;
    const caption = getProjectionRoleCaption(edge, "to");
    if (caption) return caption;
  }
  return shortNodeId(centerId);
}

export function buildNodeEdgesRadialGraphModel(
  graphResponse: unknown,
  fallbackCenterId: string,
): RadialGraphModel {
  const response = toGraphNodeEdgesResponse(graphResponse);
  const centerId = String(response.node_id || fallbackCenterId || "").trim() || fallbackCenterId;
  const incomingEdges = Array.isArray(response.incoming) ? response.incoming : [];
  const outgoingEdges = Array.isArray(response.outgoing) ? response.outgoing : [];
  const nodeMap = new Map<string, RadialGraphNode>();
  const links: RadialGraphLink[] = [];

  for (const edge of incomingEdges) {
    const sourceId = String(edge?.from_node_id || "").trim();
    const targetId = centerId;
    if (!sourceId) continue;
    const existing = nodeMap.get(sourceId);
    const label = getNeighborLabel(edge, "incoming", sourceId);
    upsertNode(nodeMap, sourceId, {
      label: existing?.label || label,
      direction: existing?.direction === "outgoing" || existing?.direction === "both" ? "both" : "incoming",
      incomingCount: (existing?.incomingCount || 0) + 1,
      outgoingCount: existing?.outgoingCount || 0,
      details: edgeDetailsForNode(edge, "from"),
    });
    upsertNode(nodeMap, centerId, {
      details: edgeDetailsForNode(edge, "to"),
    });
    links.push({
      id: `in-${sourceId}-${targetId}-${links.length}`,
      sourceId,
      targetId,
      label: String(edge?.edge_label || edge?.edge_type || "incoming"),
      edgeLabel: typeof edge?.edge_label === "string" && edge.edge_label.trim() ? edge.edge_label.trim() : undefined,
      direction: "incoming",
      relationshipClass: relationshipClassFromEdge(edge),
    });
  }

  for (const edge of outgoingEdges) {
    const sourceId = centerId;
    const targetId = String(edge?.to_node_id || "").trim();
    if (!targetId) continue;
    const existing = nodeMap.get(targetId);
    const label = getNeighborLabel(edge, "outgoing", targetId);
    upsertNode(nodeMap, targetId, {
      label: existing?.label || label,
      direction: existing?.direction === "incoming" || existing?.direction === "both" ? "both" : "outgoing",
      incomingCount: existing?.incomingCount || 0,
      outgoingCount: (existing?.outgoingCount || 0) + 1,
      details: edgeDetailsForNode(edge, "to"),
    });
    upsertNode(nodeMap, centerId, {
      details: edgeDetailsForNode(edge, "from"),
    });
    links.push({
      id: `out-${sourceId}-${targetId}-${links.length}`,
      sourceId,
      targetId,
      label: String(edge?.edge_label || edge?.edge_type || "outgoing"),
      edgeLabel: typeof edge?.edge_label === "string" && edge.edge_label.trim() ? edge.edge_label.trim() : undefined,
      direction: "outgoing",
      relationshipClass: relationshipClassFromEdge(edge),
    });
  }

  const centerLabel = resolveCenterNodeLabel(centerId, incomingEdges, outgoingEdges);
  upsertNode(nodeMap, centerId, {
    label: centerLabel,
    direction: "both",
    incomingCount: incomingEdges.length,
    outgoingCount: outgoingEdges.length,
  });

  return {
    centerId,
    nodes: Array.from(nodeMap.values()),
    links,
  };
}

export function buildTraverseRadialGraphModel(
  graphResponse: unknown,
  fallbackCenterId: string,
): RadialGraphModel {
  if (!graphResponse || typeof graphResponse !== "object" || Array.isArray(graphResponse)) {
    return { centerId: fallbackCenterId, nodes: [], links: [] };
  }
  const response = graphResponse as Record<string, unknown>;
  const centerId = String(response.start_node_id || fallbackCenterId || "").trim() || fallbackCenterId;
  const traversalDirection = String(response.direction || "forward").trim().toLowerCase() === "backward"
    ? "backward"
    : "forward";
  const steps = Array.isArray(response.steps) ? response.steps : [];
  const nodeMap = new Map<string, RadialGraphNode>();
  const links: RadialGraphLink[] = [];
  const seenLinks = new Set<string>();

  for (const step of steps) {
    const stepObj = step && typeof step === "object" ? (step as Record<string, unknown>) : {};
    const edgeObj = stepObj.edge && typeof stepObj.edge === "object"
      ? (stepObj.edge as Record<string, unknown>)
      : {};
    const edge = edgeObj as GraphEdgeRecord;
    const stepDepthRaw = Number(stepObj.depth);
    const hop = Number.isFinite(stepDepthRaw) ? Math.max(1, Math.trunc(stepDepthRaw)) : 1;
    const fromId = String(edge?.from_node_id || "").trim();
    const toId = String(edge?.to_node_id || "").trim();
    if (!fromId || !toId) continue;

    const fromExisting = nodeMap.get(fromId);
    const toExisting = nodeMap.get(toId);

    upsertNode(nodeMap, fromId, {
      label: fromExisting?.label || getNodeLabelFromProjection(edge, "from", fromId),
      direction:
        (fromExisting?.incomingCount || 0) > 0 || (fromExisting?.outgoingCount || 0) + 1 > 0
          ? ((fromExisting?.incomingCount || 0) > 0 ? "both" : "outgoing")
          : "outgoing",
      incomingCount: fromExisting?.incomingCount || 0,
      outgoingCount: (fromExisting?.outgoingCount || 0) + 1,
      details: edgeDetailsForNode(edge, "from"),
    });

    upsertNode(nodeMap, toId, {
      label: toExisting?.label || getNodeLabelFromProjection(edge, "to", toId),
      direction:
        (toExisting?.outgoingCount || 0) > 0 || (toExisting?.incomingCount || 0) + 1 > 0
          ? ((toExisting?.outgoingCount || 0) > 0 ? "both" : "incoming")
          : "incoming",
      incomingCount: (toExisting?.incomingCount || 0) + 1,
      outgoingCount: toExisting?.outgoingCount || 0,
      details: edgeDetailsForNode(edge, "to"),
    });

    const edgeType = String(edge?.edge_type || "");
    const edgeLabel = String(edge?.edge_label || edgeType || "edge");
    const dedupeKey = `${fromId}::${toId}::${edgeType}::${edgeLabel}`;
    if (seenLinks.has(dedupeKey)) continue;
    seenLinks.add(dedupeKey);

    // Stored edges are canonical from -> to. Backward traversal walks to the
    // predecessor (from_node_id), so reverse endpoints to match the backward
    // label and the direction the walk actually took.
    const visualSourceId = traversalDirection === "backward" ? toId : fromId;
    const visualTargetId = traversalDirection === "backward" ? fromId : toId;

    links.push({
      id: `step-${links.length}-${visualSourceId}-${visualTargetId}`,
      sourceId: visualSourceId,
      targetId: visualTargetId,
      label: edgeLabel,
      edgeLabel: edgeLabel,
      direction: "outgoing",
      hop,
      relationshipClass: relationshipClassFromEdge(edge),
    });
  }

  const traverseEdges = steps
    .map((step) => {
      const stepObj = step && typeof step === "object" ? (step as Record<string, unknown>) : {};
      const edgeObj = stepObj.edge && typeof stepObj.edge === "object"
        ? (stepObj.edge as Record<string, unknown>)
        : {};
      return edgeObj as GraphEdgeRecord;
    })
    .filter((edge) => String(edge?.from_node_id || "").trim() && String(edge?.to_node_id || "").trim());

  const incomingEdges = traverseEdges.filter((edge) => String(edge?.to_node_id || "").trim() === centerId);
  const outgoingEdges = traverseEdges.filter((edge) => String(edge?.from_node_id || "").trim() === centerId);
  const centerLabel = resolveCenterNodeLabel(centerId, incomingEdges, outgoingEdges);

  upsertNode(nodeMap, centerId, {
    label: centerLabel,
    direction: "both",
    incomingCount: incomingEdges.length,
    outgoingCount: outgoingEdges.length,
  });

  const nodes = Array.from(nodeMap.values()).map((node) => {
    if (node.id === centerId) {
      return node;
    }
    if (traversalDirection === "backward") {
      return { ...node, direction: "incoming" as const };
    }
    if (traversalDirection === "forward") {
      return { ...node, direction: "outgoing" as const };
    }
    if (node.incomingCount > 0 && node.outgoingCount > 0) {
      return { ...node, direction: "both" as const };
    }
    if (node.incomingCount > 0) {
      return { ...node, direction: "incoming" as const };
    }
    return { ...node, direction: "outgoing" as const };
  });

  return {
    centerId,
    nodes,
    links,
  };
}
