import ToolDataCRUD from "../../../tools/data/ui/pages/tool_data_crud"
import ToolDataDashboard from "../../../tools/data/ui/pages/tool_data_dashboard";


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

export default function Data({ portfolio, org, tool, section, tree }: {
    portfolio: string;
    org: string;
    tool: string;
    section?: string;  // optional prop since it might be undefined
    tree?: { portfolios: Record<string, Portfolio> };
}) {


    console.log('Data > Section:',section)

    return (
        <div className="flex min-h-screen w-full flex-col bg-muted/40">
        
          <div className="flex flex-col sm:gap-2 sm:pl-2">
  
            {section === undefined ? ( 
              <ToolDataDashboard />
              ):(
              <ToolDataCRUD readonly={false} portfolio={portfolio} org={org} tool={tool} ring={section}
              />
              )} 
          
          </div>
        </div>
    )
}
