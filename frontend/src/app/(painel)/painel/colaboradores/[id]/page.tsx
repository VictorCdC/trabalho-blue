"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeftIcon, LoaderCircleIcon } from "lucide-react";
import { MapaCorporal, SeletorVista, montarCalor } from "@/components/mapa-corporal";
import { CartaoAlerta } from "@/components/painel/cartao-alerta";
import {
  CartaoKpi,
  EstadoVazio,
  SeloStatus,
} from "@/components/painel/comuns";
import { GraficoRegioes, GraficoTendencia } from "@/components/painel/graficos";
import { Protegido } from "@/components/protegido";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  agruparPorSemana,
  naJanela,
  porRegiao,
  porRegiaoLado,
  sequenciaCheckIn,
  serieDiaria,
} from "@/lib/analytics";
import { api } from "@/lib/api";
import {
  AGRAVANTE_LABEL,
  cpfOculto,
  dataBR,
  dataRelativa,
  fundoIntensidade,
  iniciais,
  num,
  RELACAO_LABEL,
  TIPO_DOR_LABEL,
} from "@/lib/format";
import { rotuloRegiao } from "@/lib/regioes";
import { useDados, useSessao } from "@/lib/sessao";
import type { Alerta, Vista } from "@/lib/types";
import { cn } from "@/lib/utils";

const JANELA = 90;

export default function PaginaColaborador() {
  return (
    <Protegido permissao="dados:identificados">
      <Conteudo />
    </Protegido>
  );
}

