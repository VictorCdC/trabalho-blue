"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/* Quantas esperas estão acontecendo agora.

   A tela de carregamento é uma só, no topo da árvore, e tudo que demora se
   anuncia aqui. São duas esperas diferentes, e o usuário não tem por que
   distinguir uma da outra:

   - a rota que ainda não chegou (`components/link.tsx`, `useNavegar`). Em
     `next dev` ela é compilada no primeiro acesso, então o clique no menu
     ficava segundos sem resposta nenhuma — era esse o silêncio que dava
     sensação de travamento.
   - o primeiro pedido de dados da tela (`useRecurso`).

   Contá-las juntas é o que faz a espera ser uma só na tela: a barra sobe no
   clique e só fecha quando há conteúdo, em vez de encher, zerar e encher de
   novo entre a rota e os dados.

   **Recarga não conta.** Trocar o período de uma tela que já tem números
   mantém os números e busca por trás — isso já é discreto por natureza e não
   precisa de anúncio. */

let esperas = 0;
const ouvintes = new Set<() => void>();

function avisar(): void {
  for (const ouvinte of ouvintes) ouvinte();
}

function inscrever(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

function contar(): number {
  return esperas;
}

/* Efeito que roda antes da pintura.

   Com `useEffect` o registro só acontece depois de pintar, e a barra nasceria
   um quadro atrasada em cada troca — inclusive no meio do caminho, quando a
   espera passa da rota para os dados. Aqui ela acompanha o clique. No
   servidor não há pintura e `useLayoutEffect` avisaria. */
const useEfeitoVisual = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/** Anuncia uma espera enquanto `ativo` for verdadeiro. */
export function useEspera(ativo: boolean): void {
  useEfeitoVisual(() => {
    if (!ativo) return;
    esperas += 1;
    avisar();
    return () => {
      esperas -= 1;
      avisar();
    };
  }, [ativo]);
}

/** Verdadeiro enquanto alguma espera estiver aberta. */
export function useEsperando(): boolean {
  return React.useSyncExternalStore(inscrever, contar, () => 0) > 0;
}

/** Navegação por código, anunciada como a de um link.

    `router.push` fora de uma transição não tem estado pendente: abrir o caso
    a partir de um alerta ficava sem resposta pelo mesmo tempo que o clique
    no menu ficava. Dentro da transição, `pendente` dura até a tela nova
    estar pronta. */
export function useNavegar(): { ir: (href: string) => void; voltar: () => void } {
  const router = useRouter();
  const [pendente, iniciar] = React.useTransition();
  useEspera(pendente);

  return React.useMemo(
    () => ({
      ir: (href: string) => iniciar(() => router.push(href)),
      voltar: () => iniciar(() => router.back()),
    }),
    [router, iniciar],
  );
}
