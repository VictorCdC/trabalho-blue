"use client";

import * as React from "react";
import { ARTE, CAIXA, CONTORNO, EIXO } from "@/lib/anatomia";
import { regiao as buscarRegiao, rotuloRegiao } from "@/lib/regioes";
import { varIntensidade } from "@/lib/format";
import type { Lado, RegiaoId, Vista } from "@/lib/types";
import { cn } from "@/lib/utils";

/* Mapa corporal clicável. Serve a dois usos:
   - registro: o colaborador toca a região que dói (selecionada + onSelecionar)
   - leitura: o painel pinta as regiões por frequência/intensidade (calor)

   Convenção de lado: na vista de frente a pessoa está virada para quem olha,
   então o lado esquerdo da TELA é o lado DIREITO do corpo. Na vista de costas
   a correspondência é direta. LADO_POR_VISTA resolve isso num só lugar.

   Desenho: a figura vem de lib/anatomia.ts, músculo a músculo, e cada região
   nossa é a união de um ou mais daqueles músculos. Os vãos entre músculos são
   parte do traço e não pertencem a região nenhuma — clicar num vão não faz
   nada, o que é aceitável porque toda região tem alvo folgado.

   Articulações (cotovelo, punho, joelho) e quadril não existem naquela arte,
   que é muscular: junta e bacia são justamente onde ela deixa vão. Essas
   entram como faixa própria, recortada pela silhueta e desenhada POR CIMA dos
   músculos — assim o cotovelo interrompe o braço em vez de disputar frestas
   com ele. Por isso a ordem de ALVOS importa: junta sempre depois do músculo
   que ela corta. */

/* ------------------------------ regiões ------------------------------- */

type PosicaoTela = "centro" | "esq" | "dir";

const LADO_POR_VISTA: Record<Vista, Record<PosicaoTela, Lado>> = {
  frente: { esq: "direito", dir: "esquerdo", centro: "na" },
  costas: { esq: "esquerdo", dir: "direito", centro: "na" },
};

/** Músculos da arte que compõem cada região. */
const MUSCULOS: Record<Vista, Partial<Record<RegiaoId, string[]>>> = {
  frente: {
    cabeca: ["hair", "head"],
    pescoco: ["neck"],
    ombro: ["deltoids", "trapezius"],
    peito: ["chest"],
    abdomen: ["abs", "obliques"],
    braco: ["biceps", "triceps"],
    antebraco: ["forearm"],
    mao: ["hands"],
    coxa: ["quadriceps", "adductors"],
    canela: ["tibialis", "calves"],
    pe: ["ankles", "feet"],
  },
  costas: {
    nuca: ["hair", "head"],
    cervical: ["neck"],
    ombro: ["deltoids"],
    dorsal: ["upper-back", "trapezius"],
    lombar: ["lower-back"],
    braco: ["triceps"],
    antebraco: ["forearm"],
    mao: ["hands"],
    gluteo: ["gluteal"],
    posterior_coxa: ["hamstring", "adductors"],
    panturrilha: ["calves"],
    calcanhar: ["ankles", "feet"],
  },
};

/* A arte traz um "knees" em meia-lua fina demais para servir de alvo de toque;
   o joelho aqui é a faixa de junta e aquele traçado fica sem uso de propósito. */

/** Faixa que atravessa um membro: bordas arqueadas, pontas cortadas pela
    silhueta. `arco` é o quanto a borda entorta — junta fina pede menos. */
function cinta(x1: number, x2: number, y1: number, y2: number, arco = 8): string {
  const a = x1 + (x2 - x1) * 0.3;
  const b = x1 + (x2 - x1) * 0.7;
  return (
    `M${x1} ${y1 + arco} C${a} ${y1 - arco} ${b} ${y1 - arco} ${x2} ${y1 + arco} ` +
    `L${x2} ${y2 - arco} C${b} ${y2 + arco} ${a} ${y2 + arco} ${x1} ${y2 - arco} Z`
  );
}

/** Par espelhado em torno do eixo do corpo. Espelhar os números aqui, e não
    com um transform, mantém o sentido do traçado que o recorte usa. */
function parCinta(
  vista: Vista,
  x1: number,
  x2: number,
  y1: number,
  y2: number,
  arco?: number,
): Record<"esq" | "dir", string[]> {
  const e = EIXO[vista];
  return {
    esq: [cinta(x1, x2, y1, y2, arco)],
    dir: [cinta(2 * e - x2, 2 * e - x1, y1, y2, arco)],
  };
}