function Conteudo() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { usuario } = useSessao();
  const { snapshot, alertas, recarregar, colaborador, nomeCargo, nomeSetor, nomeUnidade } =
    useDados();
  const [vista, setVista] = React.useState<Vista>("costas");
  const [abrindo, setAbrindo] = React.useState(false);

  const pessoa = colaborador(id);

  const dados = React.useMemo(() => {
    if (!snapshot || !pessoa) return null;
    const queixas = snapshot.queixas
      .filter((q) => q.colaboradorId === pessoa.id && naJanela(q.data, JANELA))
      .sort((a, b) => b.data.localeCompare(a.data));
    const checkins = snapshot.checkins.filter(
      (c) => c.colaboradorId === pessoa.id && naJanela(c.data, JANELA),
    );
    const serie = serieDiaria(queixas, checkins, JANELA);
    return {
      queixas,
      checkins,
      regioes: porRegiao(queixas),
      calor: montarCalor(porRegiaoLado(queixas)),
      serie: agruparPorSemana(serie),
      casos: snapshot.casos.filter((c) => c.colaboradorId === pessoa.id),
      alertas: alertas.filter((a) => a.kind === "individual" && a.colaboradorId === pessoa.id),
    };
  }, [snapshot, pessoa, alertas]);

  if (!snapshot) return <div className="bg-muted h-96 animate-pulse rounded-xl" />;

  if (!pessoa || !dados) {
    return (
      <div className="py-20 text-center">
        <p className="font-medium">Colaborador não encontrado</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/painel/colaboradores">Voltar</Link>
        </Button>
      </div>
    );
  }

  const q30 = dados.queixas.filter((q) => naJanela(q.data, 30));
  const c30 = dados.checkins.filter((c) => naJanela(c.data, 30));
  const intensidade30 = q30.length ? q30.reduce((a, q) => a + q.intensidade, 0) / q30.length : 0;
  const casoPorAlerta = new Map(dados.casos.map((c) => [c.alertaId, c.id]));

  async function abrirCaso(alerta: Alerta) {
    if (!usuario) return;
    setAbrindo(true);
    const caso = await api.abrirCaso(alerta, usuario.id);
    await recarregar();
    setAbrindo(false);
    router.push(`/painel/casos/${caso.id}`);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground mb-4 -ml-2"
        onClick={() => router.push("/painel/colaboradores")}
      >
        <ArrowLeftIcon /> Colaboradores
      </Button>

      <header className="mb-6 flex flex-wrap items-start gap-4">
        <Avatar className="size-14">
          <AvatarFallback className="text-base">{iniciais(pessoa.nome)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{pessoa.nome}</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {nomeCargo(pessoa.cargoId)} · {nomeSetor(pessoa.setorId)} ·{" "}
            {nomeUnidade(pessoa.unidadeId)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Badge variant="muted">CPF {cpfOculto(pessoa.cpf)}</Badge>
            {pessoa.admissaoEm && <Badge variant="muted">Admissão {dataBR(pessoa.admissaoEm)}</Badge>}
            <Badge variant="muted">
              {sequenciaCheckIn(dados.checkins)} dias seguidos de check-in
            </Badge>
          </div>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoKpi
          rotulo="Queixas em 30 dias"
          valor={q30.length}
          detalhe={`${dados.queixas.length} em ${JANELA} dias`}
        />
        <CartaoKpi
          rotulo="Intensidade média"
          valor={q30.length ? num(intensidade30) : "—"}
          detalhe="Escala de 1 a 5"
          destaque={intensidade30 >= 4 ? "alerta" : undefined}
        />
        <CartaoKpi
          rotulo="Check-ins em 30 dias"
          valor={c30.length}
          detalhe={`${c30.filter((c) => c.estado === "bem").length} dias sem desconforto`}
          subirEhRuim={false}
        />
        <CartaoKpi
          rotulo="Alertas ativos"
          valor={dados.alertas.length}
          detalhe={dados.casos.length ? `${dados.casos.length} caso(s) registrado(s)` : "Nenhum caso aberto"}
          destaque={dados.alertas.length > 0 ? "alerta" : "ok"}
        />
      </div>

      {dados.alertas.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-semibold">Alertas</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {dados.alertas.map((a) => (
              <CartaoAlerta
                key={a.id}
                alerta={a}
                identificar
                casoId={casoPorAlerta.get(a.id)}
                onAbrirCaso={casoPorAlerta.get(a.id) || abrindo ? undefined : abrirCaso}
              />
            ))}
          </div>
        </section>
      )}

      {dados.casos.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-semibold">Casos</h2>
          <div className="space-y-2">
            {dados.casos.map((c) => (
              <Link
                key={c.id}
                href={`/painel/casos/${c.id}`}
                className="hover:bg-accent flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 transition-colors"
              >
                <span className="text-muted-foreground text-sm tnum">#{c.numero}</span>
                <span className="flex-1 text-sm font-medium">{c.titulo}</span>
                <span className="text-muted-foreground text-xs">
                  {c.acoes.filter((a) => a.concluida).length}/{c.acoes.length} ações
                </span>
                <SeloStatus status={c.status} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Mapa dos últimos {JANELA} dias</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex justify-center">
              <SeletorVista vista={vista} onChange={setVista} />
            </div>
            <div className="mx-auto mt-3 max-w-[170px]">
              <MapaCorporal vista={vista} calor={dados.calor} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Regiões relatadas</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {dados.regioes.length === 0 ? (
              <p className="text-muted-foreground py-10 text-center text-sm">Sem registros.</p>
            ) : (
              <GraficoRegioes dados={dados.regioes} limite={6} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Evolução semanal</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {dados.queixas.length === 0 ? (
              <p className="text-muted-foreground py-10 text-center text-sm">Sem registros.</p>
            ) : (
              <GraficoTendencia serie={dados.serie} porSemana altura={200} />
            )}
          </CardContent>
        </Card>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Registros ({dados.queixas.length})</h2>
        {dados.queixas.length === 0 ? (
          <EstadoVazio titulo="Nenhuma queixa registrada nos últimos 90 dias" />
        ) : (
          <ol className="space-y-2">
            {dados.queixas.map((q) => (
              <li key={q.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-start gap-3 py-3.5">
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-lg text-sm font-bold text-white",
                        fundoIntensidade(q.intensidade),
                      )}
                      title={`Intensidade ${q.intensidade} de 5`}
                    >
                      {q.intensidade}
                    </span>
                    <div className="min-w-48 flex-1">
                      <p className="font-medium">{rotuloRegiao(q.regiao, q.lado)}</p>
                      <p className="text-muted-foreground text-xs">
                        {dataBR(q.data)} · {dataRelativa(q.data)}
                      </p>
                      {q.observacao && (
                        <p className="text-muted-foreground mt-1.5 border-l-2 pl-2.5 text-sm italic">
                          “{q.observacao}”
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="muted">{TIPO_DOR_LABEL[q.tipo]}</Badge>
                      <Badge variant="muted">{AGRAVANTE_LABEL[q.agrava]}</Badge>
                      <Badge variant="muted">Trabalho: {RELACAO_LABEL[q.relacaoTrabalho]}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        )}
      </section>

      {abrindo && (
        <p className="text-muted-foreground mt-4 flex items-center gap-2 text-sm">
          <LoaderCircleIcon className="size-4 animate-spin" /> Abrindo caso…
        </p>
      )}
    </>
  );
}
