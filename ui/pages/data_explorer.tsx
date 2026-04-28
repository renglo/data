import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import ToolDataCRUD from "./tool_data_crud";

interface DataExplorerProps {
  readonly: boolean;
  portfolio: string;
  org: string;
  tool: string;
  initialRing?: string;
}

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
  const [ringInput, setRingInput] = useState(normalizedInitial);
  const [activeRing, setActiveRing] = useState(normalizedInitial);

  const applyRing = () => {
    const nextRing = ringInput.trim();
    setActiveRing(nextRing);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Type a ring name (or use `p1`) and retrieve data.</span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={ringInput}
          onChange={(e) => setRingInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyRing();
          }}
          placeholder="e.g. schd_tools"
          className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="button"
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          onClick={applyRing}
        >
          <Search className="h-3.5 w-3.5" />
          Open Ring
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
    </div>
  );
}
