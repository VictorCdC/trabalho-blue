"use client";

import * as React from "react";
import { Link } from "@/components/link";
import { ClipboardListIcon } from "lucide-react";
import {
  CabecalhoPagina,
  EstadoVazio,
  Paginador,
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
import { api } from "@/lib/api";
import { tituloCaso } from "@/lib/casos";
import { dataBR, dataRelativa } from "@/lib/format";
import { useRecurso } from "@/lib/recurso";
import { useDados } from "@/lib/sessao";
import type { StatusCaso } from "@/lib/types";

const POR_PAGINA = 20;

export default function PaginaCasos() {
  return (
    <Protegido permissao="casos:ver">
      <Conteudo />
    </Protegido>
  );
}

function Conteudo() {
  const { nomeSetor } = useDados();
  const [aba, setAba] = React.useState<StatusCaso | "todos">("todos");
  const [pagina, setPagina] = React.useState(0);

  const lista = useRecurso(
    () => api.casos(aba, { limit: POR_PAGINA, offset: pagina * POR_PAGINA }),
    [aba, pagina],
    { chave: "casos" },
  );
  // as abas contam no banco: a tela nunca teve a lista inteira para somar
  const contagem = useRecurso(() => api.contagemCasos(), [], { chave: "casos/contagem" });

  React.useEffect(() => setPagina(0), [aba]);

  const c = contagem.dados;
  const itens = lista.dados?.itens ?? [];

  return (
    <>
      <CabecalhoPagina
        titulo="Casos"
        descricao="Cada alerta acompanhado vira um caso, com as ações tomadas e o resultado registrado."
      />

      <Tabs value={aba} onValueChange={(v) => setAba(v as StatusCaso | "todos")} className="mb-5">
        <TabsList>
          <TabsTrigger value="todos">Todos ({c?.todos ?? 0})</TabsTrigger>
          <TabsTrigger value="aberto">Abertos ({c?.aberto ?? 0})</TabsTrigger>
          <TabsTrigger value="em_andamento">Em andamento ({c?.emAndamento ?? 0})</TabsTrigger>
          <TabsTrigger value="resolvido">Resolvidos ({c?.resolvido ?? 0})</TabsTrigger>
        </TabsList>
      </Tabs>

      {lista.carregando ? (
        <div className="bg-muted h-64 animate-pulse rounded-xl" />
      ) : itens.length === 0 ? (
        <EstadoVazio
          Icone={ClipboardListIcon}
          titulo="Nenhum caso nesta aba"
          descricao="Casos são abertos a partir da tela de alertas, pelo SESMT."
        />
      ) : (
        <>
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
                  {itens.map((caso) => (
                    <TableRow key={caso.id} className="cursor-pointer">
                      <TableCell className="text-muted-foreground tnum">
                        <Link href={`/painel/casos/${caso.id}`} className="block">
                          #{caso.numero}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/painel/casos/${caso.id}`} className="block font-medium">
                          {tituloCaso(caso, nomeSetor)}
                        </Link>
                        <span className="text-muted-foreground text-xs">
                          Aberto em {dataBR(caso.abertoEm)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Link href={`/painel/casos/${caso.id}`} className="block">
                          <Badge variant="muted">
                            {caso.origem === "coletivo" ? "Coletivo" : "Individual"}
                          </Badge>
                          <span className="text-muted-foreground mt-1 block text-xs">
                            {caso.origem === "coletivo"
                              ? nomeSetor(caso.setorId)
                              : (caso.colaboradorNome ?? "Colaborador não identificado")}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground tnum text-sm">
                        {caso.acoesConcluidas}/{caso.acoesTotais}
                      </TableCell>
                      <TableCell>
                        <SeloSeveridade severidade={caso.severidade} />
                      </TableCell>
                      <TableCell>
                        <SeloStatus status={caso.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {dataRelativa(caso.atualizadoEm)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Paginador
            total={lista.dados?.total ?? 0}
            pagina={pagina}
            porPagina={POR_PAGINA}
            onPagina={setPagina}
            rotulo="casos"
          />
        </>
      )}
    </>
  );
}
