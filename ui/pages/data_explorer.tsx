import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import ToolDataCRUD from "./tool_data_crud";
import VectorExplorerPanel from "./vector_explorer_panel";
import KbExplorerPanel from "./kb_explorer_panel";

interface DataExplorerProps {
  readonly: boolean;
  portfolio: string;
  org: string;
  tool: string;
  initialRing?: string;
}

type ExplorerTab = "rings" | "vectors" | "kb";

export default function DataExplorer({
  readonly,
  portfolio,
  org,
  tool,
  initialRing,
}: DataExplorerProps) {
  const normalizedInitial = useMemo(
    () => (initialRing || "").trim(),
    [initialRing],
  );
  const [tab, setTab] = useState<ExplorerTab>("rings");
  const [ringInput, setRingInput] = useState(normalizedInitial);
  const [activeRing, setActiveRing] = useState(normalizedInitial);

  const applyRing = () => {
    const nextRing = ringInput.trim();
    setActiveRing(nextRing);
  };

  const tabBtn = (id: ExplorerTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={`h-9 rounded-md px-3 text-sm transition ${
        tab === id
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/80"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-4 flex flex-col gap-4 sm:mx-6">
      <div className="flex flex-wrap gap-2 pt-1">
        {tabBtn("rings", "Rings")}
        {tabBtn("vectors", "Vectors")}
        {tabBtn("kb", "Knowledge base")}
      </div>

      {tab === "rings" ? (
        <>
          <div className="mx-auto flex w-full flex-col gap-2 sm:w-1/2 sm:flex-row">
            <input
              value={ringInput}
              onChange={(e) => setRingInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyRing();
              }}
              placeholder="enter a Blueprint name (e.g. schd_tools)"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
              onClick={applyRing}
            >
              <Search className="h-3.5 w-3.5" />
              Load
            </button>
          </div>

          {activeRing ? (
            <ToolDataCRUD
              readonly={readonly}
              portfolio={portfolio}
              org={org}
              tool={tool}
              ring={activeRing}
            />
          ) : null}
        </>
      ) : null}

      {tab === "vectors" ? (
        <VectorExplorerPanel portfolio={portfolio} org={org} readonly={readonly} />
      ) : null}

      {tab === "kb" ? <KbExplorerPanel portfolio={portfolio} org={org} /> : null}
    </div>
  );
}
