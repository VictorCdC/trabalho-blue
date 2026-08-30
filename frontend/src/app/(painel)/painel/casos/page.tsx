"use client";

import * as React from "react";
import Link from "next/link";
import { ClipboardListIcon } from "lucide-react";
import {
  CabecalhoPagina,
  EstadoVazio,
  SeloSeveridade,
  SeloStatus,
} from "@/components/painel/comuns";
import { Protegido } from "@/components/protegido";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dataBR, dataRelativa } from "@/lib/format";
import { pode } from "@/lib/rbac";
import { useDados, useSessao } from "@/lib/sessao";
import type { StatusCaso } from "@/lib/types";

export default function PaginaCasos() {
  return (
    <Protegido permissao="casos:ver">
      <Conteudo />
    </Protegido>
  );
}

function Conteudo() {
  const { usuario } = useSessao();
  const { snapshot, colaborador, nomeSetor } = useDados();
  const [aba, setAba] = React.useState<StatusCaso | "todos">("todos");

  const identificar = pode(usuario?.role, "dados:identificados");
  const casos = React.useMemo(
    () =>
      [...(snapshot?.casos ?? [])].sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm)),
    [snapshot],
  );

  const lista = casos.filter((c) => (aba === "todos" ? true : c.status === aba));
  const contar = (s: StatusCaso) => casos.filter((c) => c.status === s).length;

  return (
    <>
      <CabecalhoPagina
        titulo="Casos"
        descricao="Cada alerta acompanhado vira um caso, com as ações tomadas e o resultado registrado."
      />

      <Tabs value={aba} onValueChange={(v) => setAba(v as StatusCaso | "todos")} className="mb-5">
        <TabsList>
          <TabsTrigger value="todos">Todos ({casos.length})</TabsTrigger>
          <TabsTrigger value="aberto">Abertos ({contar("aberto")})</TabsTrigger>
          <TabsTrigger value="em_andamento">Em andamento ({contar("em_andamento")})</TabsTrigger>
          <TabsTrigger value="resolvido">Resolvidos ({contar("resolvido")})</TabsTrigger>
        </TabsList>
      </Tabs>

      {lista.length === 0 ? (
        <EstadoVazio
          Icone={ClipboardListIcon}
          titulo="Nenhum caso nesta aba"
          descricao="Casos são abertos a partir da tela de alertas, pelo SESMT."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Nº</TableHead>
                  <TableHead>Caso</TableHead>
                  <TableHead>Alvo</TableHead>
                  <TableHead>Ações</TableHead>
                  <TableHead>Severidade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Atualizado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((c) => {
                  const pessoa = c.colaboradorId ? colaborador(c.colaboradorId) : undefined;
                  const feitas = c.acoes.filter((a) => a.concluida).length;
                  return (
                    <TableRow key={c.id} className="cursor-pointer">
                      <TableCell className="text-muted-foreground tnum">
                        <Link href={`/painel/casos/${c.id}`} className="block">
                          #{c.numero}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/painel/casos/${c.id}`} className="block font-medium">
                          {c.titulo}
                        </Link>
                        <span className="text-muted-foreground text-xs">
                          Aberto em {dataBR(c.abertoEm)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Link href={`/painel/casos/${c.id}`} className="block">
                          <Badge variant="muted">
                            {c.origem === "coletivo" ? "Coletivo" : "Individual"}
                          </Badge>
                          <span className="text-muted-foreground mt-1 block text-xs">
                            {c.origem === "coletivo"
                              ? nomeSetor(c.setorId)
                              : identificar && pessoa
                                ? pessoa.nome
                                : `Colaborador de ${nomeSetor(pessoa?.setorId ?? null)}`}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground tnum text-sm">
                        {feitas}/{c.acoes.length}
                      </TableCell>
                      <TableCell>
                        <SeloSeveridade severidade={c.severidade} />
                      </TableCell>
                      <TableCell>
                        <SeloStatus status={c.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {dataRelativa(c.atualizadoEm)}
                      </TableCell>
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
