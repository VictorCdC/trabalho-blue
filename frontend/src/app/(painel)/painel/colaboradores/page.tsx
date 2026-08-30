"use client";

import * as React from "react";
import Link from "next/link";
import { SearchIcon, UsersRoundIcon } from "lucide-react";
import {
  AvisoAnonimo,
  BarraFiltros,
  CabecalhoPagina,
  EstadoVazio,
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
import { naJanela, porRegiao } from "@/lib/analytics";
import { cpfOculto, dataBR, dataRelativa, iniciais } from "@/lib/format";
import { useFiltros } from "@/lib/filtros";
import { pode } from "@/lib/rbac";
import { rotuloRegiao } from "@/lib/regioes";
import { useDados, useSessao } from "@/lib/sessao";

export default function PaginaColaboradores() {
  const { usuario } = useSessao();
  const { alertas, nomeCargo, nomeSetor, nomeUnidade } = useDados();
  const recorte = useFiltros();
  const [busca, setBusca] = React.useState("");

  const identificar = pode(usuario?.role, "dados:identificados");
  const { colaboradores, historicoQueixas, filtro } = recorte;

  const alertasPorPessoa = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const a of alertas) {
      if (a.kind !== "individual") continue;
      m.set(a.colaboradorId, (m.get(a.colaboradorId) ?? 0) + 1);
    }
    return m;
  }, [alertas]);

  const linhas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return colaboradores
      .filter((c) => !termo || c.nome.toLowerCase().includes(termo) || c.cpf.includes(termo))
      .map((c) => {
        const qs = historicoQueixas.filter(
          (q) => q.colaboradorId === c.id && naJanela(q.data, filtro.dias),
        );
        const regioes = porRegiao(qs);
        return {
          colaborador: c,
          queixas: qs.length,
          intensidadeMedia: regioes.length
            ? qs.reduce((a, q) => a + q.intensidade, 0) / qs.length
            : 0,
          regiaoTop: regioes[0]?.regiao ?? null,
          ultima: qs.length ? qs.reduce((a, b) => (a.data > b.data ? a : b)).data : null,
          alertas: alertasPorPessoa.get(c.id) ?? 0,
        };
      })
      .sort((a, b) => b.alertas - a.alertas || b.queixas - a.queixas);
  }, [colaboradores, historicoQueixas, filtro.dias, busca, alertasPorPessoa]);

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
        <BarraFiltros recorte={recorte} />
      </div>

      {!identificar && (
        <AvisoAnonimo>
          Você vê o cadastro (setor, cargo, admissão), mas não as queixas de cada pessoa. Histórico
          clínico identificado é exclusivo do SESMT.
        </AvisoAnonimo>
      )}

      {linhas.length === 0 ? (
        <EstadoVazio
          Icone={UsersRoundIcon}
          titulo="Nenhum colaborador encontrado"
          descricao="Ajuste a busca ou os filtros de unidade, setor e cargo."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Colaborador</TableHead>
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
                {linhas.map((l) => {
                  const c = l.colaborador;
                  const conteudoNome = (
                    <div className="flex items-center gap-2.5">
                      <Avatar className="size-8">
                        <AvatarFallback className="text-[10px]">{iniciais(c.nome)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{c.nome}</span>
                    </div>
                  );
                  return (
                    <TableRow key={c.id} className={identificar ? "cursor-pointer" : undefined}>
                      <TableCell>
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
                          <TableCell className="text-right tnum">{l.queixas}</TableCell>
                          <TableCell>
                            {l.queixas > 0 ? <SeloIntensidade valor={l.intensidadeMedia} /> : "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {l.regiaoTop ? rotuloRegiao(l.regiaoTop, "na") : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {l.ultima ? dataRelativa(l.ultima) : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {l.alertas > 0 ? (
                              <Badge variant="outline" className="bg-sev-5-soft text-sev-5 border-sev-5/30">
                                {l.alertas}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="text-muted-foreground tnum text-sm">
                            {cpfOculto(c.cpf)}
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
      )}
    </>
  );
}
