"use client";

import * as React from "react";
import { useEsperando } from "@/lib/carregando";
import { cn } from "@/lib/utils";

/* A barra de carregamento do produto, no topo de tudo.

   Ela não cobre a tela: o conteúdo anterior continua inteiro e legível
   enquanto o novo carrega. Foi o que substituiu a sobreposição de tela
   cheia — em navegação repetida, apagar a tela a cada clique cansa mais do
   que a espera que isso anunciava.

   Quem liga e desliga é o contador de esperas (`lib/carregando.ts`), que
   soma as duas: a rota em trânsito e o primeiro pedido de dados da tela.
   Por isso é uma barra só, do clique até o conteúdo, e não duas.

   O progresso é **simulado**, e de propósito: ninguém sabe quanto falta —
   nem o servidor, que ainda está compilando a rota ou contando linhas no
   Postgres. O avanço é a animação `barra-avanco` (globals.css), que sobe
   rápido e desacelera contra um teto que nunca alcança sozinha; só a chegada
   do conteúdo a fecha em 100%. Honesto no que importa — há trabalho
   acontecendo, e ele termina — sem inventar uma medida que não existe. */

/* A espera troca de dono no meio do caminho — a rota chega e o pedido de
   dados começa — e a contagem passa por zero por cerca de 1ms. Sem a
   carência, esse 1ms fecharia a barra em 100% para ela renascer em 30% no
   quadro seguinte: um solavanco no meio do carregamento. */
const CARENCIA_MS = 80;
/** Deslizar até o fim quando o conteúdo chega. */
const PREENCHER_MS = 200;
/** Encher, esperar, desvanecer — só então sair da árvore. */
const SAIDA_MS = 420;

type Estado = "oculta" | "carregando" | "completa";

export function BarraCarregando() {
  const esperando = useEsperando();
  const [estado, setEstado] = React.useState<Estado>("oculta");
  const barra = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (esperando) {
      setEstado("carregando");
      return;
    }
    let saida = 0;
    const carencia = window.setTimeout(() => {
      setEstado((e) => (e === "carregando" ? "completa" : e));
      saida = window.setTimeout(() => setEstado("oculta"), SAIDA_MS);
    }, CARENCIA_MS);
    return () => {
      window.clearTimeout(carencia);
      window.clearTimeout(saida);
    };
  }, [esperando]);

  /* O fim precisa sair de onde a animação está, e só o navegador sabe onde
     é isso. Congelar o valor calculado, desligar a animação e só então
     deslizar até 100% — sem isso a barra saltaria do ponto atual para o fim
     sem transição, porque uma animação em curso ganha do estilo inline. */
  React.useLayoutEffect(() => {
    const el = barra.current;
    if (!el) return;

    if (estado === "carregando") {
      // um clique novo durante a saída reaproveita o mesmo elemento
      el.style.transform = "";
      el.style.animation = "";
      el.style.transition = "";
      return;
    }
    if (estado === "completa") {
      el.style.transform = window.getComputedStyle(el).transform;
      el.style.animation = "none";
      void el.offsetWidth; // força o navegador a assumir o valor congelado
      el.style.transition = `transform ${PREENCHER_MS}ms ease-out`;
      el.style.transform = "scaleX(1)";
    }
  }, [estado]);

  if (estado === "oculta") return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-50 transition-opacity duration-200",
        // some depois de encher, não junto
        estado === "completa" ? "opacity-0 delay-150" : "opacity-100",
      )}
    >
      <div ref={barra} className="bg-primary barra-avanco h-[3px] origin-left" aria-hidden />
      {/* o avanço é simulado; anunciar porcentagem seria inventar medida */}
      <span role="status" aria-live="polite" className="sr-only">
        {estado === "carregando" ? "Carregando…" : ""}
      </span>
    </div>
  );
}
