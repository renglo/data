import React from "react";
import ToolDataDashboard from "./pages/tool_data_dashboard";
import ToolDataTmpArtifact from "./pages/tool_data_tmp_artifact";
import DataExplorer from "./pages/data_explorer";
import ChatInspect from "./pages/chat_inspect"


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

    return (
        <div className="flex min-h-screen w-full flex-col bg-muted/40">
        
          <div className="flex flex-col sm:gap-2 sm:pl-2">
  
            {section === undefined ? (
              <DataExplorer readonly={false} portfolio={portfolio} org={org} tool={tool} initialRing={initialRing}
              />
              ) : section === "tmp_artifact" ? (
              <ToolDataTmpArtifact portfolio={portfolio} org={org} />
              ) : section === "explorer" ? (
              <DataExplorer readonly={false} portfolio={portfolio} org={org} tool={tool} initialRing={initialRing}
              />
              ) : section === "inspect" ? (
              <ChatInspect portfolio={portfolio} org={org} tool={tool} tree={tree} onNavigate={onNavigate} query={query} />
              ) : section === "dashboard" ? (
              <ToolDataDashboard />
              ) : null
              }
          
          </div>
        </div>
    )
}
