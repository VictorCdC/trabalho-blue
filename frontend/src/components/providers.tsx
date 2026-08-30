"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { DadosProvider, SessaoProvider } from "@/lib/sessao";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessaoProvider>
      <DadosProvider>
        <TooltipProvider>{children}</TooltipProvider>
      </DadosProvider>
    </SessaoProvider>
  );
}
