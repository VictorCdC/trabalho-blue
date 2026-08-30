"use client";

import * as React from "react";
import Link from "next/link";
import { ClipboardPlusIcon, InboxIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { naJanela } from "@/lib/analytics";
import {
  AGRAVANTE_LABEL,
  TIPO_DOR_LABEL,
  dataBR,
  dataRelativa,
  diasAtras,
  fundoIntensidade,
  RELACAO_LABEL,
} from "@/lib/format";
import { rotuloRegiao } from "@/lib/regioes";
import { useDados, useSessao } from "@/lib/sessao";
import type { CheckIn, Queixa } from "@/lib/types";
import { cn } from "@/lib/utils";

const JANELAS = [
  { valor: "30", label: "30 dias" },
  { valor: "60", label: "60 dias" },
  { valor: "0", label: "Tudo" },
];

export default function PaginaHistorico() {
  const { usuario } = useSessao();
  const { snapshot } = useDados();
  const [janela, setJanela] = React.useState("30");

  const meu = React.useMemo(() => {
    if (!snapshot || !usuario) return { queixas: [] as Queixa[], checkins: [] as CheckIn[] };
    return {
      queixas: snapshot.queixas
        .filter((q) => q.colaboradorId === usuario.id)
        .sort((a, b) => b.data.localeCompare(a.data)),
      checkins: snapshot.checkins.filter((c) => c.colaboradorId === usuario.id),
    };
  }, [snapshot, usuario]);

  const dias = Number(janela);
  const queixas = dias ? meu.queixas.filter((q) => naJanela(q.data, dias)) : meu.queixas;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Seu histórico</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Somente você e o SESMT da sua empresa têm acesso a estes registros.
        </p>
      </header>

      <Card>
        <CardContent className="space-y-3">
          <h2 className="text-sm font-semibold">Seus check-ins nos últimos 30 dias</h2>
          <FaixaCheckIns checkins={meu.checkins} />
          <div className="text-muted-foreground flex gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <i className="bg-sev-ok size-2.5 rounded-full" /> Bem
            </span>
            <span className="flex items-center gap-1.5">
              <i className="bg-sev-4 size-2.5 rounded-full" /> Com desconforto
            </span>
            <span className="flex items-center gap-1.5">
              <i className="bg-muted size-2.5 rounded-full border" /> Sem registro
            </span>
          </div>
        </CardContent>
      </Card>

      <Tabs value={janela} onValueChange={setJanela}>
        <TabsList className="w-full">
          {JANELAS.map((j) => (
            <TabsTrigger key={j.valor} value={j.valor}>
              {j.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {queixas.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed py-14 text-center">
          <InboxIcon className="text-muted-foreground size-8" />
          <p className="mt-3 font-medium">Nenhum desconforto registrado</p>
          <p className="text-muted-foreground mt-1 max-w-xs text-sm">
            Ótimo sinal. Se algo incomodar durante o expediente, registre na hora.
          </p>
          <Button asChild className="mt-5" variant="outline">
            <Link href="/registrar">
              <ClipboardPlusIcon /> Registrar desconforto
            </Link>
          </Button>
        </div>
      ) : (
        <ol className="space-y-3">
          {queixas.map((q) => (
            <li key={q.id}>
              <Card>
                <CardContent className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{rotuloRegiao(q.regiao, q.lado)}</p>
                      <p className="text-muted-foreground text-xs">
                        {dataBR(q.data)} · {dataRelativa(q.data)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-lg text-sm font-bold text-white",
                        fundoIntensidade(q.intensidade),
                      )}
                      title={`Intensidade ${q.intensidade} de 5`}
                    >
                      {q.intensidade}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="muted">{TIPO_DOR_LABEL[q.tipo]}</Badge>
                    <Badge variant="muted">{AGRAVANTE_LABEL[q.agrava]}</Badge>
                    <Badge variant="muted">
                      Relação com trabalho: {RELACAO_LABEL[q.relacaoTrabalho]}
                    </Badge>
                  </div>
                  {q.observacao && (
                    <p className="text-muted-foreground border-l-2 pl-3 text-sm italic">
                      “{q.observacao}”
                    </p>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function FaixaCheckIns({ checkins }: { checkins: CheckIn[] }) {
  const porDia = new Map(checkins.map((c) => [c.data.slice(0, 10), c.estado]));
  const dias = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86_400_000);
    const chave = d.toISOString().slice(0, 10);
    return { chave, dia: d.getDate(), estado: porDia.get(chave), fds: [0, 6].includes(d.getDay()) };
  });

  return (
    <div className="flex flex-wrap gap-1">
      {dias.map((d) => (
        <span
          key={d.chave}
          title={`${d.dia} — ${
            d.estado === "bem" ? "bem" : d.estado === "desconforto" ? "com desconforto" : d.fds ? "fim de semana" : "sem registro"
          }`}
          className={cn(
            "size-6 rounded-md border text-[10px] leading-6 text-center tnum",
            d.estado === "bem" && "bg-sev-ok border-transparent text-white",
            d.estado === "desconforto" && "bg-sev-4 border-transparent text-white",
            !d.estado && (d.fds ? "bg-muted/40 text-muted-foreground/50" : "bg-muted text-muted-foreground"),
          )}
        >
          {d.dia}
        </span>
      ))}
    </div>
  );
}
