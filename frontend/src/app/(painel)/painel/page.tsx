"use client";

import * as React from "react";
import { Link } from "@/components/link";
import { ArrowRightIcon, ShieldCheckIcon, TriangleAlertIcon } from "lucide-react";
import { MapaCorporal, SeletorVista, montarCalor } from "@/components/mapa-corporal";
import { CartaoAlerta } from "@/components/painel/cartao-alerta";
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
import { api } from "@/lib/api";
import { num, pct } from "@/lib/format";
import { TODOS, useFiltros } from "@/lib/filtros";
import { pode } from "@/lib/rbac";
import { useRecurso } from "@/lib/recurso";
import { useDados, useSessao } from "@/lib/sessao";
import type { Vista } from "@/lib/types";

export default function PaginaVisaoGeral() {
  const { usuario } = useSessao();
  const { nomeSetor, unidadeDoSetor } = useDados();
  const filtros = useFiltros();
  const [vista, setVista] = React.useState<Vista>("costas");

  const identificar = pode(usuario?.role, "dados:identificados");
  const { filtro, recorte } = filtros;

  // toda a tela num pedido só: KPIs, série, regiões, mapa, distribuições e a
  // contagem de alertas já vêm somados do banco
  const painel = useRecurso(() => api.painelResumo(recorte), [recorte], {
    chave: "painel/resumo",
  });
  const setores = useRecurso(() => api.painelSetores(recorte), [recorte], {
    chave: "painel/setores",
  });
  const alertas = useRecurso(() => api.alertas(recorte, "todos", { limit: 3 }), [recorte], {
    chave: "painel/alertas",
  });

  // cabeçalho e filtros não dependem da resposta: ficam na tela enquanto ela
  // não chega, e continuam clicáveis
  const moldura = (
    <>
      <CabecalhoPagina
        titulo="Visão geral"
        descricao={`Últimos ${filtro.dias} dias${
          filtro.setorId !== TODOS ? ` · ${nomeSetor(filtro.setorId)}` : ""
        }`}
      />

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
  const contagem = dados.alertas;

  return (
    <>
      {moldura}

      {dados.suprimido || !kpis ? (
        <RecorteSuprimido />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <CartaoKpi
              rotulo="Adesão ao check-in"
              valor={pct(kpis.adesao)}
              detalhe={`${kpis.checkins} check-ins de ${kpis.colaboradoresAtivos} colaboradores`}
              subirEhRuim={false}
              destaque={kpis.adesao < 50 ? "alerta" : undefined}
            />
            <CartaoKpi
              rotulo="Queixas no período"
              valor={kpis.queixas}
              variacao={kpis.variacaoQueixas}
              detalhe={`${kpis.pessoasComQueixa} pessoas relataram algo · ${pct(kpis.taxaDesconforto)} dos dias registrados`}
            />
            <CartaoKpi
              rotulo="Com queixa recorrente"
              valor={pct(kpis.percentualRecorrente)}
              detalhe={`${kpis.pessoasRecorrentes} pessoas com 3+ registros na mesma região · intensidade média ${
                kpis.queixas ? num(kpis.intensidadeMedia) : "—"
              }`}
              destaque={kpis.percentualRecorrente >= 20 ? "alerta" : undefined}
            />
            <CartaoKpi
              rotulo="Alertas ativos"
              valor={contagem?.todos ?? 0}
              detalhe={`${contagem?.coletivos ?? 0} coletivos · ${contagem?.individuais ?? 0} individuais`}
              destaque={contagem && contagem.alta > 0 ? "alerta" : undefined}
            />
          </div>

          {/* Alertas prioritários */}
          <section className="mt-8">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <h2 className="text-lg font-semibold">Alertas que pedem ação</h2>
                <p className="text-muted-foreground text-sm">
                  Disparam com 3+ registros da mesma região pela mesma pessoa, ou 20% de um setor na
                  mesma região, em 30 dias.
                </p>
              </div>
              {(alertas.dados?.total ?? 0) > 3 && (
                <Button asChild variant="ghost" size="sm">
                  <Link href="/painel/alertas">
                    Ver todos <ArrowRightIcon />
                  </Link>
                </Button>
              )}
            </div>

            {(alertas.dados?.itens.length ?? 0) === 0 ? (
              <EstadoVazio
                Icone={ShieldCheckIcon}
                titulo="Nenhum alerta neste recorte"
                descricao="Nenhuma pessoa ou setor cruzou os limites de recorrência no período selecionado."
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {alertas.dados?.itens.map((a) => (
                  <CartaoAlerta key={a.id} alerta={a} compacto />
                ))}
              </div>
            )}
          </section>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>
                  {dados.porSemana ? "Queixas por semana" : "Queixas por dia"}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {kpis.queixas === 0 ? (
                  <p className="text-muted-foreground py-12 text-center text-sm">
                    Sem registros no período.
                  </p>
                ) : (
                  <GraficoTendencia serie={dados.serie} porSemana={dados.porSemana} altura={330} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Onde dói</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex justify-center">
                  <SeletorVista vista={vista} onChange={setVista} />
                </div>
                <div className="mx-auto mt-3 max-w-[180px]">
                  <MapaCorporal vista={vista} calor={montarCalor(dados.calor)} />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Regiões mais relatadas</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {dados.regioes.length === 0 ? (
                  <p className="text-muted-foreground py-12 text-center text-sm">
                    Sem registros no período.
                  </p>
                ) : (
                  <GraficoRegioes dados={dados.regioes} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Distribuição de intensidade</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 pt-0">
                <BarraIntensidade distribuicao={dados.intensidades} />
                <div className="border-t pt-4">
                  <p className="text-muted-foreground mb-3 text-sm">
                    <strong className="text-foreground tnum">{pct(kpis.relacaoTrabalhoSim)}</strong>{" "}
                    dos registros foram apontados pelo próprio colaborador como relacionados ao
                    trabalho.
                  </p>
                  <Progress value={kpis.relacaoTrabalhoSim} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Setores */}
          <section className="mt-8">
            <div className="mb-3 flex items-end justify-between">
              <h2 className="text-lg font-semibold">Setores por recorrência</h2>
              <Button asChild variant="ghost" size="sm">
                <Link href="/painel/setores">
                  Detalhar <ArrowRightIcon />
                </Link>
              </Button>
            </div>

            {(setores.dados?.length ?? 0) === 0 ? (
              <EstadoVazio Icone={TriangleAlertIcon} titulo="Nenhum setor no recorte" />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {setores.dados?.slice(0, 6).map((s) => (
                  <Card key={s.setorId}>
                    <CardContent className="space-y-3 py-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{nomeSetor(s.setorId)}</p>
                          <p className="text-muted-foreground truncate text-xs">
                            {unidadeDoSetor(s.setorId)}
                            {s.suprimido ? "" : ` · ${s.totalColaboradores} colaboradores`}
                          </p>
                        </div>
                        {!s.suprimido && (
                          <span className="text-xl font-semibold tnum">
                            {pct(s.percentualRecorrente ?? 0)}
                          </span>
                        )}
                      </div>
                      {s.suprimido ? (
                        <p className="text-muted-foreground text-xs">
                          Grupo pequeno demais para divulgar números sem identificar quem relatou.
                        </p>
                      ) : (
                        <>
                          <Progress
                            value={s.percentualRecorrente ?? 0}
                            indicatorClassName={corProporcao(s.percentualRecorrente ?? 0)}
                          />
                          <div className="text-muted-foreground flex items-center justify-between text-xs">
                            <span>
                              {s.pessoasRecorrentes} de {s.totalColaboradores} com recorrência ·{" "}
                              {pct(s.taxaDesconforto ?? 0)} dos dias
                            </span>
                            {(s.queixas ?? 0) > 0 && (
                              <SeloIntensidade valor={s.intensidadeMedia ?? 0} />
                            )}
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
