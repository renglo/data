import {
  Search,
  EllipsisVertical,
  Database,
} from "lucide-react"

import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { useState } from 'react';
import { useWindowSize } from '@/contexts/WindowSizeContext';


interface ToolMenuProps {
    portfolio: string;
    org: string;
    tool?: string;
    ring?: string;
    onNavigate: (path: string) => void;
}


export default function ToolDataSheetNav({portfolio,org,tool,ring,onNavigate}:ToolMenuProps) {  
    
    const [open, setOpen] = useState(false);
    const { width } = useWindowSize();
       
    return ( 

        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button size="icon" variant="outline" className="block sm:hidden">
                <EllipsisVertical className="h-5 w-5" />{width}
                <span className="sr-only">Toggle Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="sm:max-w-xs">
              
            

        
        
            <nav className="grid gap-6 text-lg font-medium">
                <button
                    onClick={() => {
                        setOpen(false);
                        onNavigate(`/home`);
                    }}
                    className="group flex h-11 w-11 shrink-0 items-center justify-center gap-2  md:h-8 md:w-8 md:text-base"     
                > 
                    
                    <img src={`${import.meta.env.VITE_WL_LOGO}`} className="ml-auto h-12 w-12" alt="Logo" />
                    <span className="sr-only">Logo</span>
                </button> 
                <button
                    onClick={() => {
                        setOpen(false);
                        onNavigate(`/${portfolio}/${org}/data`);
                    }}
                    className="flex items-center gap-4 px-2.5 text-foreground"
                >
                    <Database className="h-5 w-5" />
                    Data
                </button>
                
                <span className="relative hidden">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                    type="search"
                    placeholder="Search..."
                    className="w-full rounded-lg bg-background pl-8"
                    />
                </span>
            </nav>

            </SheetContent>
        </Sheet>
    )
}