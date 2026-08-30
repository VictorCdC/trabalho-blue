"use client";

import * as React from "react";
import { Building2Icon, LoaderCircleIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { CabecalhoPagina } from "@/components/painel/comuns";
import { Protegido } from "@/components/protegido";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useDados, useSessao } from "@/lib/sessao";

type Novo =
  | { tipo: "unidade" }
  | { tipo: "setor"; unidadeId: string; unidadeNome: string }
  | { tipo: "cargo"; setorId: string; setorNome: string };

export default function PaginaEstrutura() {
  return (
    <Protegido permissao="estrutura:gerenciar">
      <Conteudo />
    </Protegido>
  );
}

function Conteudo() {
  const { empresaAtivaId } = useSessao();
  const { snapshot, recarregar } = useDados();
  const [novo, setNovo] = React.useState<Novo | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  const unidades = snapshot?.unidades ?? [];
  const setores = snapshot?.setores ?? [];
  const cargos = snapshot?.cargos ?? [];
  const usuarios = snapshot?.usuarios ?? [];

  async function remover(tipo: "setor" | "cargo", id: string) {
    setErro(null);
    try {
      if (tipo === "setor") await api.removerSetor(id);
      else await api.removerCargo(id);
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível remover.");
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Estrutura organizacional"
        descricao="Unidades, setores e cargos definem como os dados são agrupados nos relatórios e nos alertas coletivos."
      >
        <Button size="sm" onClick={() => setNovo({ tipo: "unidade" })}>
          <PlusIcon /> Nova unidade
        </Button>
      </CabecalhoPagina>

      {erro && (
        <p role="alert" className="text-destructive mb-4 text-sm font-medium">
          {erro}
        </p>
      )}

      <div className="space-y-4">
        {unidades.map((u) => {
          const setoresDaUnidade = setores.filter((s) => s.unidadeId === u.id);
          const pessoasUnidade = usuarios.filter(
            (x) => x.unidadeId === u.id && x.role === "colaborador",
          ).length;

          return (
            <Card key={u.id}>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <span className="bg-secondary text-secondary-foreground grid size-9 shrink-0 place-items-center rounded-lg">
                      <Building2Icon className="size-4.5" />
                    </span>
                    <div>
                      <p className="font-semibold">{u.nome}</p>
                      <p className="text-muted-foreground text-sm">
                        {u.cidade}/{u.uf} · {setoresDaUnidade.length} setores · {pessoasUnidade}{" "}
                        colaboradores
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setNovo({ tipo: "setor", unidadeId: u.id, unidadeNome: u.nome })}
                  >
                    <PlusIcon /> Setor
                  </Button>
                </div>

                {setoresDaUnidade.length === 0 ? (
                  <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
                    Nenhum setor cadastrado nesta unidade.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {setoresDaUnidade.map((s) => {
                      const cargosDoSetor = cargos.filter((c) => c.setorId === s.id);
                      const pessoas = usuarios.filter(
                        (x) => x.setorId === s.id && x.role === "colaborador",
                      ).length;
                      return (
                        <li key={s.id} className="bg-muted/40 rounded-lg border px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-medium">{s.nome}</p>
                              <p className="text-muted-foreground text-xs">
                                {pessoas} colaboradores · {cargosDoSetor.length} cargos
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setNovo({ tipo: "cargo", setorId: s.id, setorNome: s.nome })
                                }
                              >
                                <PlusIcon /> Cargo
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={`Remover setor ${s.nome}`}
                                title={
                                  pessoas > 0
                                    ? "Não é possível remover: há colaboradores neste setor"
                                    : "Remover setor"
                                }
                                disabled={pessoas > 0}
                                onClick={() => void remover("setor", s.id)}
                              >
                                <Trash2Icon className="text-destructive" />
                              </Button>
                            </div>
                          </div>

                          {cargosDoSetor.length > 0 && (
                            <ul className="mt-2.5 flex flex-wrap gap-1.5">
                              {cargosDoSetor.map((c) => {
                                const emUso = usuarios.some((x) => x.cargoId === c.id);
                                return (
                                  <li key={c.id}>
                                    <Badge variant="secondary" className="gap-1 py-1 pr-1">
                                      {c.nome}
                                      <button
                                        type="button"
                                        aria-label={`Remover cargo ${c.nome}`}
                                        title={
                                          emUso
                                            ? "Cargo em uso por colaboradores"
                                            : "Remover cargo"
                                        }
                                        disabled={emUso}
                                        onClick={() => void remover("cargo", c.id)}
                                        className="hover:bg-destructive/10 disabled:opacity-30 rounded p-0.5"
                                      >
                                        <Trash2Icon className="text-destructive size-3" />
                                      </button>
                                    </Badge>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <DialogoNovo
        novo={novo}
        empresaId={empresaAtivaId}
        onFechar={() => setNovo(null)}
        onSalvo={recarregar}
      />
    </>
  );
}

function DialogoNovo({
  novo,
  empresaId,
  onFechar,
  onSalvo,
}: {
  novo: Novo | null;
  empresaId: string | null;
  onFechar: () => void;
  onSalvo: () => Promise<void>;
}) {
  const [nome, setNome] = React.useState("");
  const [cidade, setCidade] = React.useState("");
  const [uf, setUf] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);

  React.useEffect(() => {
    setNome("");
    setCidade("");
    setUf("");
  }, [novo]);

  if (!novo) return null;
  const alvo = novo; // trava o estreitamento para uso dentro de salvar()

  const titulos = {
    unidade: "Nova unidade",
    setor: `Novo setor em ${novo.tipo === "setor" ? novo.unidadeNome : ""}`,
    cargo: `Novo cargo em ${novo.tipo === "cargo" ? novo.setorNome : ""}`,
  } as const;

  const valido =
    nome.trim().length > 1 && (novo.tipo !== "unidade" || (cidade.trim() && uf.trim().length === 2));

  async function salvar() {
    setSalvando(true);
    if (alvo.tipo === "unidade" && empresaId) {
      await api.criarUnidade({
        empresaId,
        nome: nome.trim(),
        cidade: cidade.trim(),
        uf: uf.trim().toUpperCase(),
      });
    } else if (alvo.tipo === "setor") {
      await api.criarSetor({ unidadeId: alvo.unidadeId, nome: nome.trim() });
    } else if (alvo.tipo === "cargo") {
      await api.criarCargo({ setorId: alvo.setorId, nome: nome.trim() });
    }
    await onSalvo();
    setSalvando(false);
    onFechar();
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{titulos[novo.tipo]}</DialogTitle>
          <DialogDescription>
            {novo.tipo === "cargo"
              ? "O cargo é o que permite identificar quando o problema vem da função, não do setor inteiro."
              : "Estrutura usada para agrupar os indicadores."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder={
                novo.tipo === "unidade"
                  ? "Ex.: Planta Sobral"
                  : novo.tipo === "setor"
                    ? "Ex.: Manutenção"
                    : "Ex.: Mecânico industrial"
              }
              autoFocus
            />
          </div>

          {novo.tipo === "unidade" && (
            <div className="grid grid-cols-[1fr_88px] gap-3">
              <div className="space-y-2">
                <Label htmlFor="cidade">Cidade</Label>
                <Input id="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="uf">UF</Label>
                <Input
                  id="uf"
                  value={uf}
                  maxLength={2}
                  onChange={(e) => setUf(e.target.value.toUpperCase())}
                  className="uppercase"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button disabled={!valido || salvando} onClick={() => void salvar()}>
            {salvando && <LoaderCircleIcon className="animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
