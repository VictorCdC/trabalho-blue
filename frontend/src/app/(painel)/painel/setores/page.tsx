"use client";

import * as React from "react";
import { Building2Icon } from "lucide-react";
import { MapaCorporal, SeletorVista, montarCalor } from "@/components/mapa-corporal";
import { CartaoAlerta } from "@/components/painel/cartao-alerta";
import {
  BarraFiltros,
  CabecalhoPagina,
  COLUNA_FIXA,
  EstadoVazio,
  RecorteSuprimido,
  SeloIntensidade,
  corProporcao,
} from "@/components/painel/comuns";
import { GraficoRegioes, GraficoTendencia } from "@/components/painel/graficos-adiados";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { useFiltros } from "@/lib/filtros";
import { pct } from "@/lib/format";
import { useRecurso } from "@/lib/recurso";
import { rotuloCurto } from "@/lib/regioes";
import { useDados } from "@/lib/sessao";
import type { Vista } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function PaginaSetores() {
  const { nomeSetor, unidadeDoSetor } = useDados();
  const filtros = useFiltros();
  const [selecionado, setSelecionado] = React.useState<string | null>(null);
  const [vista, setVista] = React.useState<Vista>("costas");

  const { filtro, recorte } = filtros;
  const setores = useRecurso(() => api.painelSetores(recorte), [recorte], {
    chave: "painel/setores",
  });

  const linhas = setores.dados ?? [];
  const setorAtivo = selecionado ?? linhas.find((s) => !s.suprimido)?.setorId ?? null;

  // o detalhe é o mesmo agregado do painel, com o setor no recorte — não é
  // uma segunda consulta especial, é a mesma pergunta com o filtro apertado
  const detalhe = useRecurso(
    () => api.painelResumo({ ...recorte, setorId: setorAtivo ?? undefined }),
    [recorte, setorAtivo],
    { ativo: Boolean(setorAtivo), chave: "painel/resumo" },
  );

  const alertasDoSetor = useRecurso(
    () => api.alertas({ ...recorte, setorId: setorAtivo ?? undefined }, "coletivos", { limit: 6 }),
    [recorte, setorAtivo],
    { ativo: Boolean(setorAtivo), chave: "setores/alertas" },
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Setores"
        descricao="Onde o problema é do posto de trabalho e não da pessoa. Recorrência é o indicador que pede ação; a taxa de desconforto mostra o tamanho do incômodo no dia a dia."
      />

      <div className="mb-6">
        <BarraFiltros filtros={filtros} />
      </div>

      {setores.carregando ? (
        <div className="bg-muted h-64 animate-pulse rounded-xl" />
      ) : linhas.length === 0 ? (
        <EstadoVazio Icone={Building2Icon} titulo="Nenhum setor no recorte selecionado" />
      ) : (
        <>
          {/* A tabela é do tablet para cima; no celular os mesmos setores
              saem em cartão, com os campos que decidem ação. */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-card">
                    <TableHead className={COLUNA_FIXA}>Setor</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead className="text-right">Pessoas</TableHead>
                    <TableHead className="min-w-40">Com queixa recorrente</TableHead>
                    <TableHead className="text-right">Taxa de desconforto</TableHead>
                    <TableHead className="text-right">Queixas</TableHead>
                    <TableHead>Intensidade</TableHead>
                    <TableHead>Região principal</TableHead>
                    <TableHead className="text-right">Adesão</TableHead>
                    <TableHead className="text-right">Alertas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((s) =>
                    s.suprimido ? (
                      <TableRow key={s.setorId} className="bg-card">
                        <TableCell className={cn("font-medium", COLUNA_FIXA)}>
                          {nomeSetor(s.setorId)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {unidadeDoSetor(s.setorId)}
                        </TableCell>
                        <TableCell colSpan={7} className="text-muted-foreground text-sm">
                          Grupo pequeno demais para divulgar — os números apontariam para uma pessoa.
                        </TableCell>
                        <TableCell className="text-right">
                          {s.alertas > 0 ? (
                            <span className="bg-sev-5-soft text-sev-5 rounded-full px-2 py-0.5 text-xs font-semibold tnum">
                              {s.alertas}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow
                        key={s.setorId}
                        onClick={() => setSelecionado(s.setorId)}
                        data-state={setorAtivo === s.setorId ? "selected" : undefined}
                        className="bg-card cursor-pointer"
                      >
                        <TableCell className={cn("font-medium", COLUNA_FIXA)}>
                          {nomeSetor(s.setorId)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {unidadeDoSetor(s.setorId)}
                        </TableCell>
                        <TableCell className="text-right tnum">{s.totalColaboradores}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Progress
                              value={s.percentualRecorrente ?? 0}
                              className="w-20"
                              indicatorClassName={corProporcao(s.percentualRecorrente ?? 0)}
                            />
                            <span className="tnum text-sm">
                              {s.pessoasRecorrentes} · {pct(s.percentualRecorrente ?? 0)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tnum text-sm">
                          {pct(s.taxaDesconforto ?? 0)}
                        </TableCell>
                        <TableCell className="text-right tnum">{s.queixas}</TableCell>
                        <TableCell>
                          {(s.queixas ?? 0) > 0 ? (
                            <SeloIntensidade valor={s.intensidadeMedia ?? 0} />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {s.regiaoTop ? rotuloCurto(s.regiaoTop) : "—"}
                        </TableCell>
                        <TableCell className="text-right tnum text-sm">
                          {pct(s.adesao ?? 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          {s.alertas > 0 ? (
                            <span className="bg-sev-5-soft text-sev-5 rounded-full px-2 py-0.5 text-xs font-semibold tnum">
                              {s.alertas}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ),
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="space-y-2 md:hidden">
            {linhas.map((s) => (
              <Card
                key={s.setorId}
                onClick={() => setSelecionado(s.setorId)}
                className={cn(
                  "cursor-pointer",
                  setorAtivo === s.setorId && "border-primary",
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{nomeSetor(s.setorId)}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {unidadeDoSetor(s.setorId)}
                      </p>
                    </div>
                    {s.alertas > 0 && (
                      <span className="bg-sev-5-soft text-sev-5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tnum">
                        {s.alertas} {s.alertas === 1 ? "alerta" : "alertas"}
                      </span>
                    )}
                  </div>

                  {s.suprimido ? (
                    <p className="text-muted-foreground mt-3 text-sm">
                      Grupo pequeno demais para divulgar — os números apontariam para uma pessoa.
                    </p>
                  ) : (
                    <dl className="mt-3 grid grid-cols-3 gap-3">
                      <div>
                        <dt className="text-muted-foreground text-[11px] uppercase tracking-wide">
                          Recorrente
                        </dt>
                        <dd className="tnum text-sm font-medium">
                          {pct(s.percentualRecorrente ?? 0)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground text-[11px] uppercase tracking-wide">
                          Desconforto
                        </dt>
                        <dd className="tnum text-sm font-medium">{pct(s.taxaDesconforto ?? 0)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground text-[11px] uppercase tracking-wide">
                          Pessoas
                        </dt>
                        <dd className="tnum text-sm font-medium">{s.totalColaboradores}</dd>
                      </div>
                    </dl>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {setorAtivo && detalhe.dados && (
            <section className="mt-8">
              <h2 className="mb-3 text-lg font-semibold">
                {nomeSetor(setorAtivo)}{" "}
                <span className="text-muted-foreground text-sm font-normal">
                  · {unidadeDoSetor(setorAtivo)} · últimos {filtro.dias} dias
                </span>
              </h2>

              {detalhe.dados.suprimido ? (
                <RecorteSuprimido />
              ) : (
                <>
                  <div className="grid gap-4 lg:grid-cols-3">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Mapa do setor</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="flex justify-center">
                          <SeletorVista vista={vista} onChange={setVista} />
                        </div>
                        <div className="mx-auto mt-3 max-w-[170px]">
                          <MapaCorporal vista={vista} calor={montarCalor(detalhe.dados.calor)} />
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Regiões relatadas</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {detalhe.dados.regioes.length === 0 ? (
                          <p className="text-muted-foreground py-10 text-center text-sm">
                            Sem registros no período.
                          </p>
                        ) : (
                          <GraficoRegioes dados={detalhe.dados.regioes} limite={6} />
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">Evolução</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {(detalhe.dados.kpis?.queixas ?? 0) === 0 ? (
                          <p className="text-muted-foreground py-10 text-center text-sm">
                            Sem registros no período.
                          </p>
                        ) : (
                          <GraficoTendencia
                            serie={detalhe.dados.serie}
                            porSemana={detalhe.dados.porSemana}
                            altura={200}
                          />
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {(alertasDoSetor.dados?.itens.length ?? 0) > 0 && (
                    <div className={cn("mt-4 grid gap-4", "lg:grid-cols-2 xl:grid-cols-3")}>
                      {alertasDoSetor.dados?.itens.map((a) => (
                        <CartaoAlerta key={a.id} alerta={a} compacto />
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
