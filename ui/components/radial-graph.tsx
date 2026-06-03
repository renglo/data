import React, { useEffect, useId, useMemo, useState } from "react";

export type RadialDirection = "incoming" | "outgoing" | "both";

export interface RadialGraphNode {
  id: string;
  label: string;
  direction: RadialDirection;
  incomingCount: number;
  outgoingCount: number;
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
  x: number;
  y: number;
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

  const centerIncomingCount = useMemo(
    () => links.filter((link) => link.targetId === currentNodeId).length,
    [links, currentNodeId],
  );

  const centerOutgoingCount = useMemo(
    () => links.filter((link) => link.sourceId === currentNodeId).length,
    [links, currentNodeId],
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
    return Array.from(nodeMap.values());
  }, [nodes, currentNodeId]);

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        {resolvedLegend.map((item, index) => (
          <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
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

        {links.map((link) => {
          const source = radialNodesById.get(link.sourceId);
          const target = radialNodesById.get(link.targetId);
          if (!source || !target) return null;
          const lineColor = edgeColorMode === "hop"
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
          const fill = isCurrent
            ? "#8a6df6"
            : node.direction === "incoming"
              ? "#4f8dfd"
              : node.direction === "outgoing"
                ? "#36c995"
                : "#8a6df6";
          const stroke = isCurrent
            ? "#6f55dc"
            : node.direction === "incoming"
              ? "#2f66d8"
              : node.direction === "outgoing"
                ? "#239d74"
                : "#6f55dc";
          const blueprintName = getBlueprintNameFromNodeId(node.id);
          const pillWidth = Math.max(54, blueprintName.length * 6.6 + 14);
          const pillHeight = 18;
          const pillX = node.x - (pillWidth / 2);
          const pillY = node.y - 43;
          return (
            <g key={node.id}>
              <rect
                x={pillX}
                y={pillY}
                width={pillWidth}
                height={pillHeight}
                rx={pillHeight / 2}
                fill={isCurrent ? "#ede9fe" : "#eff6ff"}
                fillOpacity={pillOpacity}
                stroke={isCurrent ? "#8b5cf6" : "#60a5fa"}
                strokeWidth={1}
              />
              <text
                x={node.x}
                y={pillY + 12.5}
                textAnchor="middle"
                className={`pointer-events-none text-[10px] font-semibold ${isCurrent ? "fill-[#5b21b6]" : "fill-[#1e3a8a]"}`}
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
            </g>
          );
        })}

        {selectedRadialNode ? (() => {
          const tooltipWidth = 290;
          const tooltipHeight = 74;
          const rawX = selectedRadialNode.x + 18;
          const rawY = selectedRadialNode.y - tooltipHeight - 16;
          const tooltipX = Math.max(10, Math.min(rawX, graphCanvasWidth - tooltipWidth - 10));
          const tooltipY = Math.max(10, Math.min(rawY, graphCanvasHeight - tooltipHeight - 10));
          return (
            <g>
              <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx={8} fill="#0f172acc" stroke="#475569" strokeWidth={1} />
              <text x={tooltipX + 10} y={tooltipY + 22} className="fill-white text-[12px] font-semibold">
                {clampLabel(selectedRadialNode.label, 36)}
              </text>
              <text x={tooltipX + 10} y={tooltipY + 40} className="fill-slate-200 text-[10px]">
                {clampLabel(selectedRadialNode.id, 52)}
              </text>
              <text x={tooltipX + 10} y={tooltipY + 58} className="fill-slate-300 text-[10px]">
                {`${selectedRadialNode.incomingCount} incoming / ${selectedRadialNode.outgoingCount} outgoing`}
              </text>
            </g>
          );
        })() : null}
      </svg>
    </div>
  );
}
