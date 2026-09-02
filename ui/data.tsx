import React, { lazy, Suspense } from "react";

const ToolDataDashboard = lazy(() => import("./pages/tool_data_dashboard"));
const ToolDataTmpArtifact = lazy(() => import("./pages/tool_data_tmp_artifact"));
const DataExplorer = lazy(() => import("./pages/data_explorer"));
const ChatInspect = lazy(() => import("./pages/chat_inspect"));
const GraphExplorer = lazy(() => import("./pages/graph_explorer"));
const SearchExplorer = lazy(() => import("./pages/search_explorer"));


interface Portfolio {
  name: string;
  portfolio_id: string;
  orgs: Record<string, Org>;
  tools: Record<string, Tool>;
}

interface Org {
  name: string;
  org_id: string;
  tools: string[];
}

interface Tool {
  name: string;
  handle: string;
}

export default function Data({ portfolio, org, tool, section, tree, query, onNavigate, p1 }: {
    portfolio: string;
    org: string;
    tool: string;
    section?: string;  // optional prop since it might be undefined
    tree?: { portfolios: Record<string, Portfolio> };
    query?: Record<string, string>; // query args in the url (if any)
    onNavigate?: (path: string) => void;
    p1?: string;
}) {


    console.log('Data > Section/P1:',section, p1)

    const initialRing = (p1 || "").trim();
    const page = !section || section === "undefined" ? undefined : section;

    return (
        <div className="flex min-h-screen w-full flex-col bg-muted/40">
        
          <div className="flex flex-col sm:gap-2 sm:pl-2">
            <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading…</div>}>
            {page === undefined ? (
              <DataExplorer readonly={false} portfolio={portfolio} org={org} tool={tool} initialRing={initialRing}
              />
              ) : page === "tmp_artifact" ? (
              <ToolDataTmpArtifact portfolio={portfolio} org={org} />
              ) : page === "explorer" ? (
              <DataExplorer readonly={false} portfolio={portfolio} org={org} tool={tool} initialRing={initialRing}
              />
              ) : page === "inspect" ? (
              <ChatInspect portfolio={portfolio} org={org} tool={tool} tree={tree} onNavigate={onNavigate} query={query} />
              ) : page === "graph" ? (
              <GraphExplorer portfolio={portfolio} org={org} />
              ) : page === "search" ? (
              <SearchExplorer portfolio={portfolio} org={org} />
              ) : page === "dashboard" ? (
              <ToolDataDashboard />
              ) : null
              }
            </Suspense>
          
          </div>
        </div>
    )
}
