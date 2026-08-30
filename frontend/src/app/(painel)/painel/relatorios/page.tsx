"use client";

import * as React from "react";
import { DownloadIcon, FileSpreadsheetIcon } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  agruparPorSemana,
  calcularKpis,
  distribuicaoIntensidade,
  porRegiao,
  serieDiaria,
} from "@/lib/analytics";
import {
  AGRAVANTE_LABEL,
  num,
  pct,
  RELACAO_LABEL,
  TIPO_DOR_LABEL,
} from "@/lib/format";
import { useFiltros } from "@/lib/filtros";
import { pode } from "@/lib/rbac";
import { rotuloCurto } from "@/lib/regioes";
import { useDados, useSessao } from "@/lib/sessao";
import type { Agravante, RelacaoTrabalho, TipoDor } from "@/lib/types";

export default function PaginaRelatorios() {
  const { usuario } = useSessao();
  const { nomeCargo, nomeSetor } = useDados();
  const recorte = useFiltros({ dias: 90 });

  const identificar = pode(usuario?.role, "dados:identificados");
  const { queixas, checkins, colaboradores, historicoQueixas, historicoCheckins, filtro } = recorte;

  const kpis = React.useMemo(
    () => calcularKpis(historicoQueixas, historicoCheckins, colaboradores, filtro.dias),
    [historicoQueixas, historicoCheckins, colaboradores, filtro.dias],
  );

  const serie = React.useMemo(() => {
    const s = serieDiaria(queixas, checkins, filtro.dias);
    return filtro.dias > 45 ? agruparPorSemana(s) : s;
  }, [queixas, checkins, filtro.dias]);

  const regioes = React.useMemo(() => porRegiao(queixas), [queixas]);

  const porCargo = React.useMemo(() => {
    const porId = new Map<string, { total: number; pessoas: Set<string>; ints: number[] }>();
    const quadro = new Map<string, number>();
    for (const c of colaboradores) {
      if (!c.cargoId) continue;
      quadro.set(c.cargoId, (quadro.get(c.cargoId) ?? 0) + 1);
    }
    const cargoDe = new Map(colaboradores.map((c) => [c.id, c.cargoId]));
    const setorDe = new Map(colaboradores.map((c) => [c.id, c.setorId]));
    const setorDoCargo = new Map<string, string | null>();
    for (const q of queixas) {
      const cargoId = cargoDe.get(q.colaboradorId);
      if (!cargoId) continue;
      setorDoCargo.set(cargoId, setorDe.get(q.colaboradorId) ?? null);
      let e = porId.get(cargoId);
      if (!e) porId.set(cargoId, (e = { total: 0, pessoas: new Set(), ints: [] }));
      e.total += 1;
      e.pessoas.add(q.colaboradorId);
      e.ints.push(q.intensidade);
    }
    return [...porId.entries()]
      .map(([cargoId, e]) => {
        const efetivo = quadro.get(cargoId) ?? 0;
        return {
          cargoId,
          setorId: setorDoCargo.get(cargoId) ?? null,
          efetivo,
          pessoas: e.pessoas.size,
          total: e.total,
          intensidadeMedia: e.ints.reduce((a, b) => a + b, 0) / e.ints.length,
          percentual: efetivo ? (e.pessoas.size / efetivo) * 100 : 0,
        };
      })
      .sort((a, b) => b.percentual - a.percentual);
  }, [queixas, colaboradores]);

  const contarPor = React.useCallback(
    function <T extends string>(chave: (q: (typeof queixas)[number]) => T, rotulos: Record<T, string>) {
      const m = new Map<T, number>();
      for (const q of queixas) m.set(chave(q), (m.get(chave(q)) ?? 0) + 1);
      return (Object.keys(rotulos) as T[])
        .map((k) => ({ chave: k, rotulo: rotulos[k], total: m.get(k) ?? 0 }))
        .filter((x) => x.total > 0)
        .sort((a, b) => b.total - a.total);
    },
    [queixas],
  );

  const tipos = contarPor<TipoDor>((q) => q.tipo, TIPO_DOR_LABEL);
  const agravantes = contarPor<Agravante>((q) => q.agrava, AGRAVANTE_LABEL);
  const relacoes = contarPor<RelacaoTrabalho>((q) => q.relacaoTrabalho, RELACAO_LABEL);

  return (
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
        <BarraFiltros recorte={recorte} />
      </div>

      {!identificar && <AvisoAnonimo />}

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

      {queixas.length === 0 ? (
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
              <CardTitle>{filtro.dias > 45 ? "Queixas por semana" : "Queixas por dia"}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <GraficoTendencia serie={serie} porSemana={filtro.dias > 45} altura={260} />
            </CardContent>
          </Card>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Regiões do corpo</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <GraficoRegioes dados={regioes} limite={10} />
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Intensidade relatada</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <BarraIntensidade distribuicao={distribuicaoIntensidade(queixas)} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Percepção de nexo com o trabalho</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {relacoes.map((r) => (
                    <div key={r.chave}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span>{r.rotulo}</span>
                        <span className="text-muted-foreground tnum">
                          {r.total} · {pct((r.total / queixas.length) * 100)}
                        </span>
                      </div>
                      <Progress value={(r.total / queixas.length) * 100} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <ListaContagem titulo="Como a dor é descrita" itens={tipos} total={queixas.length} />
            <ListaContagem titulo="O que faz piorar" itens={agravantes} total={queixas.length} />
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
                  {porCargo.map((c) => (
                    <TableRow key={c.cargoId}>
                      <TableCell className="font-medium">{nomeCargo(c.cargoId)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {nomeSetor(c.setorId)}
                      </TableCell>
                      <TableCell className="text-right tnum">{c.efetivo}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Progress
                            value={c.percentual}
                            className="w-20"
                            indicatorClassName={corProporcao(c.percentual)}
                          />
                          <span className="tnum text-sm">{pct(c.percentual)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tnum">{c.total}</TableCell>
                      <TableCell>
                        <SeloIntensidade valor={c.intensidadeMedia} />
                      </TableCell>
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
                  {regioes.map((r) => (
                    <TableRow key={r.regiao}>
                      <TableCell className="font-medium">{rotuloCurto(r.regiao)}</TableCell>
                      <TableCell className="text-right tnum">{r.total}</TableCell>
                      <TableCell className="text-right tnum">{r.pessoas}</TableCell>
                      <TableCell>
                        <SeloIntensidade valor={r.intensidadeMedia} />
                      </TableCell>
                      <TableCell className="text-right tnum">
                        {pct((r.total / queixas.length) * 100, 1)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <p className="text-muted-foreground mt-6 text-xs">
            Intensidade média geral do recorte: {num(kpis.intensidadeMedia)} · adesão ao check-in:{" "}
            {pct(kpis.adesao)}. Os números refletem percepção declarada pelos colaboradores e não
            constituem diagnóstico clínico.
          </p>
        </>
      )}
    </>
  );
}

function ListaContagem({
  titulo,
  itens,
  total,
}: {
  titulo: string;
  itens: Array<{ chave: string; rotulo: string; total: number }>;
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
              <span>{i.rotulo}</span>
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
