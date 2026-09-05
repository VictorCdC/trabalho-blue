"use client";

import NextLink from "next/link";
import { useLinkStatus } from "next/link";
import { useEspera } from "@/lib/carregando";

/* O mesmo `Link` do Next, que avisa quando o clique ainda está em trânsito.

   Sem isto o App Router faz a navegação bloqueante: a tela antiga fica
   parada até a nova estar pronta e nada indica que o clique foi registrado —
   medido no container, 2,7 a 5,3 segundos de silêncio. `useLinkStatus` é o
   estado do roteador e vale igual para uma rota fria em desenvolvimento e
   para uma resposta lenta em produção.

   Foi tentado antes com `loading.tsx` por rota, o caminho idiomático, e não
   serve aqui: medindo, ele só é desenhado quando a fronteira é nova, ou seja
   ao **entrar** numa área. Trocar de tela dentro do painel não redesenha
   aquela fronteira, e as navegações continuavam mudas.

   O sentinela precisa estar **dentro** do Link — é assim que o hook acha a
   navegação a que pertence. Ele não desenha nada, então não entra no layout
   do link. */
function Sentinela() {
  const { pending } = useLinkStatus();
  useEspera(pending);
  return null;
}

export function Link({ children, ...resto }: React.ComponentProps<typeof NextLink>) {
  return (
    <NextLink {...resto}>
      {children}
      <Sentinela />
    </NextLink>
  );
}
