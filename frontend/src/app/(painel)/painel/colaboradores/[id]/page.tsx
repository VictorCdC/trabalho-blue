"use client";

import * as React from "react";
import { Link } from "@/components/link";
import { useParams } from "next/navigation";
import { ArrowLeftIcon, LoaderCircleIcon } from "lucide-react";
import { MapaCorporal, SeletorVista, montarCalor } from "@/components/mapa-corporal";
import { CartaoAlerta } from "@/components/painel/cartao-alerta";
import {
  CartaoKpi,
  EstadoVazio,
  Paginador,
  SeloStatus,
} from "@/components/painel/comuns";
import { GraficoRegioes, GraficoTendencia } from "@/components/painel/graficos-adiados";
import { Protegido } from "@/components/protegido";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { tituloCaso } from "@/lib/casos";
import {
  AGRAVANTE_LABEL,
  dataBR,
  dataRelativa,
  fundoIntensidade,
  iniciais,
  num,
  RELACAO_LABEL,
  TIPO_DOR_LABEL,
} from "@/lib/format";
import { useNavegar } from "@/lib/carregando";
import { invalidar, useRecurso } from "@/lib/recurso";
import { rotuloRegiao } from "@/lib/regioes";
import { useDados } from "@/lib/sessao";
import type { Alerta, Vista } from "@/lib/types";
import { cn } from "@/lib/utils";

const POR_PAGINA = 20;

export default function PaginaColaborador() {
  return (
    <Protegido permissao="dados:identificados">
      <Conteudo />
    </Protegido>
  );
}

function Conteudo() {
  const { id } = useParams<{ id: string }>();
  const { ir, voltar: aoVoltar } = useNavegar();
  const { nomeCargo, nomeSetor, nomeUnidade } = useDados();
  const [vista, setVista] = React.useState<Vista>("costas");
  const [abrindo, setAbrindo] = React.useState(false);
  const [pagina, setPagina] = React.useState(0);

  // a ficha já vem agregada e a abertura fica na trilha de auditoria do servidor
  const ficha = useRecurso(() => api.colaborador(id), [id]);
  const registros = useRecurso(
    () =>
      api.queixasDoColaborador(id, ficha.dados?.janelaDias ?? 90, {
        limit: POR_PAGINA,
        offset: pagina * POR_PAGINA,
      }),
    [id, pagina, ficha.dados?.janelaDias],
    { ativo: Boolean(ficha.dados) },
  );

  // idem à tela de caso: o caminho de volta continua na tela enquanto a ficha
  // carrega. A ficha em si não entra no cache de navegação — o servidor audita
  // a leitura, e desenhar do cache mostraria o dado antes do registro existir.
  const voltar = (
    <Button
      variant="ghost"
      size="sm"
      className="text-muted-foreground mb-4 -ml-2"
      onClick={aoVoltar}
    >
      <ArrowLeftIcon /> Voltar
    </Button>
  );

  if (ficha.carregando) {
    return (
      <>
        {voltar}
        <Skeleton className="h-96 rounded-xl" />
      </>
    );
  }

  if (!ficha.dados) {
    return (
      <div className="py-20 text-center">
        <p className="font-medium">Colaborador não encontrado</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/painel/colaboradores">Voltar</Link>
        </Button>
      </div>
    );
  }

  const dados = ficha.dados;
  const pessoa = dados.colaborador;

  async function abrirCaso(alerta: Alerta) {
    setAbrindo(true);
    const caso = await api.abrirCaso(alerta.id);
    invalidar("menu/casos", "menu/alertas", "casos", "casos/contagem", "alertas", "painel/alertas");
    setAbrindo(false);
    ir(`/painel/casos/${caso.id}`);
  }

  return (
    <>
      {voltar}

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
            <Badge variant="muted">CPF {pessoa.cpfMascarado}</Badge>
            {pessoa.admissaoEm && <Badge variant="muted">Admissão {dataBR(pessoa.admissaoEm)}</Badge>}
            <Badge variant="muted">{dados.sequenciaCheckin} dias seguidos de check-in</Badge>
          </div>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoKpi
          rotulo="Queixas em 30 dias"
          valor={dados.queixas30Dias}
          detalhe={`${dados.queixasJanela} em ${dados.janelaDias} dias`}
        />
        <CartaoKpi
          rotulo="Intensidade média"
          valor={dados.queixas30Dias ? num(dados.intensidadeMedia30Dias) : "—"}
          detalhe="Escala de 1 a 5"
          destaque={dados.intensidadeMedia30Dias >= 4 ? "alerta" : undefined}
        />
        <CartaoKpi
          rotulo="Check-ins em 30 dias"
          valor={dados.checkins30Dias}
          detalhe={`${dados.checkinsBem30Dias} dias sem desconforto`}
          subirEhRuim={false}
        />
        <CartaoKpi
          rotulo="Alertas ativos"
          valor={dados.alertas.length}
          detalhe={
            dados.casos.length ? `${dados.casos.length} caso(s) registrado(s)` : "Nenhum caso aberto"
          }
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
                onAbrirCaso={a.casoId || abrindo ? undefined : abrirCaso}
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
                <span className="flex-1 text-sm font-medium">{tituloCaso(c, nomeSetor)}</span>
                <span className="text-muted-foreground text-xs">
                  {c.acoesConcluidas}/{c.acoesTotais} ações
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
            <CardTitle className="text-sm">Mapa dos últimos {dados.janelaDias} dias</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex justify-center">
              <SeletorVista vista={vista} onChange={setVista} />
            </div>
            <div className="mx-auto mt-3 max-w-[170px]">
              <MapaCorporal vista={vista} calor={montarCalor(dados.calor)} />
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
            {dados.queixasJanela === 0 ? (
              <p className="text-muted-foreground py-10 text-center text-sm">Sem registros.</p>
            ) : (
              <GraficoTendencia serie={dados.serie} porSemana altura={200} />
            )}
          </CardContent>
        </Card>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">
          Registros ({registros.dados?.total ?? dados.queixasJanela})
        </h2>
        {(registros.dados?.total ?? 0) === 0 ? (
          <EstadoVazio titulo={`Nenhuma queixa registrada nos últimos ${dados.janelaDias} dias`} />
        ) : (
          <>
            <ol className="space-y-2">
              {registros.dados?.itens.map((q) => (
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
            <Paginador
              total={registros.dados?.total ?? 0}
              pagina={pagina}
              porPagina={POR_PAGINA}
              onPagina={setPagina}
              rotulo="registros"
            />
          </>
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
