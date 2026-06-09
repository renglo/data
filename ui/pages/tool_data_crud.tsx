import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import {
  EllipsisVertical,
  FileJson2,
  LibraryBig,
} from "lucide-react"

//import { NavLink } from 'react-router-dom';

import { useState, useEffect, useRef} from 'react';

import DataTable from "@/components/console/data-table"
import ItemPreview from "@/components/console/item-preview"
import DialogPost from "@/components/console/dialog-post"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { overloadBlueprint, Blueprint } from '@/lib/console_utils';

interface ToolDataCRUDProps {
  readonly: boolean;
  portfolio: string;
  org: string;
  tool: string;
  ring: string;
}

export default function ToolDataCRUD({ readonly, portfolio, org, tool, ring }: ToolDataCRUDProps) {


    const isInitialMount = useRef(true);

    const [blueprint, setBlueprint] = useState<Blueprint>({ label: '' });
    const [selectedId, setSelectedId] = useState<string>('');
    const [deletedId, setDeletedId] = useState<string | null>(null);
    const [refresh, setRefresh] = useState(false);
    const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        // Function to fetch Blueprint and Data
        const fetchBlueprint = async () => {
          try {
            // Fetch Blueprint
            const blueprintResponse = await fetch(`${import.meta.env.VITE_API_URL}/_blueprint/irma/${ring}`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${sessionStorage.accessToken}`,
              },
            });
            const blueprintData = await blueprintResponse.json();
            setBlueprint(blueprintData);
    
            // After fetching blueprint, run overloadBlueprint
            const updatedBlueprint = await overloadBlueprint(blueprintData, portfolio, org, { eagerLoadSources: false });
            if (updatedBlueprint) {
                setBlueprint(updatedBlueprint);
            }
    
          } catch (err) {
            if (err instanceof Error) {
              setError(err); 
            } else {
              setError(new Error("An unknown error occurred"));  // Handle other types
            }
            console.error(error)
          }
        };
        
        fetchBlueprint();
        
    }, [ring, portfolio, org]);



    useEffect(() => {
        // Function to fetch Blueprint and Data
        const deleteItem = async () => {
          try {

            // Delete Request 
            const dataResponse = await fetch(`${import.meta.env.VITE_API_URL}/_data/${portfolio}/${org}/${ring}/${deletedId}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${sessionStorage.accessToken}`,
              },
            });
            const dataData = await dataResponse.json();
            
            console.log('Deleted Item:');
            console.log(dataData);
    
    
          } catch (err) {
            if (err instanceof Error) {
              setError(err);  // Now TypeScript knows `err` is of type `Error`.
            } else {
              setError(new Error("An unknown error occurred"));  // Handle other types
            }
            console.error(error)
          } finally {
            setRefresh(prev => !prev);
          }
        };


        // Skip the fetch call on the initial render
        if (isInitialMount.current) {
          isInitialMount.current = false;  // Mark that the component has loaded
          return;  // Exit the useEffect early to avoid running deleteItem
        }

        // This will run on subsequent updates when `deletedId` changes
        if (deletedId) {
          deleteItem();
        }

    }, [deletedId]);



    // Function to handle the selected id passed from the child component
    const handleSelectId = (id: string) => {
      setSelectedId(id);
      if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
        setMobilePreviewOpen(true);
      }
    };

    const handleDeleteId = (id: string) => {
        if (selectedId === id) {
          setSelectedId('');
        }
        setDeletedId(id);
    };

    // Function to update the state
    const refreshAction = () => {
        setRefresh(prev => !prev); // Toggle the `refresh` state to trigger useEffect
        //refreshUp(); No need to go up further

    };

    return (

            
        <main className="grid w-full min-w-0 flex-1 items-stretch gap-4 overflow-x-hidden p-4 sm:px-6 sm:py-0 md:gap-6 lg:grid-cols-[minmax(0,1fr)_clamp(18rem,33vw,42rem)]">
            <div className="grid min-w-0 overflow-hidden auto-rows-max items-start gap-4 md:gap-6">

                <nav className="ml-auto flex items-center gap-2 hidden">
                  
                  <a
                    href={`/${portfolio}/${org}/${tool}`}
                    className={({ isActive }) => (isActive ? "h-8 gap-1" : "h-8 gap-1")}
                    style={{ textDecoration: 'none' }} // Ensure no default link styling
                  >
                    {({ isActive }) => (
                      <Button size="sm" variant={isActive ? "default" : "outline"} className="w-full gap-1">
                        <LibraryBig className="h-3.5 w-3.5" />
                        <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                          Metrics
                        </span>
                      </Button>
                    )}
                  </a>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 gap-1">
                        <EllipsisVertical className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuCheckboxItem checked>
                        <a
                          href={`/${portfolio}/${org}/${tool}`}
                        >
                        Dashboard
                        </a>           
                      </DropdownMenuCheckboxItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  
                </nav>

                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                  <Card
                      className="sm:col-span-4"
                  >
                      <CardHeader className="pb-3">
                          <CardTitle>{blueprint.label}</CardTitle>
                          <CardDescription className="max-w-lg text-balance leading-relaxed">
                              {blueprint.description}
                          </CardDescription>
                      </CardHeader>
                      <CardFooter className="flex flex-wrap gap-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button type="button" size="sm" variant="outline" className="gap-1.5">
                                <FileJson2 className="h-3.5 w-3.5" />
                                Blueprint
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="flex max-h-[90vh] w-full max-w-4xl flex-col gap-4 overflow-hidden p-6 sm:max-w-4xl">
                              <DialogHeader className="shrink-0 space-y-1.5 text-left">
                                <DialogTitle>
                                  Blueprint · {blueprint.name || ring}
                                </DialogTitle>
                              </DialogHeader>
                              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md border bg-muted/20">
                                <pre className="whitespace-pre-wrap break-words p-4 text-xs leading-relaxed">
                                  {JSON.stringify(blueprint, null, 2)}
                                </pre>
                              </div>
                            </DialogContent>
                          </Dialog>
                          {!readonly && (
                              <DialogPost
                                  refreshUp={refreshAction}
                                  blueprint={blueprint}
                                  title={`Creating new ${blueprint.label}`}
                                  instructions="Enter the information you have now. You can add to it later."
                                  path={`${import.meta.env.VITE_API_URL}/_data/${portfolio}/${org}/${ring}`}
                                  method='POST'
                              />
                          )}
                      </CardFooter>
                  </Card>
                </div>

             
                <div className="flex min-h-0 min-w-0 h-[calc(100vh-16rem)] flex-col lg:h-[calc(100vh-14rem)]">
                  <Card className="flex min-h-0 min-w-0 flex-1 flex-col">
                      <CardHeader className="shrink-0 px-3 pb-2 pt-3 sm:px-6 lg:px-0 lg:pt-0">
                        <div className="flex items-center justify-end lg:hidden">
                          <Dialog open={mobilePreviewOpen} onOpenChange={setMobilePreviewOpen}>
                            <DialogTrigger asChild>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                disabled={!selectedId}
                                title={selectedId ? "Open selected document" : undefined}
                              >
                                <FileJson2 className="h-3.5 w-3.5" />
                                View selected
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="flex max-h-[92vh] w-full max-w-5xl flex-col gap-3 overflow-hidden p-4 sm:p-6">
                              <DialogHeader className="shrink-0 space-y-1.5 text-left">
                                <DialogTitle>
                                  {selectedId ? `Document ${selectedId}` : "Selected document"}
                                </DialogTitle>
                              </DialogHeader>
                              <div className="min-h-0 flex-1 overflow-auto">
                                <ItemPreview
                                  key={`${selectedId}:mobile`}
                                  selectedId={selectedId}
                                  refreshUp={refreshAction}
                                  onDeleteId={handleDeleteId}
                                  blueprint={blueprint}
                                  portfolio={portfolio}
                                  org={org}
                                  ring={ring}
                                />
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </CardHeader>
                      <CardContent className="flex min-h-0 min-w-0 flex-1 flex-col px-3 pb-3 pt-0 sm:px-6">
                      <DataTable
                          onSelectId={handleSelectId}
                          selectedId={selectedId}
                          refresh={refresh}
                          blueprint={blueprint}
                          portfolio={portfolio}
                          org={org}
                          tool={tool}
                          ring={ring}
                      >
                      </DataTable>
                      </CardContent>   
                  </Card>  
                </div>  
                  
                
            </div>
            <div className="sticky top-5 z-10 hidden h-[calc(100vh-5rem-20px)] min-h-0 w-full min-w-0 flex-col bg-background lg:flex">
                <div className="min-h-0 flex-1 flex flex-col">
                <ItemPreview 
                   key={selectedId}
                   selectedId={selectedId} 
                   refreshUp={refreshAction}
                   onDeleteId={handleDeleteId}
                   blueprint={blueprint}
                   portfolio={portfolio}
                   org={org}
                   ring={ring}
                /> 
                </div>
            </div>
        </main>

    )
}
