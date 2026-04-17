import { ReactNode, useState } from "react";
import { Menu, Terminal } from "lucide-react";
import { Sidebar } from "./sidebar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden selection:bg-primary/30">
      <div className="hidden md:flex">
        <Sidebar />
      </div>
      <main className="flex-1 flex flex-col min-w-0">
        <div className="md:hidden flex items-center gap-2 border-b border-sidebar-border bg-sidebar/95 backdrop-blur px-3 py-2">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 border border-border/30 hover:bg-sidebar-accent"
                aria-label="Abrir menú"
              >
                <Menu className="w-4 h-4" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="p-0 w-[85vw] max-w-[320px] bg-sidebar border-sidebar-border"
            >
              <Sidebar mobile onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2 text-primary">
            <Terminal className="w-4 h-4" />
            <span
              className="font-bold tracking-[0.2em] text-sidebar-foreground text-sm"
              style={{
                fontFamily: "var(--app-font-display)",
                backgroundImage: "var(--brand-gradient)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              OVADAIAS
            </span>
          </div>
        </div>
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      </main>
    </div>
  );
}
