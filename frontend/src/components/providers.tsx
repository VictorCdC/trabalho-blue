"use client";

import { BarraCarregando } from "@/components/barra-carregando";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DadosProvider, SessaoProvider } from "@/lib/sessao";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessaoProvider>
      <DadosProvider>
        <TooltipProvider>
          {children}
          {/* fora do fluxo e montada sempre: quem decide se ela aparece é o
              contador de esperas, não a árvore de rotas */}
          <BarraCarregando />
        </TooltipProvider>
      </DadosProvider>
    </SessaoProvider>
  );
}
