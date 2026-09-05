"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/* Os gráficos, carregados só quando entram na tela.

   O recharts responde por quase 200 kB do JavaScript inicial das telas que o
   usam (`/painel`, `/painel/setores`, `/painel/relatorios` e a ficha do
   colaborador chegavam a 295 kB contra 102 kB da base). Nenhum desses
   gráficos pode desenhar antes da resposta do servidor chegar, então também
   não precisa estar no primeiro carregamento: o import sai do bundle da rota
   e o esqueleto segura o espaço enquanto o pedaço chega.

   `ssr: false` porque o gráfico depende da largura do elemento — no servidor
   ele desenharia com zero. Quem quiser o componente síncrono importa de
   `./graficos` direto. */

export const GraficoTendencia = dynamic(
  () => import("./graficos").then((m) => m.GraficoTendencia),
  { ssr: false, loading: () => <Skeleton className="h-60 w-full" /> },
);

export const GraficoRegioes = dynamic(
  () => import("./graficos").then((m) => m.GraficoRegioes),
  { ssr: false, loading: () => <Skeleton className="h-52 w-full" /> },
);
