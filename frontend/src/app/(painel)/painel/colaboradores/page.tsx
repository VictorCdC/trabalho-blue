"use client";

import * as React from "react";
import { Link } from "@/components/link";
import { SearchIcon, UsersRoundIcon } from "lucide-react";
import {
  AvisoAnonimo,
  BarraFiltros,
  CabecalhoPagina,
  COLUNA_FIXA,
  EstadoVazio,
  Paginador,
  SeloIntensidade,
} from "@/components/painel/comuns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { dataBR, dataRelativa, iniciais } from "@/lib/format";
import { useFiltros } from "@/lib/filtros";
import { pode } from "@/lib/rbac";
import { useDebounce, useRecurso } from "@/lib/recurso";
import { rotuloRegiao } from "@/lib/regioes";
import { useDados, useSessao } from "@/lib/sessao";
import { cn } from "@/lib/utils";

const POR_PAGINA = 25;

export default function PaginaColaboradores() {
  const { usuario } = useSessao();
  const { nomeCargo, nomeSetor, nomeUnidade } = useDados();
  const filtros = useFiltros();
  const [busca, setBusca] = React.useState("");
  const [pagina, setPagina] = React.useState(0);

  const identificar = pode(usuario?.role, "dados:identificados");
  const { filtro, recorte } = filtros;

  // a busca vai para o `WHERE`; digitar não refaz conta nenhuma no navegador
  const termo = useDebounce(busca, 300);
  const lista = useRecurso(
    () =>
      api.colaboradores(recorte, termo || undefined, {
        limit: POR_PAGINA,
        offset: pagina * POR_PAGINA,
      }),
    [recorte, termo, pagina],
  );

  React.useEffect(() => setPagina(0), [recorte, termo]);

  const linhas = lista.dados?.itens ?? [];

  return (
    <>
      <CabecalhoPagina
        titulo="Colaboradores"
        descricao={
          identificar
            ? `Histórico individual dos últimos ${filtro.dias} dias. Uso restrito à saúde ocupacional.`
            : "Quadro de pessoal da empresa. Dados clínicos não aparecem no seu perfil."
        }
      >
        <div className="relative">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou CPF"
            className="h-9 w-full pl-9 sm:w-64"
          />
        </div>
      </CabecalhoPagina>

      <div className="mb-6">
        <BarraFiltros filtros={filtros} />
      </div>

      {!identificar && (
        <AvisoAnonimo>
          Você vê o cadastro (setor, cargo, admissão), mas não as queixas de cada pessoa. Histórico
          clínico identificado é exclusivo do SESMT — o servidor nem envia esses campos.
        </AvisoAnonimo>
      )}

      {lista.carregando ? (
        <div className="bg-muted h-64 animate-pulse rounded-xl" />
      ) : linhas.length === 0 ? (
        <EstadoVazio
          Icone={UsersRoundIcon}
          titulo="Nenhum colaborador encontrado"
          descricao="Ajuste a busca ou os filtros de unidade, setor e cargo."
        />
      ) : (
        <>
          {/* Do tablet para cima, a tabela; no celular, cartão — ver dez
              colunas rolando de lado não é ler uma lista. */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-card">
                    <TableHead className={COLUNA_FIXA}>Colaborador</TableHead>
                    <TableHead>Unidade / Setor</TableHead>
                    <TableHead>Cargo</TableHead>
                    {identificar ? (
                      <>
                        <TableHead className="text-right">Queixas</TableHead>
                        <TableHead>Intensidade</TableHead>
                        <TableHead>Região principal</TableHead>
                        <TableHead>Último registro</TableHead>
                        <TableHead className="text-right">Alertas</TableHead>
                      </>
                    ) : (
                      <>
                        <TableHead>CPF</TableHead>
                        <TableHead>Admissão</TableHead>
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((c) => {
                    const conteudoNome = (
                      <div className="flex items-center gap-2.5">
                        <Avatar className="size-8">
                          <AvatarFallback className="text-[10px]">
                            {iniciais(c.nome)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{c.nome}</span>
                      </div>
                    );
                    return (
                      <TableRow key={c.id} className={cn("bg-card", identificar && "cursor-pointer")}>
                        <TableCell className={COLUNA_FIXA}>
                          {identificar ? (
                            <Link href={`/painel/colaboradores/${c.id}`}>{conteudoNome}</Link>
                          ) : (
                            conteudoNome
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="block">{nomeSetor(c.setorId)}</span>
                          <span className="text-muted-foreground text-xs">
                            {nomeUnidade(c.unidadeId)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">{nomeCargo(c.cargoId)}</TableCell>
                        {identificar ? (
                          <>
                            <TableCell className="text-right tnum">{c.queixas ?? 0}</TableCell>
                            <TableCell>
                              {(c.queixas ?? 0) > 0 ? (
                                <SeloIntensidade valor={c.intensidadeMedia ?? 0} />
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="text-sm">
                              {c.regiaoTop ? rotuloRegiao(c.regiaoTop, "na") : "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {c.ultimaQueixaEm ? dataRelativa(c.ultimaQueixaEm) : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              {(c.alertas ?? 0) > 0 ? (
                                <Badge
                                  variant="outline"
                                  className="bg-sev-5-soft text-sev-5 border-sev-5/30"
                                >
                                  {c.alertas}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="text-muted-foreground tnum text-sm">
                              {c.cpfMascarado}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {c.admissaoEm ? dataBR(c.admissaoEm) : "—"}
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="space-y-2 md:hidden">
            {linhas.map((c) => {
              const cabecalho = (
                <div className="flex items-center gap-2.5">
                  <Avatar className="size-9">
                    <AvatarFallback className="text-[10px]">{iniciais(c.nome)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.nome}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {nomeSetor(c.setorId)} · {nomeCargo(c.cargoId)}
                    </p>
                  </div>
                </div>
              );
              return (
                <Card key={c.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      {identificar ? (
                        <Link href={`/painel/colaboradores/${c.id}`} className="min-w-0">
                          {cabecalho}
                        </Link>
                      ) : (
                        cabecalho
                      )}
                      {identificar && (c.alertas ?? 0) > 0 && (
                        <Badge
                          variant="outline"
                          className="bg-sev-5-soft text-sev-5 border-sev-5/30 shrink-0"
                        >
                          {c.alertas}
                        </Badge>
                      )}
                    </div>

                    <dl className="mt-3 grid grid-cols-3 gap-3">
                      {identificar ? (
                        <>
                          <div>
                            <dt className="text-muted-foreground text-[11px] uppercase tracking-wide">
                              Queixas
                            </dt>
                            <dd className="tnum text-sm font-medium">{c.queixas ?? 0}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground text-[11px] uppercase tracking-wide">
                              Região
                            </dt>
                            <dd className="truncate text-sm font-medium">
                              {c.regiaoTop ? rotuloRegiao(c.regiaoTop, "na") : "—"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground text-[11px] uppercase tracking-wide">
                              Último
                            </dt>
                            <dd className="text-sm font-medium">
                              {c.ultimaQueixaEm ? dataRelativa(c.ultimaQueixaEm) : "—"}
                            </dd>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="col-span-2">
                            <dt className="text-muted-foreground text-[11px] uppercase tracking-wide">
                              CPF
                            </dt>
                            <dd className="tnum text-sm font-medium">{c.cpfMascarado}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground text-[11px] uppercase tracking-wide">
                              Admissão
                            </dt>
                            <dd className="text-sm font-medium">
                              {c.admissaoEm ? dataBR(c.admissaoEm) : "—"}
                            </dd>
                          </div>
                        </>
                      )}
                    </dl>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Paginador
            total={lista.dados?.total ?? 0}
            pagina={pagina}
            porPagina={POR_PAGINA}
            onPagina={setPagina}
            rotulo="colaboradores"
          />
        </>
      )}
    </>
  );
}
