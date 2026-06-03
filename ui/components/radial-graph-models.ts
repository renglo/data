import type { RadialGraphLink, RadialGraphNode } from "./radial-graph";

interface GraphEdgeRecord {
  edge_label?: string;
  edge_type?: string;
  from_node_id?: string;
  to_node_id?: string;
  projection?: Record<string, unknown>;
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

function getNeighborLabel(edge: GraphEdgeRecord, direction: "incoming" | "outgoing", fallbackNodeId: string): string {
  const projection = edge.projection && typeof edge.projection === "object" ? edge.projection : {};
  const fromName = projection["from.name"];
  const toName = projection["to.name"];
  const preferred = direction === "incoming" ? fromName : toName;
  if (typeof preferred === "string" && preferred.trim()) {
    return preferred.trim();
  }
  const secondary = direction === "incoming" ? toName : fromName;
  if (typeof secondary === "string" && secondary.trim()) {
    return secondary.trim();
  }
  return shortNodeId(fallbackNodeId);
}

function getNodeLabelFromProjection(
  edge: GraphEdgeRecord,
  nodeRole: "from" | "to",
  fallbackNodeId: string,
): string {
  const projection = edge.projection && typeof edge.projection === "object" ? edge.projection : {};
  const nameKey = nodeRole === "from" ? "from.name" : "to.name";
  const altKey = nodeRole === "from" ? "to.name" : "from.name";
  const primary = projection[nameKey];
  if (typeof primary === "string" && primary.trim()) {
    return primary.trim();
  }
  const secondary = projection[altKey];
  if (typeof secondary === "string" && secondary.trim()) {
    return secondary.trim();
  }
  return shortNodeId(fallbackNodeId);
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
    nodeMap.set(sourceId, {
      id: sourceId,
      label: existing?.label || label,
      direction: existing?.direction === "outgoing" || existing?.direction === "both" ? "both" : "incoming",
      incomingCount: (existing?.incomingCount || 0) + 1,
      outgoingCount: existing?.outgoingCount || 0,
    });
    links.push({
      id: `in-${sourceId}-${targetId}-${links.length}`,
      sourceId,
      targetId,
      label: String(edge?.edge_label || edge?.edge_type || "incoming"),
      edgeLabel: typeof edge?.edge_label === "string" && edge.edge_label.trim() ? edge.edge_label.trim() : undefined,
      direction: "incoming",
    });
  }

  for (const edge of outgoingEdges) {
    const sourceId = centerId;
    const targetId = String(edge?.to_node_id || "").trim();
    if (!targetId) continue;
    const existing = nodeMap.get(targetId);
    const label = getNeighborLabel(edge, "outgoing", targetId);
    nodeMap.set(targetId, {
      id: targetId,
      label: existing?.label || label,
      direction: existing?.direction === "incoming" || existing?.direction === "both" ? "both" : "outgoing",
      incomingCount: existing?.incomingCount || 0,
      outgoingCount: (existing?.outgoingCount || 0) + 1,
    });
    links.push({
      id: `out-${sourceId}-${targetId}-${links.length}`,
      sourceId,
      targetId,
      label: String(edge?.edge_label || edge?.edge_type || "outgoing"),
      edgeLabel: typeof edge?.edge_label === "string" && edge.edge_label.trim() ? edge.edge_label.trim() : undefined,
      direction: "outgoing",
    });
  }

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

    nodeMap.set(fromId, {
      id: fromId,
      label: fromExisting?.label || getNodeLabelFromProjection(edge, "from", fromId),
      direction:
        (fromExisting?.incomingCount || 0) > 0 || (fromExisting?.outgoingCount || 0) + 1 > 0
          ? ((fromExisting?.incomingCount || 0) > 0 ? "both" : "outgoing")
          : "outgoing",
      incomingCount: fromExisting?.incomingCount || 0,
      outgoingCount: (fromExisting?.outgoingCount || 0) + 1,
    });

    nodeMap.set(toId, {
      id: toId,
      label: toExisting?.label || getNodeLabelFromProjection(edge, "to", toId),
      direction:
        (toExisting?.outgoingCount || 0) > 0 || (toExisting?.incomingCount || 0) + 1 > 0
          ? ((toExisting?.outgoingCount || 0) > 0 ? "both" : "incoming")
          : "incoming",
      incomingCount: (toExisting?.incomingCount || 0) + 1,
      outgoingCount: toExisting?.outgoingCount || 0,
    });

    const edgeType = String(edge?.edge_type || "");
    const edgeLabel = String(edge?.edge_label || edgeType || "edge");
    const dedupeKey = `${fromId}::${toId}::${edgeType}::${edgeLabel}`;
    if (seenLinks.has(dedupeKey)) continue;
    seenLinks.add(dedupeKey);

    links.push({
      id: `step-${links.length}-${fromId}-${toId}`,
      sourceId: fromId,
      targetId: toId,
      label: edgeLabel,
      edgeLabel: edgeLabel,
      direction: traversalDirection === "backward" ? "incoming" : "outgoing",
      hop,
    });
  }

  const nodes = Array.from(nodeMap.values()).map((node) => {
    if (node.id === centerId) return node;
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
  }).filter((node) => node.id !== centerId);

  return {
    centerId,
    nodes,
    links,
  };
}