/* Os limites em x cobrem o membro inteiro sem encostar no tronco depois do
   recorte: na altura do cotovelo o braço passa rente às costelas, e alguns
   pixels a mais pintariam a lateral do tronco. */
const JUNTAS: Record<Vista, Partial<Record<RegiaoId, Partial<Record<PosicaoTela, string[]>>>>> = {
  frente: {
    cotovelo: parCinta("frente", 100, 260, 496, 528),
    punho: parCinta("frente", 58, 200, 666, 692, 5),
    joelho: parCinta("frente", 230, 350, 950, 1058, 10),
    // bacia: da linha do quadril à virilha, contornando a raiz das coxas
    quadril: {
      centro: [
        "M232 672 C280 660 444 660 492 672 L492 718 C472 750 440 756 400 750 " +
          "C380 746 372 740 362 724 C352 740 344 746 324 750 C284 756 252 750 232 718 Z",
      ],
    },
  },
  costas: {
    cotovelo: parCinta("costas", 818, 972, 496, 528),
    punho: parCinta("costas", 782, 924, 666, 692, 5),
  },
};

interface Alvo {
  regiao: RegiaoId;
  posicao: PosicaoTela;
  formas: string[];
  /** junta: vai por cima dos músculos e precisa do recorte da silhueta */
  junta: boolean;
}

function montarAlvos(vista: Vista): Alvo[] {
  const alvos: Alvo[] = [];

  for (const [id, slugs] of Object.entries(MUSCULOS[vista]) as [RegiaoId, string[]][]) {
    const bilateral = buscarRegiao(id).bilateral;
    const por: Record<PosicaoTela, string[]> = { centro: [], esq: [], dir: [] };
    for (const slug of slugs) {
      const forma = ARTE[vista][slug];
      // região central junta os dois lados da arte num alvo só
      por[bilateral ? "esq" : "centro"].push(...(forma.esq ?? []));
      por[bilateral ? "dir" : "centro"].push(...(forma.dir ?? []));
      por.centro.push(...(forma.comum ?? []));
    }
    for (const [posicao, formas] of Object.entries(por) as [PosicaoTela, string[]][]) {
      if (formas.length) alvos.push({ regiao: id, posicao, formas, junta: false });
    }
  }

  // juntas por último: precisam cobrir o músculo que atravessam
  for (const [id, lados] of Object.entries(JUNTAS[vista]) as [
    RegiaoId,
    Partial<Record<PosicaoTela, string[]>>,
  ][]) {
    for (const [posicao, formas] of Object.entries(lados) as [PosicaoTela, string[]][]) {
      alvos.push({ regiao: id, posicao, formas, junta: true });
    }
  }

  return alvos;
}

const ALVOS: Record<Vista, Alvo[]> = {
  frente: montarAlvos("frente"),
  costas: montarAlvos("costas"),
};

/* ------------------------------- calor -------------------------------- */

export interface CalorRegiao {
  total: number;
  intensidadeMedia: number;
}

/** Chave do mapa de calor. Regiões centrais usam "na". */
export function chaveCalor(regiao: RegiaoId, lado: Lado): string {
  return `${regiao}|${buscarRegiao(regiao).bilateral ? lado : "na"}`;
}

/** Monta o mapa de calor a partir de contagens por região e lado. */
export function montarCalor(
  itens: Array<{ regiao: RegiaoId; lado: Lado; total: number; intensidadeMedia: number }>,
): Record<string, CalorRegiao> {
  const out: Record<string, CalorRegiao> = {};
  for (const i of itens) {
    const chave = chaveCalor(i.regiao, i.lado);
    const atual = out[chave];
    // soma quando duas entradas caem na mesma chave (ex.: central marcada com lado)
    out[chave] = atual
      ? {
          total: atual.total + i.total,
          intensidadeMedia:
            (atual.intensidadeMedia * atual.total + i.intensidadeMedia * i.total) /
            (atual.total + i.total),
        }
      : { total: i.total, intensidadeMedia: i.intensidadeMedia };
  }
  return out;
}

/* ------------------------------ desenho ------------------------------- */

export interface MapaCorporalProps {
  vista: Vista;
  selecionada?: { regiao: RegiaoId; lado: Lado } | null;
  onSelecionar?: (regiao: RegiaoId, lado: Lado) => void;
  /** pinta as regiões por frequência — construa com montarCalor() */
  calor?: Record<string, CalorRegiao>;
  className?: string;
}

