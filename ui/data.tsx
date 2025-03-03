import ToolDataCRUD from "../../../tools/data/ui/pages/tool_data_crud"
import ToolDataDashboard from "../../../tools/data/ui/pages/tool_data_dashboard";


export default function Data({ portfolio, org, tool, ring }: {
    portfolio: string;
    org: string;
    tool: string;
    ring?: string;  // optional prop since it might be undefined
}) {


    console.log('Data > Ring:',ring)

    return (
        <div className="flex min-h-screen w-full flex-col bg-muted/40">
        
          <div className="flex flex-col sm:gap-2 sm:pl-2">
  
            {ring === undefined ? ( 
              <ToolDataDashboard />
              ):(
              <ToolDataCRUD readonly={false} portfolio={portfolio} org={org} tool={tool} ring={ring}
              />
              )} 
          
          </div>
        </div>
    )
}
