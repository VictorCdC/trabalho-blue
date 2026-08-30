"use client";

import * as React from "react";
import { LoaderCircleIcon, SearchIcon, UserPlusIcon } from "lucide-react";
import { CabecalhoPagina, EstadoVazio } from "@/components/painel/comuns";
import { Protegido } from "@/components/protegido";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { cpfOculto, mascaraCPF, iniciais, ROLE_DESCRICAO, ROLE_LABEL } from "@/lib/format";
import { useDados, useSessao } from "@/lib/sessao";
import type { Role } from "@/lib/types";

const PAPEIS_ATRIBUIVEIS: Role[] = ["colaborador", "rh", "sesmt", "admin"];

export default function PaginaUsuarios() {
  return (
    <Protegido permissao="usuarios:gerenciar">
      <Conteudo />
    </Protegido>
  );
}

function Conteudo() {
  const { usuario, empresaAtivaId } = useSessao();
  const { snapshot, recarregar, nomeCargo, nomeSetor, nomeUnidade } = useDados();
  const [busca, setBusca] = React.useState("");
  const [aba, setAba] = React.useState<"todos" | "gestao" | "colaborador">("todos");
  const [dialogo, setDialogo] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  const usuarios = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (snapshot?.usuarios ?? [])
      .filter((u) => {
        if (aba === "gestao" && u.role === "colaborador") return false;
        if (aba === "colaborador" && u.role !== "colaborador") return false;
        if (!termo) return true;
        return u.nome.toLowerCase().includes(termo) || u.cpf.includes(termo);
      })
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [snapshot, busca, aba]);

  async function alternarAtivo(id: string, ativo: boolean) {
    await api.atualizarUsuario(id, { ativo });
    await recarregar();
  }

  async function mudarPapel(id: string, role: Role) {
    await api.atualizarUsuario(id, { role });
    await recarregar();
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Usuários e acessos"
        descricao="Quem entra na plataforma e o que cada perfil enxerga. Dado clínico identificado é exclusivo do SESMT."
      >
        <div className="relative">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou CPF"
            className="h-9 w-full pl-9 sm:w-56"
          />
        </div>
        <Button size="sm" onClick={() => setDialogo(true)}>
          <UserPlusIcon /> Novo usuário
        </Button>
      </CabecalhoPagina>

      {erro && (
        <p role="alert" className="text-destructive mb-4 text-sm font-medium">
          {erro}
        </p>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PAPEIS_ATRIBUIVEIS.map((r) => (
          <div key={r} className="bg-card rounded-lg border px-4 py-3">
            <p className="text-sm font-semibold">{ROLE_LABEL[r]}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">{ROLE_DESCRICAO[r]}</p>
            <p className="mt-1.5 text-lg font-semibold tnum">
              {(snapshot?.usuarios ?? []).filter((u) => u.role === r).length}
            </p>
          </div>
        ))}
      </div>

      <Tabs value={aba} onValueChange={(v) => setAba(v as typeof aba)} className="mb-5">
        <TabsList>
          <TabsTrigger value="todos">Todos</TabsTrigger>
          <TabsTrigger value="gestao">Gestão</TabsTrigger>
          <TabsTrigger value="colaborador">Colaboradores</TabsTrigger>
        </TabsList>
      </Tabs>

      {usuarios.length === 0 ? (
        <EstadoVazio titulo="Nenhum usuário encontrado" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Unidade / Setor</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead className="min-w-40">Perfil de acesso</TableHead>
                  <TableHead className="text-right">Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuarios.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="size-8">
                          <AvatarFallback className="text-[10px]">
                            {iniciais(u.nome)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <span className="block font-medium">{u.nome}</span>
                          {u.email && (
                            <span className="text-muted-foreground block text-xs">{u.email}</span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground tnum text-sm">
                      {cpfOculto(u.cpf)}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="block">{nomeSetor(u.setorId)}</span>
                      <span className="text-muted-foreground text-xs">
                        {nomeUnidade(u.unidadeId)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{nomeCargo(u.cargoId)}</TableCell>
                    <TableCell>
                      {u.id === usuario?.id ? (
                        <Badge variant="secondary">{ROLE_LABEL[u.role]} · você</Badge>
                      ) : (
                        <Select value={u.role} onValueChange={(v) => void mudarPapel(u.id, v as Role)}>
                          <SelectTrigger size="sm" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PAPEIS_ATRIBUIVEIS.map((r) => (
                              <SelectItem key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {u.id === usuario?.id ? (
                        <Badge variant="muted">Ativo</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant={u.ativo ? "ghost" : "outline"}
                          onClick={() => void alternarAtivo(u.id, !u.ativo)}
                        >
                          {u.ativo ? "Desativar" : "Reativar"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {dialogo && (
        <DialogoNovoUsuario
          empresaId={empresaAtivaId}
          onFechar={() => setDialogo(false)}
          onErro={setErro}
          onSalvo={recarregar}
        />
      )}
    </>
  );
}

function DialogoNovoUsuario({
  empresaId,
  onFechar,
  onErro,
  onSalvo,
}: {
  empresaId: string | null;
  onFechar: () => void;
  onErro: (m: string | null) => void;
  onSalvo: () => Promise<void>;
}) {
  const { snapshot } = useDados();
  const [nome, setNome] = React.useState("");
  const [cpf, setCpf] = React.useState("");
  const [nascimento, setNascimento] = React.useState("");
  const [role, setRole] = React.useState<Role>("colaborador");
  const [unidadeId, setUnidadeId] = React.useState("");
  const [setorId, setSetorId] = React.useState("");
  const [cargoId, setCargoId] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);

  const setores = (snapshot?.setores ?? []).filter((s) => s.unidadeId === unidadeId);
  const cargos = (snapshot?.cargos ?? []).filter((c) => c.setorId === setorId);

  const valido =
    nome.trim().length > 2 && cpf.length === 11 && nascimento.length === 10 && unidadeId && setorId;

  async function salvar() {
    if (!empresaId) return;
    onErro(null);
    setSalvando(true);
    try {
      await api.criarUsuario({
        empresaId,
        nome: nome.trim(),
        cpf,
        nascimento: new Date(nascimento).toISOString(),
        email: null,
        role,
        unidadeId,
        setorId,
        cargoId: cargoId || null,
        admissaoEm: new Date().toISOString(),
      });
      await onSalvo();
      onFechar();
    } catch (e) {
      onErro(e instanceof Error ? e.message : "Não foi possível criar o usuário.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            O primeiro acesso é feito com CPF e a data de nascimento como senha provisória.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="u-nome">Nome completo</Label>
            <Input id="u-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="u-cpf">CPF</Label>
              <Input
                id="u-cpf"
                inputMode="numeric"
                value={mascaraCPF(cpf)}
                onChange={(e) => setCpf(e.target.value.replace(/\D/g, "").slice(0, 11))}
                placeholder="000.000.000-00"
                className="tnum"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="u-nasc">Data de nascimento</Label>
              <Input
                id="u-nasc"
                type="date"
                value={nascimento}
                onChange={(e) => setNascimento(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="u-role">Perfil de acesso</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger id="u-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAPEIS_ATRIBUIVEIS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]} — {ROLE_DESCRICAO[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Unidade</Label>
              <Select
                value={unidadeId}
                onValueChange={(v) => {
                  setUnidadeId(v);
                  setSetorId("");
                  setCargoId("");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(snapshot?.unidades ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Setor</Label>
              <Select
                value={setorId}
                onValueChange={(v) => {
                  setSetorId(v);
                  setCargoId("");
                }}
                disabled={!unidadeId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {setores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cargo</Label>
              <Select value={cargoId} onValueChange={setCargoId} disabled={!setorId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {cargos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button disabled={!valido || salvando} onClick={() => void salvar()}>
            {salvando && <LoaderCircleIcon className="animate-spin" />}
            Criar usuário
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
