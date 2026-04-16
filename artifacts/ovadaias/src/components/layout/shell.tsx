import { ReactNode } from "react";
import { Sidebar } from "./sidebar";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-full bg-background overflow-hidden selection:bg-primary/30">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        {children}
      </main>
    </div>
  );
}
