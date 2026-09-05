"use client";

import * as React from "react";
import { EyeOffIcon, TrendingDownIcon, TrendingUpIcon, XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { classesSeveridade, num, pct, SEVERIDADE_LABEL, STATUS_CASO_LABEL } from "@/lib/format";
import { PERIODOS, TODOS, type UsoFiltro } from "@/lib/filtros";
import { useDados } from "@/lib/sessao";
import type { Severidade, StatusCaso } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ---------------------------- carregamento ---------------------------- */

/** O corpo de uma tela do painel enquanto os números não chegam.

    Antes a tela inteira virava um retângulo cinza — sumiam o título e a barra
    de filtros junto com os dados, e trocar o período apagava da tela o
    controle que acabou de ser usado. O cabeçalho e os filtros não dependem
    da resposta; só o miolo espera. */
export function EsqueletoPainel() {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

/* ------------------------------ tabelas ------------------------------- */

/** Primeira coluna fixa na rolagem horizontal.

    Setores e Colaboradores têm dez colunas: no tablet, rolar para ver a taxa
    de desconforto tira o nome do setor da tela e a linha vira uma fileira de
    números sem sujeito. `bg-inherit` para acompanhar o realce da linha em vez
    de tapá-lo — e por isso a `TableRow` precisa de `bg-card`. */
export const COLUNA_FIXA = "bg-inherit sticky left-0 z-10";

/* ---------------------------- cabeçalho ------------------------------- */

export function CabecalhoPagina({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descricao && <p className="text-muted-foreground mt-1 text-sm">{descricao}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/* ------------------------------- KPI ---------------------------------- */

export function CartaoKpi({
  rotulo,
  valor,
  detalhe,
  variacao,
  /** true quando subir é ruim (queixas, intensidade) */
  subirEhRuim = true,
  destaque,
}: {
  rotulo: string;
  valor: React.ReactNode;
  detalhe?: string;
  variacao?: number;
  subirEhRuim?: boolean;
  destaque?: "alerta" | "ok";
}) {
  const temVariacao = typeof variacao === "number" && Number.isFinite(variacao) && variacao !== 0;
  const subiu = (variacao ?? 0) > 0;
  const ruim = subirEhRuim ? subiu : !subiu;

  return (
    <Card
      className={cn(
        destaque === "alerta" && "border-sev-5/40",
        destaque === "ok" && "border-sev-ok/40",
      )}
    >
      <CardContent className="py-4">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{rotulo}</p>
        <div className="mt-1.5 flex items-baseline gap-2">
          <p className="text-3xl leading-none font-semibold tnum">{valor}</p>
          {temVariacao && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-xs font-semibold tnum",
                ruim ? "text-sev-5" : "text-sev-ok",
              )}
              title="Comparado ao período anterior de igual duração"
            >
              {subiu ? <TrendingUpIcon className="size-3.5" /> : <TrendingDownIcon className="size-3.5" />}
              {pct(Math.abs(variacao as number))}
            </span>
          )}
        </div>
        {detalhe && <p className="text-muted-foreground mt-1.5 text-xs">{detalhe}</p>}
      </CardContent>
    </Card>
  );
}

/* ----------------------------- selos ---------------------------------- */

export function SeloSeveridade({ severidade }: { severidade: Severidade }) {
  return (
    <Badge variant="outline" className={classesSeveridade(severidade)}>
      Severidade {SEVERIDADE_LABEL[severidade].toLowerCase()}
    </Badge>
  );
}

export function SeloStatus({ status }: { status: StatusCaso }) {
  const classes: Record<StatusCaso, string> = {
    aberto: "bg-sev-5-soft text-sev-5 border-sev-5/30",
    em_andamento: "bg-sev-3-soft text-sev-3 border-sev-3/30",
    resolvido: "bg-sev-ok-soft text-sev-ok border-sev-ok/30",
  };
  return (
    <Badge variant="outline" className={classes[status]}>
      {STATUS_CASO_LABEL[status]}
    </Badge>
  );
}

export function SeloIntensidade({ valor }: { valor: number }) {
  const n = Math.min(5, Math.max(1, Math.round(valor)));
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <i
            key={i}
            className={cn("h-3.5 w-1.5 rounded-sm", i <= n ? "" : "bg-muted")}
            style={i <= n ? { backgroundColor: `var(--sev-${n})` } : undefined}
          />
        ))}
      </span>
      <span className="tnum text-sm">{num(valor)}</span>
    </span>
  );
}

/** Cor da barra por proporção: verde até 20%, âmbar até 40%, vermelho acima. */
export function corProporcao(p: number): string {
  if (p >= 40) return "bg-sev-5";
  if (p >= 20) return "bg-sev-4";
  return "bg-sev-ok";
}

