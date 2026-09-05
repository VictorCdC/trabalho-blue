"use client";

import { Link } from "@/components/link";
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

/* Cartão de alerta.

   O nome do colaborador aparece quando o servidor o envia — e ele só envia
   para quem tem `dados:identificados`. O cartão não decide mais nada sobre
   isso: para os demais perfis o alerta individual chega sem pessoa e vira
   "um colaborador do setor X", que basta para dimensionar o problema. */
export function CartaoAlerta({
  alerta,
  onAbrirCaso,
  compacto,
}: {
  alerta: Alerta;
  onAbrirCaso?: (alerta: Alerta) => void;
  compacto?: boolean;
}) {
  const { nomeSetor, unidadeDoSetor } = useDados();
  const { usuario } = useSessao();
  const podeVerCaso = pode(usuario?.role, "casos:ver");

  const coletivo = alerta.kind === "coletivo";
  const setorId = alerta.setorId;

  const titulo = coletivo
    ? `${rotuloCurto(alerta.regiao)} em ${nomeSetor(alerta.setorId)}`
    : `${rotuloCurto(alerta.regiao, alerta.lado)} recorrente`;

  const sujeito = coletivo
    ? `${alerta.afetados} de ${alerta.totalSetor} do setor · ${pct(alerta.percentual)}`
    : (alerta.colaboradorNome ?? `Um colaborador de ${nomeSetor(setorId)}`);

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
          {alerta.casoId && podeVerCaso ? (
            <Button asChild size="sm" variant="outline" className="ml-auto">
              <Link href={`/painel/casos/${alerta.casoId}`}>
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
