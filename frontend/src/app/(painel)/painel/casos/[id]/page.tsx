"use client";

import * as React from "react";
import { Link } from "@/components/link";
import { useParams } from "next/navigation";
import {
  ArrowLeftIcon,
  CheckIcon,
  CircleDashedIcon,
  LoaderCircleIcon,
  PlusIcon,
  UserRoundIcon,
} from "lucide-react";
import { SeloSeveridade, SeloStatus } from "@/components/painel/comuns";
import { Protegido } from "@/components/protegido";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { tituloCaso } from "@/lib/casos";
import { dataBR, dataRelativa, STATUS_CASO_LABEL, TIPO_ACAO_LABEL } from "@/lib/format";
import { pode } from "@/lib/rbac";
import { useNavegar } from "@/lib/carregando";
import { invalidar, useRecurso } from "@/lib/recurso";
import { rotuloRegiao } from "@/lib/regioes";
import { useDados, useSessao } from "@/lib/sessao";
import type { Caso, StatusCaso, TipoAcao } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function PaginaCaso() {
  return (
    <Protegido permissao="casos:ver">
      <Conteudo />
    </Protegido>
  );
}

function Conteudo() {
  const { id } = useParams<{ id: string }>();
  const { voltar: aoVoltar } = useNavegar();
  const { usuario } = useSessao();
  const { nomeSetor, unidadeDoSetor } = useDados();

  const [tipo, setTipo] = React.useState<TipoAcao | "">("");
  const [descricao, setDescricao] = React.useState("");
  const [dialogo, setDialogo] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  // as mutações devolvem o caso inteiro; não é preciso recarregar a tela
  const [local, setLocal] = React.useState<Caso | null>(null);

  const { dados, carregando } = useRecurso(() => api.caso(id), [id]);
  const caso = local ?? dados;

  const identificar = pode(usuario?.role, "dados:identificados");
  const podeGerenciar = pode(usuario?.role, "casos:gerenciar");

  // o "voltar" não depende do caso: some da tela justo quando é mais útil
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

  if (carregando) {
    return (
      <>
        {voltar}
        <Skeleton className="h-96 rounded-xl" />
      </>
    );
  }

  if (!caso) {
    return (
      <div className="py-20 text-center">
        <p className="font-medium">Caso não encontrado</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/painel/casos">Voltar para casos</Link>
        </Button>
      </div>
    );
  }

  const acoes = [...caso.acoes].sort((a, b) => b.data.localeCompare(a.data));

  async function adicionar() {
    if (!tipo || !descricao.trim() || !caso) return;
    setSalvando(true);
    setLocal(await api.adicionarAcao(caso.id, { tipo, descricao: descricao.trim() }));
    setSalvando(false);
    setDialogo(false);
    setTipo("");
    setDescricao("");
  }

  return (
    <>
      {voltar}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm tnum">Caso #{caso.numero}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{tituloCaso(caso, nomeSetor)}</h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Badge variant="muted">{caso.origem === "coletivo" ? "Coletivo" : "Individual"}</Badge>
            <SeloSeveridade severidade={caso.severidade} />
            <SeloStatus status={caso.status} />
          </div>
        </div>

        {podeGerenciar && (
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="status" className="text-muted-foreground text-xs">
              Status
            </Label>
            <Select
              value={caso.status}
              onValueChange={(v) =>
                void api.mudarStatusCaso(caso.id, v as StatusCaso).then((atualizado) => {
                  setLocal(atualizado);
                  // resolver um caso muda o contador da barra e as abas da lista
                  invalidar("menu/casos", "menu/alertas", "casos", "casos/contagem", "alertas", "painel/alertas");
                })
              }
            >
              <SelectTrigger id="status" size="sm" className="min-w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_CASO_LABEL) as StatusCaso[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_CASO_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Timeline */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Ações tomadas</CardTitle>
            {podeGerenciar && (
              <Dialog open={dialogo} onOpenChange={setDialogo}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <PlusIcon /> Registrar ação
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Registrar ação</DialogTitle>
                    <DialogDescription>
                      O que foi feito ou o que será feito para tratar este caso.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="tipo-acao">Tipo de ação</Label>
                      <Select value={tipo} onValueChange={(v) => setTipo(v as TipoAcao)}>
                        <SelectTrigger id="tipo-acao" className="w-full">
                          <SelectValue placeholder="Selecione…" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(TIPO_ACAO_LABEL) as TipoAcao[]).map((t) => (
                            <SelectItem key={t} value={t}>
                              {TIPO_ACAO_LABEL[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="descricao-acao">Descrição</Label>
                      <Textarea
                        id="descricao-acao"
                        value={descricao}
                        onChange={(e) => setDescricao(e.target.value)}
                        placeholder="Ex.: bancadas reguladas e apoio de punho instalado nos 4 postos do turno da tarde."
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogo(false)}>
                      Cancelar
                    </Button>
                    <Button
                      disabled={!tipo || !descricao.trim() || salvando}
                      onClick={() => void adicionar()}
                    >
                      {salvando && <LoaderCircleIcon className="animate-spin" />}
                      Salvar ação
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </CardHeader>
          <CardContent>
            {acoes.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                Nenhuma ação registrada ainda.
              </p>
            ) : (
              <ol className="relative space-y-5 border-l pl-6">
                {acoes.map((a) => (
                  <li key={a.id} className="relative">
                    <button
                      type="button"
                      disabled={!podeGerenciar}
                      onClick={() =>
                        void api.concluirAcao(caso.id, a.id, !a.concluida).then(setLocal)
                      }
                      title={
                        podeGerenciar
                          ? a.concluida
                            ? "Marcar como pendente"
                            : "Marcar como concluída"
                          : undefined
                      }
                      className={cn(
                        "absolute -left-[31px] grid size-5 place-items-center rounded-full border-2",
                        a.concluida
                          ? "bg-sev-ok border-sev-ok text-white"
                          : "bg-card border-border text-muted-foreground",
                        podeGerenciar && "cursor-pointer",
                      )}
                    >
                      {a.concluida ? (
                        <CheckIcon className="size-3" strokeWidth={3} />
                      ) : (
                        <CircleDashedIcon className="size-3" />
                      )}
                    </button>
                    <p className="text-sm font-semibold">{TIPO_ACAO_LABEL[a.tipo]}</p>
                    <p className="text-muted-foreground mt-0.5 text-sm">{a.descricao}</p>
                    <p className="text-muted-foreground/70 mt-1 text-xs">
                      {dataBR(a.data)} · {dataRelativa(a.data)}
                      {!a.concluida && " · pendente"}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* Contexto */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Origem do caso</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0 text-sm">
              <Linha rotulo="Região" valor={rotuloRegiao(caso.regiao, caso.lado)} />
              {caso.origem === "coletivo" ? (
                <>
                  <Linha rotulo="Setor" valor={nomeSetor(caso.setorId)} />
                  <Linha rotulo="Unidade" valor={unidadeDoSetor(caso.setorId)} />
                </>
              ) : caso.colaboradorNome ? (
                <Linha rotulo="Colaborador" valor={caso.colaboradorNome} />
              ) : (
                <p className="text-muted-foreground">
                  Colaborador não identificado no seu perfil de acesso.
                </p>
              )}
              <Linha rotulo="Aberto em" valor={dataBR(caso.abertoEm)} />
              <Linha rotulo="Responsável" valor={caso.responsavelNome ?? "—"} />
            </CardContent>
          </Card>

          {identificar && caso.colaboradorId && (
            <Button asChild variant="outline" className="w-full">
              <Link href={`/painel/colaboradores/${caso.colaboradorId}`}>
                <UserRoundIcon /> Ver histórico do colaborador
              </Link>
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right font-medium">{valor}</span>
    </div>
  );
}