/* ----------------------------- filtros -------------------------------- */

export function BarraFiltros({ filtros }: { filtros: UsoFiltro }) {
  const { estrutura, setoresDaUnidade, cargosDoSetor } = useDados();
  const { filtro, setFiltro, ativo, limpar } = filtros;

  const unidades = estrutura?.unidades ?? [];
  const unidadeEscolhida = filtro.unidadeId === TODOS ? null : filtro.unidadeId;
  const setores = setoresDaUnidade(unidadeEscolhida);
  const cargos = cargosDoSetor(filtro.setorId === TODOS ? null : filtro.setorId, unidadeEscolhida);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={filtro.unidadeId}
        // trocar de unidade invalida setor e cargo, como trocar de setor
        // invalida o cargo. Era um efeito no useFiltros, que na montagem
        // apagava o recorte que tinha acabado de vir da URL.
        onValueChange={(v) => setFiltro((f) => ({ ...f, unidadeId: v, setorId: TODOS, cargoId: TODOS }))}
      >
        <SelectTrigger size="sm" className="min-w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todas as unidades</SelectItem>
          {unidades.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filtro.setorId} onValueChange={(v) => setFiltro((f) => ({ ...f, setorId: v, cargoId: TODOS }))}>
        <SelectTrigger size="sm" className="min-w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todos os setores</SelectItem>
          {setores.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filtro.cargoId} onValueChange={(v) => setFiltro((f) => ({ ...f, cargoId: v }))}>
        <SelectTrigger size="sm" className="min-w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todos os cargos</SelectItem>
          {cargos.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={String(filtro.dias)}
        onValueChange={(v) => setFiltro((f) => ({ ...f, dias: Number(v) }))}
      >
        <SelectTrigger size="sm" className="min-w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIODOS.map((p) => (
            <SelectItem key={p.dias} value={String(p.dias)}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {ativo && (
        <Button variant="ghost" size="sm" onClick={limpar} className="text-muted-foreground">
          <XIcon /> Limpar
        </Button>
      )}
    </div>
  );
}

/** Rodapé de paginação.

    O `total` vem do servidor: a tela nunca tem a lista inteira para contar, que
    é justamente o ponto da paginação física. */
export function Paginador({
  total,
  pagina,
  porPagina,
  onPagina,
  rotulo = "itens",
}: {
  total: number;
  pagina: number;
  porPagina: number;
  onPagina: (n: number) => void;
  rotulo?: string;
}) {
  const paginas = Math.ceil(total / porPagina);
  if (paginas <= 1) return null;

  const inicio = pagina * porPagina + 1;
  const fim = Math.min(total, (pagina + 1) * porPagina);

  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-muted-foreground text-sm tnum">
        {inicio}–{fim} de {total} {rotulo}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pagina === 0}
          onClick={() => onPagina(pagina - 1)}
        >
          Anterior
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pagina >= paginas - 1}
          onClick={() => onPagina(pagina + 1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}

/* --------------------------- privacidade ------------------------------ */

export function AvisoAnonimo({ children }: { children?: React.ReactNode }) {
  return (
    <div className="bg-secondary text-secondary-foreground mb-6 flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm">
      <EyeOffIcon className="mt-0.5 size-4 shrink-0" />
      <p>
        {children ?? (
          <>
            Você está vendo <strong>dados agregados</strong>. Nomes de colaboradores só aparecem para
            o SESMT — é o que a LGPD exige para dado de saúde.
          </>
        )}
      </p>
    </div>
  );
}

/** O recorte ficou pequeno demais para divulgar qualquer número.

    Não é erro nem tela vazia: é a regra de k-mínimo do servidor agindo, e o
    usuário precisa saber que existe dado ali — só não em quantidade que possa
    ser publicada sem apontar para uma pessoa. */
export function RecorteSuprimido() {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
      <EyeOffIcon className="text-muted-foreground size-8" />
      <p className="mt-3 font-medium">Recorte pequeno demais para divulgar</p>
      <p className="text-muted-foreground mt-1 max-w-md text-sm">
        Combinando unidade, setor e cargo sobraram poucas pessoas — nesse tamanho um número
        agregado descreveria alguém em particular. Amplie o recorte para ver os indicadores.
      </p>
    </div>
  );
}

/* ----------------------------- vazio ---------------------------------- */

export function EstadoVazio({
  titulo,
  descricao,
  Icone,
  children,
}: {
  titulo: string;
  descricao?: string;
  Icone?: React.ComponentType<{ className?: string }>;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
      {Icone && <Icone className="text-muted-foreground size-8" />}
      <p className="mt-3 font-medium">{titulo}</p>
      {descricao && <p className="text-muted-foreground mt-1 max-w-md text-sm">{descricao}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
