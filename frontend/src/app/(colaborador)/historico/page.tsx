"use client";

import * as React from "react";
import { Link } from "@/components/link";
import { ClipboardPlusIcon, InboxIcon } from "lucide-react";
import { Paginador } from "@/components/painel/comuns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import {
  AGRAVANTE_LABEL,
  dataBR,
  dataRelativa,
  fundoIntensidade,
  RELACAO_LABEL,
  TIPO_DOR_LABEL,
} from "@/lib/format";
import { useRecurso } from "@/lib/recurso";
import { rotuloRegiao } from "@/lib/regioes";
import type { CheckIn } from "@/lib/types";
import { cn } from "@/lib/utils";

const JANELAS = [
  { valor: "30", label: "30 dias" },
  { valor: "60", label: "60 dias" },
  { valor: "0", label: "Tudo" },
];

const POR_PAGINA = 20;

export default function PaginaHistorico() {
  const [janela, setJanela] = React.useState("30");
  const [pagina, setPagina] = React.useState(0);
  const dias = Number(janela);

  // "Tudo" não significa baixar tudo: a janela vira parâmetro e a lista
  // continua paginada
  const queixas = useRecurso(
    () => api.minhasQueixas(dias, { limit: POR_PAGINA, offset: pagina * POR_PAGINA }),
    [dias, pagina],
    { chave: "meu/queixas" },
  );
  const checkins = useRecurso(() => api.meusCheckins(30), [], { chave: "meu/checkins" });

  React.useEffect(() => setPagina(0), [dias]);

  const itens = queixas.dados?.itens ?? [];

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
          <FaixaCheckIns checkins={checkins.dados ?? []} />
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

      {queixas.carregando ? (
        <div className="bg-muted h-48 animate-pulse rounded-xl" />
      ) : itens.length === 0 ? (
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
        <>
          <ol className="space-y-3">
            {itens.map((q) => (
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
          <Paginador
            total={queixas.dados?.total ?? 0}
            pagina={pagina}
            porPagina={POR_PAGINA}
            onPagina={setPagina}
            rotulo="registros"
          />
        </>
      )}
    </div>
  );
}

function FaixaCheckIns({ checkins }: { checkins: CheckIn[] }) {
  const porDia = new Map(checkins.map((c) => [c.data.slice(0, 10), c.estado]));
  const dias = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (29 - i));
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { chave, dia: d.getDate(), estado: porDia.get(chave), fds: [0, 6].includes(d.getDay()) };
  });

  return (
    <div className="flex flex-wrap gap-1">
      {dias.map((d) => (
        <span
          key={d.chave}
          title={`${d.dia} — ${
            d.estado === "bem"
              ? "bem"
              : d.estado === "desconforto"
                ? "com desconforto"
                : d.fds
                  ? "fim de semana"
                  : "sem registro"
          }`}
          className={cn(
            "size-6 rounded-md border text-[10px] leading-6 text-center tnum",
            d.estado === "bem" && "bg-sev-ok border-transparent text-white",
            d.estado === "desconforto" && "bg-sev-4 border-transparent text-white",
            !d.estado &&
              (d.fds ? "bg-muted/40 text-muted-foreground/50" : "bg-muted text-muted-foreground"),
          )}
        >
          {d.dia}
        </span>
      ))}
    </div>
  );
}
