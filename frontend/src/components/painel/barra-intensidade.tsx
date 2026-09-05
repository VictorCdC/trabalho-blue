"use client";

import { varIntensidade } from "@/lib/format";
import type { FatiaIntensidade } from "@/lib/types";

/* Distribuição de intensidade — barra empilhada com legenda.

   Mora fora de `graficos.tsx` porque é feita de divs: deixá-la lá obrigaria
   quem só quer esta barra a carregar o recharts junto. */

export function BarraIntensidade({ distribuicao }: { distribuicao: FatiaIntensidade[] }) {
  const total = distribuicao.reduce((a, b) => a + b.total, 0);
  if (!total) return <p className="text-muted-foreground text-sm">Sem registros no período.</p>;

  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full">
        {distribuicao.map((d) => (
          <div
            key={d.intensidade}
            title={`Intensidade ${d.intensidade}: ${d.total} registros`}
            style={{
              width: `${(d.total / total) * 100}%`,
              backgroundColor: varIntensidade(d.intensidade),
            }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
        {distribuicao.map((d) => (
          <li key={d.intensidade} className="flex items-center gap-1.5">
            <i
              className="size-2.5 rounded-full"
              style={{ backgroundColor: varIntensidade(d.intensidade) }}
            />
            <span className="text-muted-foreground">
              Nível {d.intensidade}: <span className="text-foreground tnum font-medium">{d.total}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
