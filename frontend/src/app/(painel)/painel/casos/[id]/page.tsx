"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { dataBR, dataRelativa, STATUS_CASO_LABEL, TIPO_ACAO_LABEL } from "@/lib/format";
import { rotuloRegiao } from "@/lib/regioes";
import { pode } from "@/lib/rbac";
import { useDados, useSessao } from "@/lib/sessao";
import type { StatusCaso, TipoAcao } from "@/lib/types";
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
  const router = useRouter();
  const { usuario } = useSessao();
  const { snapshot, recarregar, colaborador, nomeSetor, nomeCargo, unidadeDoSetor } = useDados();

  const [tipo, setTipo] = React.useState<TipoAcao | "">("");
  const [descricao, setDescricao] = React.useState("");
  const [dialogo, setDialogo] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);

  const caso = snapshot?.casos.find((c) => c.id === id);
  const identificar = pode(usuario?.role, "dados:identificados");
  const podeGerenciar = pode(usuario?.role, "casos:gerenciar");

  if (!snapshot) return <div className="bg-muted h-96 animate-pulse rounded-xl" />;

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

  const pessoa = caso.colaboradorId ? colaborador(caso.colaboradorId) : undefined;
  const responsavel = colaborador(caso.responsavelId);
  const acoes = [...caso.acoes].sort((a, b) => b.data.localeCompare(a.data));

  async function adicionar() {
    if (!usuario || !tipo || !descricao.trim()) return;
    setSalvando(true);
    await api.adicionarAcao(caso!.id, {
      tipo,
      descricao: descricao.trim(),
      autorId: usuario.id,
      concluida: false,
    });
    await recarregar();
    setSalvando(false);
    setDialogo(false);
    setTipo("");
    setDescricao("");
  }

  async function mudarStatus(s: StatusCaso) {
    await api.mudarStatusCaso(caso!.id, s);
    await recarregar();
  }

  async function alternarAcao(acaoId: string, concluida: boolean) {
    await api.concluirAcao(caso!.id, acaoId, concluida);
    await recarregar();
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground mb-4 -ml-2"
        onClick={() => router.push("/painel/casos")}
      >
        <ArrowLeftIcon /> Casos
      </Button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm tnum">Caso #{caso.numero}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{caso.titulo}</h1>
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
            <Select value={caso.status} onValueChange={(v) => void mudarStatus(v as StatusCaso)}>
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
                    <Button disabled={!tipo || !descricao.trim() || salvando} onClick={() => void adicionar()}>
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
                      onClick={() => void alternarAcao(a.id, !a.concluida)}
                      title={podeGerenciar ? (a.concluida ? "Marcar como pendente" : "Marcar como concluída") : undefined}
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
                      {dataBR(a.data)} · {dataRelativa(a.data)} ·{" "}
                      {colaborador(a.autorId)?.nome ?? "—"}
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
                  <Linha
                    rotulo="Unidade"
                    valor={caso.setorId ? unidadeDoSetor(caso.setorId) : "—"}
                  />
                </>
              ) : identificar && pessoa ? (
                <>
                  <Linha rotulo="Colaborador" valor={pessoa.nome} />
                  <Linha rotulo="Cargo" valor={nomeCargo(pessoa.cargoId)} />
                  <Linha rotulo="Setor" valor={nomeSetor(pessoa.setorId)} />
                </>
              ) : (
                <p className="text-muted-foreground">
                  Colaborador não identificado no seu perfil de acesso.
                </p>
              )}
              <Linha rotulo="Aberto em" valor={dataBR(caso.abertoEm)} />
              <Linha rotulo="Responsável" valor={responsavel?.nome ?? "—"} />
            </CardContent>
          </Card>

          {identificar && pessoa && (
            <Button asChild variant="outline" className="w-full">
              <Link href={`/painel/colaboradores/${pessoa.id}`}>
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
