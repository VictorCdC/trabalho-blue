"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRightIcon, ShieldCheckIcon, TriangleAlertIcon } from "lucide-react";
import { MapaCorporal, SeletorVista, montarCalor } from "@/components/mapa-corporal";
import { CartaoAlerta } from "@/components/painel/cartao-alerta";
import {
  AvisoAnonimo,
  BarraFiltros,
  CabecalhoPagina,
  CartaoKpi,
  EstadoVazio,
  SeloIntensidade,
  corProporcao,
} from "@/components/painel/comuns";
import { BarraIntensidade, GraficoRegioes, GraficoTendencia } from "@/components/painel/graficos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  agruparPorSemana,
  calcularKpis,
  distribuicaoIntensidade,
  porRegiao,
  porRegiaoLado,
  porSetor,
  serieDiaria,
} from "@/lib/analytics";
import { num, pct } from "@/lib/format";
import { TODOS, useFiltros } from "@/lib/filtros";
import { pode } from "@/lib/rbac";
import { useDados, useSessao } from "@/lib/sessao";
import type { Vista } from "@/lib/types";

export default function PaginaVisaoGeral() {
  const { usuario } = useSessao();
  const { snapshot, alertas, nomeSetor, unidadeDoSetor } = useDados();
  const recorte = useFiltros();
  const [vista, setVista] = React.useState<Vista>("costas");

  const identificar = pode(usuario?.role, "dados:identificados");
  const { filtro, queixas, checkins, colaboradores, historicoQueixas, historicoCheckins } = recorte;

  const kpis = React.useMemo(
    () => calcularKpis(historicoQueixas, historicoCheckins, colaboradores, filtro.dias),
    [historicoQueixas, historicoCheckins, colaboradores, filtro.dias],
  );

  const serie = React.useMemo(() => {
    const s = serieDiaria(queixas, checkins, filtro.dias);
    return filtro.dias > 45 ? agruparPorSemana(s) : s;
  }, [queixas, checkins, filtro.dias]);

  const regioes = React.useMemo(() => porRegiao(queixas), [queixas]);
  const calor = React.useMemo(() => montarCalor(porRegiaoLado(queixas)), [queixas]);
  const setores = React.useMemo(
    () => porSetor(queixas, checkins, colaboradores, filtro.dias),
    [queixas, checkins, colaboradores, filtro.dias],
  );

  // alertas restritos ao recorte de unidade/setor/cargo
  const alertasDoRecorte = React.useMemo(() => {
    const ids = new Set(colaboradores.map((c) => c.id));
    const setoresVisiveis = new Set(colaboradores.map((c) => c.setorId));
    return alertas.filter((a) =>
      a.kind === "individual" ? ids.has(a.colaboradorId) : setoresVisiveis.has(a.setorId),
    );
  }, [alertas, colaboradores]);

  const casoPorAlerta = React.useMemo(
    () => new Map((snapshot?.casos ?? []).map((c) => [c.alertaId, c.id])),
    [snapshot],
  );

  if (!snapshot) return <div className="bg-muted h-96 animate-pulse rounded-xl" />;

  return (
    <>
      <CabecalhoPagina
        titulo="Visão geral"
        descricao={`Últimos ${filtro.dias} dias${
          filtro.setorId !== TODOS ? ` · ${nomeSetor(filtro.setorId)}` : ""
        }`}
      />

      <div className="mb-6">
        <BarraFiltros recorte={recorte} />
      </div>

      {!identificar && <AvisoAnonimo />}

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
          valor={alertasDoRecorte.length}
          detalhe={`${alertasDoRecorte.filter((a) => a.kind === "coletivo").length} coletivos · ${
            alertasDoRecorte.filter((a) => a.kind === "individual").length
          } individuais`}
          destaque={alertasDoRecorte.some((a) => a.severidade === "alta") ? "alerta" : undefined}
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
          {alertasDoRecorte.length > 3 && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/painel/alertas">
                Ver todos <ArrowRightIcon />
              </Link>
            </Button>
          )}
        </div>

        {alertasDoRecorte.length === 0 ? (
          <EstadoVazio
            Icone={ShieldCheckIcon}
            titulo="Nenhum alerta neste recorte"
            descricao="Nenhuma pessoa ou setor cruzou os limites de recorrência no período selecionado."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {alertasDoRecorte.slice(0, 3).map((a) => (
              <CartaoAlerta
                key={a.id}
                alerta={a}
                identificar={identificar}
                casoId={casoPorAlerta.get(a.id)}
                compacto
              />
            ))}
          </div>
        )}
      </section>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              {filtro.dias > 45 ? "Queixas por semana" : "Queixas por dia"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {queixas.length === 0 ? (
              <p className="text-muted-foreground py-12 text-center text-sm">
                Sem registros no período.
              </p>
            ) : (
              <GraficoTendencia serie={serie} porSemana={filtro.dias > 45} altura={330} />
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
              <MapaCorporal vista={vista} calor={calor} />
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
            {regioes.length === 0 ? (
              <p className="text-muted-foreground py-12 text-center text-sm">
                Sem registros no período.
              </p>
            ) : (
              <GraficoRegioes dados={regioes} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuição de intensidade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-0">
            <BarraIntensidade distribuicao={distribuicaoIntensidade(queixas)} />
            <div className="border-t pt-4">
              <p className="text-muted-foreground mb-3 text-sm">
                <strong className="text-foreground tnum">{pct(kpis.relacaoTrabalhoSim)}</strong> dos
                registros foram apontados pelo próprio colaborador como relacionados ao trabalho.
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

        {setores.length === 0 ? (
          <EstadoVazio Icone={TriangleAlertIcon} titulo="Nenhum setor no recorte" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {setores.slice(0, 6).map((s) => (
              <Card key={s.setorId}>
                <CardContent className="space-y-3 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{nomeSetor(s.setorId)}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {unidadeDoSetor(s.setorId)} · {s.totalColaboradores} colaboradores
                      </p>
                    </div>
                    <span className="text-xl font-semibold tnum">
                      {pct(s.percentualRecorrente)}
                    </span>
                  </div>
                  <Progress
                    value={s.percentualRecorrente}
                    indicatorClassName={corProporcao(s.percentualRecorrente)}
                  />
                  <div className="text-muted-foreground flex items-center justify-between text-xs">
                    <span>
                      {s.pessoasRecorrentes} de {s.totalColaboradores} com recorrência ·{" "}
                      {pct(s.taxaDesconforto)} dos dias
                    </span>
                    {s.queixas > 0 && <SeloIntensidade valor={s.intensidadeMedia} />}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
