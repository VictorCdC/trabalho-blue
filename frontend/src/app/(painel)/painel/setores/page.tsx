"use client";

import * as React from "react";
import { Building2Icon } from "lucide-react";
import { MapaCorporal, SeletorVista, montarCalor } from "@/components/mapa-corporal";
import { CartaoAlerta } from "@/components/painel/cartao-alerta";
import {
  BarraFiltros,
  CabecalhoPagina,
  EstadoVazio,
  SeloIntensidade,
  corProporcao,
} from "@/components/painel/comuns";
import { GraficoRegioes, GraficoTendencia } from "@/components/painel/graficos";
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
import { agruparPorSemana, porRegiao, porRegiaoLado, porSetor, serieDiaria } from "@/lib/analytics";
import { pct } from "@/lib/format";
import { useFiltros } from "@/lib/filtros";
import { pode } from "@/lib/rbac";
import { rotuloCurto } from "@/lib/regioes";
import { useDados, useSessao } from "@/lib/sessao";
import type { Vista } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function PaginaSetores() {
  const { usuario } = useSessao();
  const { snapshot, alertas, nomeSetor, unidadeDoSetor } = useDados();
  const recorte = useFiltros();
  const [selecionado, setSelecionado] = React.useState<string | null>(null);
  const [vista, setVista] = React.useState<Vista>("costas");

  const identificar = pode(usuario?.role, "dados:identificados");
  const { queixas, checkins, colaboradores, filtro } = recorte;

  const resumos = React.useMemo(
    () => porSetor(queixas, checkins, colaboradores, filtro.dias),
    [queixas, checkins, colaboradores, filtro.dias],
  );

  const alertasPorSetor = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const a of alertas) {
      if (a.kind !== "coletivo") continue;
      m.set(a.setorId, (m.get(a.setorId) ?? 0) + 1);
    }
    return m;
  }, [alertas]);

  const setorAtivo = selecionado ?? resumos[0]?.setorId ?? null;

  const detalhe = React.useMemo(() => {
    if (!setorAtivo) return null;
    const ids = new Set(colaboradores.filter((c) => c.setorId === setorAtivo).map((c) => c.id));
    const qs = queixas.filter((q) => ids.has(q.colaboradorId));
    const cs = checkins.filter((c) => ids.has(c.colaboradorId));
    const serie = serieDiaria(qs, cs, filtro.dias);
    return {
      queixas: qs,
      regioes: porRegiao(qs),
      calor: montarCalor(porRegiaoLado(qs)),
      serie: filtro.dias > 45 ? agruparPorSemana(serie) : serie,
      alertas: alertas.filter((a) => a.kind === "coletivo" && a.setorId === setorAtivo),
    };
  }, [setorAtivo, colaboradores, queixas, checkins, filtro.dias, alertas]);

  return (
    <>
      <CabecalhoPagina
        titulo="Setores"
        descricao="Onde o problema é do posto de trabalho e não da pessoa. Recorrência é o indicador que pede ação; a taxa de desconforto mostra o tamanho do incômodo no dia a dia."
      />

      <div className="mb-6">
        <BarraFiltros recorte={recorte} />
      </div>

      {resumos.length === 0 ? (
        <EstadoVazio Icone={Building2Icon} titulo="Nenhum setor no recorte selecionado" />
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Setor</TableHead>
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
                  {resumos.map((s) => (
                    <TableRow
                      key={s.setorId}
                      onClick={() => setSelecionado(s.setorId)}
                      data-state={setorAtivo === s.setorId ? "selected" : undefined}
                      className="cursor-pointer"
                    >
                      <TableCell className="font-medium">{nomeSetor(s.setorId)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {unidadeDoSetor(s.setorId)}
                      </TableCell>
                      <TableCell className="text-right tnum">{s.totalColaboradores}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Progress
                            value={s.percentualRecorrente}
                            className="w-20"
                            indicatorClassName={corProporcao(s.percentualRecorrente)}
                          />
                          <span className="tnum text-sm">
                            {s.pessoasRecorrentes} · {pct(s.percentualRecorrente)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tnum text-sm">
                        {pct(s.taxaDesconforto)}
                      </TableCell>
                      <TableCell className="text-right tnum">{s.queixas}</TableCell>
                      <TableCell>
                        {s.queixas > 0 ? <SeloIntensidade valor={s.intensidadeMedia} /> : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {s.regiaoTop ? rotuloCurto(s.regiaoTop) : "—"}
                      </TableCell>
                      <TableCell className="text-right tnum text-sm">{pct(s.adesao)}</TableCell>
                      <TableCell className="text-right">
                        {alertasPorSetor.get(s.setorId) ? (
                          <span className="bg-sev-5-soft text-sev-5 rounded-full px-2 py-0.5 text-xs font-semibold tnum">
                            {alertasPorSetor.get(s.setorId)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {setorAtivo && detalhe && (
            <section className="mt-8">
              <h2 className="mb-3 text-lg font-semibold">
                {nomeSetor(setorAtivo)}{" "}
                <span className="text-muted-foreground text-sm font-normal">
                  · {unidadeDoSetor(setorAtivo)} · últimos {filtro.dias} dias
                </span>
              </h2>

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
                      <MapaCorporal vista={vista} calor={detalhe.calor} />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Regiões relatadas</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {detalhe.regioes.length === 0 ? (
                      <p className="text-muted-foreground py-10 text-center text-sm">
                        Sem registros no período.
                      </p>
                    ) : (
                      <GraficoRegioes dados={detalhe.regioes} limite={6} />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Evolução</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {detalhe.queixas.length === 0 ? (
                      <p className="text-muted-foreground py-10 text-center text-sm">
                        Sem registros no período.
                      </p>
                    ) : (
                      <GraficoTendencia
                        serie={detalhe.serie}
                        porSemana={filtro.dias > 45}
                        altura={200}
                      />
                    )}
                  </CardContent>
                </Card>
              </div>

              {detalhe.alertas.length > 0 && (
                <div className={cn("mt-4 grid gap-4", "lg:grid-cols-2 xl:grid-cols-3")}>
                  {detalhe.alertas.map((a) => (
                    <CartaoAlerta key={a.id} alerta={a} identificar={identificar} compacto />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
