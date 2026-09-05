"use client";

import { DownloadIcon, FileSpreadsheetIcon } from "lucide-react";
import {
  AvisoAnonimo,
  BarraFiltros,
  CabecalhoPagina,
  CartaoKpi,
  EsqueletoPainel,
  EstadoVazio,
  RecorteSuprimido,
  SeloIntensidade,
  corProporcao,
} from "@/components/painel/comuns";
import { BarraIntensidade } from "@/components/painel/barra-intensidade";
import { GraficoRegioes, GraficoTendencia } from "@/components/painel/graficos-adiados";
import { Button } from "@/components/ui/button";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import {
  AGRAVANTE_LABEL,
  num,
  pct,
  RELACAO_LABEL,
  TIPO_DOR_LABEL,
} from "@/lib/format";
import { useFiltros } from "@/lib/filtros";
import { pode } from "@/lib/rbac";
import { useRecurso } from "@/lib/recurso";
import { rotuloCurto } from "@/lib/regioes";
import { useDados, useSessao } from "@/lib/sessao";
import type { ContagemRotulada, RelacaoTrabalho } from "@/lib/types";

export default function PaginaRelatorios() {
  const { usuario } = useSessao();
  const { nomeCargo, nomeSetor } = useDados();
  const filtros = useFiltros({ dias: 90 });

  const identificar = pode(usuario?.role, "dados:identificados");
  const { filtro, recorte } = filtros;

  const painel = useRecurso(() => api.painelResumo(recorte), [recorte], {
    chave: "painel/resumo",
  });
  const cargos = useRecurso(() => api.painelCargos(recorte), [recorte], {
    chave: "painel/cargos",
  });

  // cabeçalho, exportação e filtros não esperam a resposta
  const moldura = (
    <>
      <CabecalhoPagina
        titulo="Relatórios"
        descricao={`Consolidado dos últimos ${filtro.dias} dias — base para o PGR, o PCMSO e a análise ergonômica.`}
      >
        {(["PDF", "CSV"] as const).map((formato) => (
          <Tooltip key={formato}>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" disabled>
                {formato === "PDF" ? <DownloadIcon /> : <FileSpreadsheetIcon />}
                Exportar {formato}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              A exportação será gerada pelo backend — ainda não implementada.
            </TooltipContent>
          </Tooltip>
        ))}
      </CabecalhoPagina>

      <div className="mb-6">
        <BarraFiltros filtros={filtros} />
      </div>

      {!identificar && <AvisoAnonimo />}
    </>
  );

  if (painel.carregando || !painel.dados) {
    return (
      <>
        {moldura}
        <EsqueletoPainel />
      </>
    );
  }

  const dados = painel.dados;
  const kpis = dados.kpis;
  const totalQueixas = kpis?.queixas ?? 0;

  return (
    <>
      {moldura}

      {dados.suprimido || !kpis ? (
        <RecorteSuprimido />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <CartaoKpi
              rotulo="Colaboradores no recorte"
              valor={kpis.colaboradoresAtivos}
              detalhe={`${kpis.pessoasComQueixa} relataram algum desconforto`}
            />
            <CartaoKpi
              rotulo="Total de queixas"
              valor={kpis.queixas}
              variacao={kpis.variacaoQueixas}
              detalhe="Comparado ao período anterior de igual duração"
            />
            <CartaoKpi
              rotulo="Taxa de desconforto"
              valor={pct(kpis.taxaDesconforto)}
              detalhe={`Dias com queixa sobre dias registrados · ${kpis.pessoasRecorrentes} pessoas com recorrência`}
              destaque={kpis.taxaDesconforto >= 25 ? "alerta" : undefined}
            />
            <CartaoKpi
              rotulo="Apontam nexo com o trabalho"
              valor={pct(kpis.relacaoTrabalhoSim)}
              detalhe="Percepção declarada pelo próprio colaborador"
            />
          </div>

          {totalQueixas === 0 ? (
            <div className="mt-8">
              <EstadoVazio
                titulo="Sem registros no recorte"
                descricao="Ajuste o período ou os filtros de unidade, setor e cargo."
              />
            </div>
          ) : (
            <>
              <Card className="mt-8">
                <CardHeader>
                  <CardTitle>
                    {dados.porSemana ? "Queixas por semana" : "Queixas por dia"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <GraficoTendencia
                    serie={dados.serie}
                    porSemana={dados.porSemana}
                    altura={260}
                  />
                </CardContent>
              </Card>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Regiões do corpo</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <GraficoRegioes dados={dados.regioes} limite={10} />
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Intensidade relatada</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <BarraIntensidade distribuicao={dados.intensidades} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Percepção de nexo com o trabalho</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      {dados.relacoes.map((r) => (
                        <div key={r.chave}>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span>{RELACAO_LABEL[r.chave as RelacaoTrabalho]}</span>
                            <span className="text-muted-foreground tnum">
                              {r.total} · {pct((r.total / totalQueixas) * 100)}
                            </span>
                          </div>
                          <Progress value={(r.total / totalQueixas) * 100} />
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <ListaContagem
                  titulo="Como a dor é descrita"
                  itens={dados.tipos}
                  rotulos={TIPO_DOR_LABEL}
                  total={totalQueixas}
                />
                <ListaContagem
                  titulo="O que faz piorar"
                  itens={dados.agravantes}
                  rotulos={AGRAVANTE_LABEL}
                  total={totalQueixas}
                />
              </div>

              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Por cargo — onde a função é o fator</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cargo</TableHead>
                        <TableHead>Setor</TableHead>
                        <TableHead className="text-right">Efetivo</TableHead>
                        <TableHead className="min-w-40">Proporção afetada</TableHead>
                        <TableHead className="text-right">Queixas</TableHead>
                        <TableHead>Intensidade</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(cargos.dados ?? []).map((c) => (
                        <TableRow key={c.cargoId}>
                          <TableCell className="font-medium">{nomeCargo(c.cargoId)}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {nomeSetor(c.setorId)}
                          </TableCell>
                          {c.suprimido ? (
                            <TableCell colSpan={4} className="text-muted-foreground text-sm">
                              Grupo pequeno demais para divulgar.
                            </TableCell>
                          ) : (
                            <>
                              <TableCell className="text-right tnum">{c.efetivo}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2.5">
                                  <Progress
                                    value={c.percentual ?? 0}
                                    className="w-20"
                                    indicatorClassName={corProporcao(c.percentual ?? 0)}
                                  />
                                  <span className="tnum text-sm">{pct(c.percentual ?? 0)}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right tnum">{c.total}</TableCell>
                              <TableCell>
                                <SeloIntensidade valor={c.intensidadeMedia ?? 0} />
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Detalhamento por região</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Região</TableHead>
                        <TableHead className="text-right">Registros</TableHead>
                        <TableHead className="text-right">Pessoas</TableHead>
                        <TableHead>Intensidade média</TableHead>
                        <TableHead className="text-right">% dos registros</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dados.regioes.map((r) => (
                        <TableRow key={r.regiao}>
                          <TableCell className="font-medium">{rotuloCurto(r.regiao)}</TableCell>
                          <TableCell className="text-right tnum">{r.total}</TableCell>
                          <TableCell className="text-right tnum">{r.pessoas}</TableCell>
                          <TableCell>
                            <SeloIntensidade valor={r.intensidadeMedia} />
                          </TableCell>
                          <TableCell className="text-right tnum">
                            {pct((r.total / totalQueixas) * 100, 1)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <p className="text-muted-foreground mt-6 text-xs">
                Intensidade média geral do recorte: {num(kpis.intensidadeMedia)} · adesão ao
                check-in: {pct(kpis.adesao)}. Os números refletem percepção declarada pelos
                colaboradores e não constituem diagnóstico clínico.
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}

function ListaContagem({
  titulo,
  itens,
  rotulos,
  total,
}: {
  titulo: string;
  itens: ContagemRotulada[];
  rotulos: Record<string, string>;
  total: number;
}) {
  const maior = Math.max(1, ...itens.map((i) => i.total));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 pt-0">
        {itens.map((i) => (
          <div key={i.chave}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span>{rotulos[i.chave] ?? i.chave}</span>
              <span className="text-muted-foreground tnum">
                {i.total} · {pct((i.total / total) * 100)}
              </span>
            </div>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div
                className="bg-chart-1 h-full rounded-full"
                style={{ width: `${(i.total / maior) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
