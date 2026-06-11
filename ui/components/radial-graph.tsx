import React, { useEffect, useId, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";

export type RadialDirection = "incoming" | "outgoing" | "both";

export interface RadialGraphNodeDetails {
  projection: Record<string, string>;
  qualifiers: Record<string, string>;
}

export interface RadialGraphNode {
  id: string;
  label: string;
  direction: RadialDirection;
  incomingCount: number;
  outgoingCount: number;
  details?: RadialGraphNodeDetails;
}

export interface RadialGraphLink {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  edgeLabel?: string;
  direction: "incoming" | "outgoing";
  hop?: number;
}

export interface RadialLegendItem {
  label: string;
  color: string;
}

interface RadialLayoutNode extends RadialGraphNode {
  x: number;
  y: number;
}

interface SelectedRadialNodeInfo {
  id: string;
  label: string;
  incomingCount: number;
  outgoingCount: number;
  details?: RadialGraphNodeDetails;
  x: number;
  y: number;
}

function truncateDetailText(text: string, maxLength = 56): string {
  const value = String(text ?? "").trim();
  if (!value) return "—";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function detailRows(record: Record<string, string> | undefined): [string, string][] {
  if (!record) return [];
  return Object.entries(record)
    .filter(([, value]) => String(value ?? "").trim().length > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => [key, truncateDetailText(value)]);
}

function NodeDetailTooltip({
  node,
  x,
  y,
  canvasWidth,
  canvasHeight,
}: {
  node: SelectedRadialNodeInfo;
  x: number;
  y: number;
  canvasWidth: number;
  canvasHeight: number;
}) {
  const tooltipWidth = 320;
  const projectionRows = detailRows(node.details?.projection);
  const qualifierRows = detailRows(node.details?.qualifiers);
  const sectionCount = (projectionRows.length > 0 ? 1 : 0) + (qualifierRows.length > 0 ? 1 : 0);
  const rowCount = projectionRows.length + qualifierRows.length;
  const tooltipHeight = Math.min(
    280,
    92 + sectionCount * 18 + rowCount * 22,
  );
  const rawX = x + 18;
  const rawY = y - tooltipHeight - 16;
  const tooltipX = Math.max(10, Math.min(rawX, canvasWidth - tooltipWidth - 10));
  const tooltipY = Math.max(10, Math.min(rawY, canvasHeight - tooltipHeight - 10));

  return (
    <foreignObject
      x={tooltipX}
      y={tooltipY}
      width={tooltipWidth}
      height={tooltipHeight}
      className="overflow-visible"
    >
      <div
        xmlns="http://www.w3.org/1999/xhtml"
        className="max-h-full overflow-y-auto rounded-lg border border-slate-600 bg-slate-900/95 p-3 text-xs text-slate-100 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="font-semibold text-[13px] text-white">{truncateDetailText(node.label, 40)}</div>
        <div className="mt-1 break-all text-[10px] text-slate-300">{truncateDetailText(node.id, 72)}</div>
        <div className="mt-1 text-[10px] text-slate-400">
          {`${node.incomingCount} incoming / ${node.outgoingCount} outgoing`}
        </div>

        {projectionRows.length > 0 ? (
          <div className="mt-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Projection
            </div>
            <table className="w-full table-fixed border-collapse text-[10px]">
              <tbody>
                {projectionRows.map(([key, value]) => (
                  <tr key={`proj-${key}`} className="border-t border-slate-700/80">
                    <td className="w-[42%] break-all py-1 pr-2 align-top font-medium text-slate-300">
                      {truncateDetailText(key, 30)}
                    </td>
                    <td className="break-all py-1 align-top text-slate-100">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {qualifierRows.length > 0 ? (
          <div className="mt-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Qualifiers
            </div>
            <table className="w-full table-fixed border-collapse text-[10px]">
              <tbody>
                {qualifierRows.map(([key, value]) => (
                  <tr key={`qual-${key}`} className="border-t border-slate-700/80">
                    <td className="w-[42%] break-all py-1 pr-2 align-top font-medium text-slate-300">
                      {truncateDetailText(key, 30)}
                    </td>
                    <td className="break-all py-1 align-top text-slate-100">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {projectionRows.length === 0 && qualifierRows.length === 0 ? (
          <div className="mt-3 text-[10px] text-slate-400">No projection or qualifier metadata for this node.</div>
        ) : null}
      </div>
    </foreignObject>
  );
}

interface RadialGraphProps {
  nodes: RadialGraphNode[];
  links: RadialGraphLink[];
  currentNodeId: string;
  ariaLabel: string;
  edgeColorMode?: "direction" | "hop";
  hopColors?: string[];
  legendItems?: RadialLegendItem[];
  pillOpacity?: number;
  labelAlong?: number;
}

const DEFAULT_HOP_COLORS = [
  "#b91c1c",
  "#f59e0b",
  "#fde047",
  "#22c55e",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
];

function shortNodeId(nodeId: string): string {
  const value = String(nodeId || "").trim();
  if (!value) return "Unknown";
  const slashSplit = value.split("/");
  const tail = slashSplit[slashSplit.length - 1] || value;
  return tail.length > 12 ? `${tail.slice(0, 12)}...` : tail;
}

function getBlueprintNameFromNodeId(nodeId: string): string {
  const value = String(nodeId || "").trim();
  if (!value) return "unknown";
  const [blueprintName] = value.split("/");
  return blueprintName && blueprintName.trim() ? blueprintName.trim() : "unknown";
}

function isLiteralNodeId(nodeId: string): boolean {
  const value = String(nodeId || "").trim();
  return value.startsWith("_literal/");
}

function isDanglingNodeId(nodeId: string): boolean {
  return String(nodeId || "").trim().startsWith("_dangling/");
}

function isLiteralLink(link: RadialGraphLink): boolean {
  return isLiteralNodeId(link.sourceId) || isLiteralNodeId(link.targetId);
}

function isDanglingLink(link: RadialGraphLink): boolean {
  return isDanglingNodeId(link.sourceId) || isDanglingNodeId(link.targetId);
}

function clampLabel(raw: string, maxLength = 22): string {
  const value = String(raw || "").trim();
  if (!value) return "Unnamed";
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function fitCircleLabel(raw: string, maxLength = 8): string {
  const value = String(raw || "").trim();
  if (!value) return "N/A";
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - 3)}...`;
}

function layoutRadialNodes(nodes: RadialGraphNode[], width: number, height: number): RadialLayoutNode[] {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 70;
  if (nodes.length === 0) return [];
  return nodes.map((node, index) => {
    const angle = (-Math.PI / 2) + (2 * Math.PI * index) / nodes.length;
    return {
      ...node,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });
}

function getHopColor(hop: number, palette: string[]): string {
  const normalized = Number.isFinite(hop) ? Math.max(1, Math.trunc(hop)) : 1;
  return palette[(normalized - 1) % palette.length];
}

export default function RadialGraph({
  nodes,
  links,
  currentNodeId,
  ariaLabel,
  edgeColorMode = "direction",
  hopColors = DEFAULT_HOP_COLORS,
  legendItems,
  pillOpacity = 0.9,
  labelAlong = 0.72,
}: RadialGraphProps) {
  const graphCanvasWidth = 980;
  const graphCanvasHeight = 560;
  const markerIdPrefix = useId().replace(/:/g, "");
  const [selectedRadialNodeId, setSelectedRadialNodeId] = useState<string | null>(null);
  const [copiedNodeId, setCopiedNodeId] = useState<string | null>(null);
  const [showLiteralEdges, setShowLiteralEdges] = useState(false);
  const [showDanglingEdges, setShowDanglingEdges] = useState(true);

  const copyNodeId = async (nodeId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(nodeId);
      setCopiedNodeId(nodeId);
      window.setTimeout(() => {
        setCopiedNodeId((current) => (current === nodeId ? null : current));
      }, 1500);
    } catch {
      // Clipboard access can fail outside secure contexts.
    }
  };

  const visibleLinks = useMemo(
    () =>
      links.filter((link) => {
        if (!showDanglingEdges && isDanglingLink(link)) return false;
        if (!showLiteralEdges && isLiteralLink(link)) return false;
        return true;
      }),
    [links, showDanglingEdges, showLiteralEdges],
  );

  const centerIncomingCount = useMemo(
    () => visibleLinks.filter((link) => link.targetId === currentNodeId).length,
    [visibleLinks, currentNodeId],
  );

  const centerOutgoingCount = useMemo(
    () => visibleLinks.filter((link) => link.sourceId === currentNodeId).length,
    [visibleLinks, currentNodeId],
  );

  const displayNodes = useMemo<RadialGraphNode[]>(() => {
    const nodeMap = new Map<string, RadialGraphNode>();
    for (const node of nodes) {
      nodeMap.set(node.id, node);
    }
    if (!nodeMap.has(currentNodeId)) {
      nodeMap.set(currentNodeId, {
        id: currentNodeId,
        label: shortNodeId(currentNodeId),
        direction: "both",
        incomingCount: 0,
        outgoingCount: 0,
      });
    }

    if (showLiteralEdges) {
      return Array.from(nodeMap.values());
    }

    const connectedNodeIds = new Set<string>([currentNodeId]);
    for (const link of visibleLinks) {
      connectedNodeIds.add(link.sourceId);
      connectedNodeIds.add(link.targetId);
    }
    return Array.from(nodeMap.values()).filter((node) => connectedNodeIds.has(node.id));
  }, [nodes, currentNodeId, showLiteralEdges, visibleLinks]);

  const radialLayout = useMemo(
    () => layoutRadialNodes(displayNodes, graphCanvasWidth, graphCanvasHeight),
    [displayNodes],
  );

  const radialNodesById = useMemo(
    () => new Map(radialLayout.map((node) => [node.id, node])),
    [radialLayout],
  );

  const selectedRadialNode = useMemo<SelectedRadialNodeInfo | null>(() => {
    if (!selectedRadialNodeId) return null;
    const node = radialNodesById.get(selectedRadialNodeId);
    if (!node) return null;
    return {
      id: node.id,
      label: node.label,
      incomingCount: node.id === currentNodeId ? centerIncomingCount : node.incomingCount,
      outgoingCount: node.id === currentNodeId ? centerOutgoingCount : node.outgoingCount,
      details: node.details,
      x: node.x,
      y: node.y,
    };
  }, [selectedRadialNodeId, radialNodesById, currentNodeId, centerIncomingCount, centerOutgoingCount]);

  const resolvedLegend = useMemo<RadialLegendItem[]>(() => {
    if (legendItems && legendItems.length > 0) {
      return legendItems;
    }
    return [
      { label: "Incoming", color: "#4f8dfd" },
      { label: "Outgoing", color: "#36c995" },
      { label: "Current node", color: "#8a6df6" },
    ];
  }, [legendItems]);

  useEffect(() => {
    setSelectedRadialNodeId(null);
  }, [nodes, links, currentNodeId]);

  useEffect(() => {
    if (selectedRadialNodeId && !displayNodes.some((node) => node.id === selectedRadialNodeId)) {
      setSelectedRadialNodeId(null);
    }
  }, [displayNodes, selectedRadialNodeId]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {resolvedLegend.map((item, index) => (
          <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
          <input
            type="checkbox"
            checked={showLiteralEdges}
            onChange={(event) => setShowLiteralEdges(event.target.checked)}
          />
          Show literal edges
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
          <input
            type="checkbox"
            checked={showDanglingEdges}
            onChange={(event) => setShowDanglingEdges(event.target.checked)}
          />
          Show dangling edges
        </label>
      </div>
      <svg
        viewBox={`0 0 ${graphCanvasWidth} ${graphCanvasHeight}`}
        className="h-[34rem] w-full min-w-[52rem] rounded-md bg-background/60"
        role="img"
        aria-label={ariaLabel}
        onClick={() => setSelectedRadialNodeId(null)}
      >
        <defs>
          {edgeColorMode === "direction" ? (
            <>
              <marker id={`${markerIdPrefix}-incoming-arrow`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L0,8 L8,4 z" fill="#5f95ff" />
              </marker>
              <marker id={`${markerIdPrefix}-outgoing-arrow`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L0,8 L8,4 z" fill="#52d39f" />
              </marker>
              <marker id={`${markerIdPrefix}-dangling-arrow`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L0,8 L8,4 z" fill="#dc2626" />
              </marker>
            </>
          ) : (
            hopColors.map((color, index) => (
              <marker
                key={`${markerIdPrefix}-hop-arrow-${index}`}
                id={`${markerIdPrefix}-hop-arrow-${index + 1}`}
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L0,8 L8,4 z" fill={color} />
              </marker>
            ))
          )}
        </defs>

        {visibleLinks.map((link) => {
          const source = radialNodesById.get(link.sourceId);
          const target = radialNodesById.get(link.targetId);
          if (!source || !target) return null;
          const lineColor = isDanglingLink(link)
            ? "#dc2626"
            : edgeColorMode === "hop"
            ? getHopColor(link.hop || 1, hopColors)
            : link.direction === "incoming"
              ? "#5f95ff"
              : "#52d39f";
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const length = Math.hypot(dx, dy) || 1;
          const ux = dx / length;
          const uy = dy / length;
          const sourceRadius = 26;
          const targetRadius = 26;
          const x1 = source.x + ux * sourceRadius;
          const y1 = source.y + uy * sourceRadius;
          const x2 = target.x - ux * targetRadius;
          const y2 = target.y - uy * targetRadius;
          const anchorX = x1 + (x2 - x1) * labelAlong;
          const anchorY = y1 + (y2 - y1) * labelAlong;
          const perpX = -dy / length;
          const perpY = dx / length;
          const labelX = anchorX + perpX * 8;
          const labelY = anchorY + perpY * 8;
          const markerEnd = edgeColorMode === "hop"
            ? `url(#${markerIdPrefix}-hop-arrow-${((Math.max(1, link.hop || 1) - 1) % hopColors.length) + 1})`
            : isDanglingLink(link)
              ? `url(#${markerIdPrefix}-dangling-arrow)`
            : link.direction === "incoming"
              ? `url(#${markerIdPrefix}-incoming-arrow)`
              : `url(#${markerIdPrefix}-outgoing-arrow)`;
          return (
            <g key={link.id}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={lineColor}
                strokeWidth={1.8}
                strokeOpacity={0.65}
                markerEnd={markerEnd}
              />
              {link.edgeLabel ? (
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor="middle"
                  className="pointer-events-none fill-foreground text-[10px] font-medium"
                >
                  {clampLabel(link.edgeLabel, 24)}
                </text>
              ) : null}
            </g>
          );
        })}

        {radialLayout.map((node) => {
          const isCurrent = node.id === currentNodeId;
          const isLiteral = isLiteralNodeId(node.id);
          const isDangling = isDanglingNodeId(node.id);
          const fill = isCurrent
            ? "#8a6df6"
            : isDangling
              ? "#dc2626"
            : isLiteral
              ? "#a8c547"
              : node.direction === "incoming"
                ? "#4f8dfd"
                : node.direction === "outgoing"
                  ? "#36c995"
                  : "#8a6df6";
          const stroke = isCurrent
            ? "#6f55dc"
            : isDangling
              ? "#991b1b"
            : isLiteral
              ? "#7a9a2e"
              : node.direction === "incoming"
                ? "#2f66d8"
                : node.direction === "outgoing"
                  ? "#239d74"
                  : "#6f55dc";
          const blueprintName = getBlueprintNameFromNodeId(node.id);
          const copyButtonSize = 14;
          const pillWidth = Math.max(54, blueprintName.length * 6.6 + 14);
          const pillHeight = 18;
          const pillX = node.x - (pillWidth / 2);
          const pillY = node.y - 43;
          const pillFill = isCurrent ? "#ede9fe" : isDangling ? "#fee2e2" : isLiteral ? "#f4fce3" : "#eff6ff";
          const pillStroke = isCurrent ? "#8b5cf6" : isDangling ? "#dc2626" : isLiteral ? "#a8c547" : "#60a5fa";
          const pillTextClass = isCurrent
            ? "fill-[#5b21b6]"
            : isDangling
              ? "fill-[#991b1b]"
            : isLiteral
              ? "fill-[#4d7c0f]"
              : "fill-[#1e3a8a]";
          return (
            <g key={node.id}>
              <rect
                x={pillX}
                y={pillY}
                width={pillWidth}
                height={pillHeight}
                rx={pillHeight / 2}
                fill={pillFill}
                fillOpacity={pillOpacity}
                stroke={pillStroke}
                strokeWidth={1}
              />
              <text
                x={node.x}
                y={pillY + 12.5}
                textAnchor="middle"
                className={`pointer-events-none text-[10px] font-semibold ${pillTextClass}`}
              >
                {blueprintName}
              </text>
              <circle
                cx={node.x}
                cy={node.y}
                r={26}
                fill={fill}
                stroke={stroke}
                strokeWidth={2}
                className="cursor-pointer"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedRadialNodeId(node.id);
                }}
              />
              <text
                x={node.x}
                y={node.y + 3}
                textAnchor="middle"
                textLength={38}
                lengthAdjust="spacingAndGlyphs"
                className="pointer-events-none fill-white text-[10px] font-medium"
              >
                {fitCircleLabel(node.label, 8)}
              </text>
              <foreignObject
                x={node.x - (copyButtonSize / 2)}
                y={node.y + 30}
                width={copyButtonSize}
                height={copyButtonSize}
                className="overflow-visible"
              >
                <button
                  type="button"
                  onClick={(event) => void copyNodeId(node.id, event)}
                  className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/95 text-slate-600 shadow-sm transition-colors hover:bg-white hover:text-slate-900"
                  title="Copy node ID"
                  aria-label="Copy node ID"
                >
                  {copiedNodeId === node.id ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </foreignObject>
            </g>
          );
        })}

        {selectedRadialNode ? (
          <NodeDetailTooltip
            node={selectedRadialNode}
            x={selectedRadialNode.x}
            y={selectedRadialNode.y}
            canvasWidth={graphCanvasWidth}
            canvasHeight={graphCanvasHeight}
          />
        ) : null}
      </svg>
    </div>
  );
}
