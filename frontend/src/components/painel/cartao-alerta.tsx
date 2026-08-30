"use client";

import Link from "next/link";
import { ArrowRightIcon, UserRoundIcon, UsersRoundIcon } from "lucide-react";
import { SeloSeveridade } from "@/components/painel/comuns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { dataRelativa, num, pct } from "@/lib/format";
import { rotuloCurto } from "@/lib/regioes";
import { pode } from "@/lib/rbac";
import { useDados, useSessao } from "@/lib/sessao";
import type { Alerta } from "@/lib/types";
import { cn } from "@/lib/utils";

/* Cartão de alerta. `identificar` controla se o nome do colaborador aparece:
   ligado só para o SESMT. Para os demais perfis o alerta individual vira
   "um colaborador do setor X", que basta para dimensionar o problema. */
export function CartaoAlerta({
  alerta,
  identificar,
  casoId,
  onAbrirCaso,
  compacto,
}: {
  alerta: Alerta;
  identificar: boolean;
  casoId?: string;
  onAbrirCaso?: (alerta: Alerta) => void;
  compacto?: boolean;
}) {
  const { colaborador, nomeSetor, unidadeDoSetor } = useDados();
  const { usuario } = useSessao();
  const podeVerCaso = pode(usuario?.role, "casos:ver");

  const coletivo = alerta.kind === "coletivo";
  const pessoa = alerta.kind === "individual" ? colaborador(alerta.colaboradorId) : undefined;
  const setorId = coletivo ? alerta.setorId : (pessoa?.setorId ?? null);

  const titulo = coletivo
    ? `${rotuloCurto(alerta.regiao)} em ${nomeSetor(alerta.setorId)}`
    : `${rotuloCurto(alerta.regiao, alerta.lado)} recorrente`;

  const sujeito = coletivo
    ? `${alerta.afetados} de ${alerta.totalSetor} do setor · ${pct(alerta.percentual)}`
    : identificar && pessoa
      ? pessoa.nome
      : `Um colaborador de ${nomeSetor(setorId)}`;

  const detalhe = coletivo
    ? `Registros nos últimos ${alerta.janelaDias} dias · último ${dataRelativa(alerta.ultimaEm)}`
    : `${alerta.ocorrencias} registros em ${alerta.janelaDias} dias · intensidade média ${num(alerta.intensidadeMedia)} · último ${dataRelativa(alerta.ultimaEm)}`;

  const Icone = coletivo ? UsersRoundIcon : UserRoundIcon;
  const borda = {
    alta: "border-sev-5/40",
    media: "border-sev-4/40",
    baixa: "border-sev-3/40",
  }[alerta.severidade];

  return (
    <Card className={cn(borda)}>
      <CardContent className={cn("space-y-3", compacto && "py-4")}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-lg",
                alerta.severidade === "alta" && "bg-sev-5-soft text-sev-5",
                alerta.severidade === "media" && "bg-sev-4-soft text-sev-4",
                alerta.severidade === "baixa" && "bg-sev-3-soft text-sev-3",
              )}
            >
              <Icone className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold leading-snug">{titulo}</p>
              <p className="text-muted-foreground text-sm leading-snug">{sujeito}</p>
            </div>
          </div>
          <SeloSeveridade severidade={alerta.severidade} />
        </div>

        <p className="text-muted-foreground text-xs">{detalhe}</p>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="muted">{coletivo ? "Coletivo" : "Individual"}</Badge>
          {setorId && <Badge variant="muted">{unidadeDoSetor(setorId)}</Badge>}
          {casoId && podeVerCaso ? (
            <Button asChild size="sm" variant="outline" className="ml-auto">
              <Link href={`/painel/casos/${casoId}`}>
                Ver caso <ArrowRightIcon />
              </Link>
            </Button>
          ) : onAbrirCaso ? (
            <Button size="sm" className="ml-auto" onClick={() => onAbrirCaso(alerta)}>
              Abrir caso
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