export function MapaCorporal({
  vista,
  selecionada,
  onSelecionar,
  calor,
  className,
}: MapaCorporalProps) {
  const interativo = Boolean(onSelecionar);
  // o id do clipPath é global no documento e a tela mostra vários mapas
  const idCorte = `corte-${React.useId()}`;
  const maxCalor = React.useMemo(
    () => Math.max(1, ...Object.values(calor ?? {}).map((c) => c?.total ?? 0)),
    [calor],
  );

  return (
    <svg
      viewBox={CAIXA[vista]}
      className={cn("brilho-corpo h-auto w-full select-none", className)}
      role={interativo ? "group" : "img"}
      aria-label={
        interativo
          ? `Mapa do corpo, vista ${vista === "frente" ? "de frente" : "de costas"}`
          : `Mapa de calor do corpo, vista ${vista === "frente" ? "de frente" : "de costas"}`
      }
    >
      <defs>
        <clipPath id={idCorte}>
          <path d={CONTORNO[vista]} />
        </clipPath>
      </defs>

      {ALVOS[vista].map((alvo) => {
        const lado = LADO_POR_VISTA[vista][alvo.posicao];
        const ativa =
          selecionada?.regiao === alvo.regiao &&
          (selecionada.lado === lado || !buscarRegiao(alvo.regiao).bilateral);
        const c = calor?.[chaveCalor(alvo.regiao, lado)];
        const rotulo = rotuloRegiao(alvo.regiao, lado);

        let cor: string | null = null;
        let opacidade = 1;
        if (ativa) {
          cor = "var(--primary)";
        } else if (c && c.total > 0) {
          cor = varIntensidade(c.intensidadeMedia);
          // a frequência modula a opacidade sobre o corpo neutro que está embaixo
          opacidade = 0.45 + 0.55 * (c.total / maxCalor);
        }

        const titulo = c
          ? `${rotulo} — ${c.total} ${c.total === 1 ? "registro" : "registros"}, intensidade média ${c.intensidadeMedia.toFixed(1).replace(".", ",")}`
          : rotulo;

        return (
          <g
            key={`${alvo.regiao}-${alvo.posicao}`}
            className={cn("group", interativo && "cursor-pointer focus:outline-none")}
            clipPath={alvo.junta ? `url(#${idCorte})` : undefined}
            role={interativo ? "button" : undefined}
            tabIndex={interativo ? 0 : undefined}
            aria-pressed={interativo ? ativa : undefined}
            aria-label={interativo ? rotulo : undefined}
            onClick={interativo ? () => onSelecionar?.(alvo.regiao, lado) : undefined}
            onKeyDown={
              interativo
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelecionar?.(alvo.regiao, lado);
                    }
                  }
                : undefined
            }
          >
            <title>{titulo}</title>
            {/* corpo neutro — some sob a cor quando a região tem registro */}
            {alvo.formas.map((d, i) => (
              <path
                key={`base-${i}`}
                d={d}
                fill="var(--input)"
                className={cn(
                  interativo && !ativa && "group-hover:fill-accent",
                  interativo && "group-focus-visible:stroke-ring",
                )}
                strokeWidth={4}
              />
            ))}
            {cor &&
              alvo.formas.map((d, i) => (
                <path key={`cor-${i}`} d={d} fill={cor} fillOpacity={opacidade} />
              ))}
          </g>
        );
      })}

      <path
        d={CONTORNO[vista]}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={3.5}
        strokeLinejoin="round"
        pointerEvents="none"
      />
    </svg>
  );
}

/* --------------------------- alternador de vista ---------------------- */

export function SeletorVista({
  vista,
  onChange,
  className,
}: {
  vista: Vista;
  onChange: (v: Vista) => void;
  className?: string;
}) {
  return (
    <div className={cn("bg-muted inline-flex rounded-lg p-1", className)} role="tablist">
      {(["frente", "costas"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={vista === v}
          onClick={() => onChange(v)}
          className={cn(
            "min-w-24 rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
            vista === v
              ? "bg-card text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {v === "frente" ? "Frente" : "Costas"}
        </button>
      ))}
    </div>
  );
}

/** Legenda de orientação — evita que a pessoa marque o lado errado. */
export function OrientacaoLados({ vista }: { vista: Vista }) {
  const esquerdaTela = LADO_POR_VISTA[vista].esq;
  const direitaTela = LADO_POR_VISTA[vista].dir;
  return (
    <div className="text-muted-foreground flex items-center justify-between gap-2 px-1 text-[10px] whitespace-nowrap uppercase tracking-wide">
      <span>&larr; lado {esquerdaTela}</span>
      <span>lado {direitaTela} &rarr;</span>
    </div>
  );
}
