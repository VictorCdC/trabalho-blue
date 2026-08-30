"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BriefcaseIcon, LoaderCircleIcon, PlusIcon } from "lucide-react";
import { CabecalhoPagina, CartaoKpi, EstadoVazio } from "@/components/painel/comuns";
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
import { Progress } from "@/components/ui/progress";
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
import { api, type ResumoEmpresa } from "@/lib/api";
import { dataBR, mascaraCNPJ, pct, PLANO_LABEL } from "@/lib/format";
import { useSessao } from "@/lib/sessao";
import type { Plano } from "@/lib/types";

export default function PaginaPlataforma() {
  return (
    <Protegido permissao="empresas:gerenciar">
      <Conteudo />
    </Protegido>
  );
}

function Conteudo() {
  const router = useRouter();
  const { trocarEmpresa } = useSessao();
  const [linhas, setLinhas] = React.useState<ResumoEmpresa[] | null>(null);
  const [dialogo, setDialogo] = React.useState(false);

  const carregar = React.useCallback(async () => {
    setLinhas(await api.listarEmpresas());
  }, []);

  React.useEffect(() => {
    void carregar();
  }, [carregar]);

  async function alternarAtiva(id: string, ativa: boolean) {
    await api.atualizarEmpresa(id, { ativa });
    await carregar();
  }

  async function mudarPlano(id: string, plano: Plano) {
    await api.atualizarEmpresa(id, { plano });
    await carregar();
  }

  function acessar(id: string) {
    trocarEmpresa(id);
    router.push("/painel");
  }

  if (!linhas) return <div className="bg-muted h-96 animate-pulse rounded-xl" />;

  const ativas = linhas.filter((l) => l.empresa.ativa);
  const totalColaboradores = linhas.reduce((a, l) => a + l.colaboradores, 0);
  const totalContratados = linhas.reduce((a, l) => a + l.empresa.colaboradoresContratados, 0);
  const casosAbertos = linhas.reduce((a, l) => a + l.casosAbertos, 0);

  return (
    <>
      <CabecalhoPagina
        titulo="Empresas clientes"
        descricao="Administração da plataforma. Aqui você gerencia contratos e acessos — não o dado clínico dos colaboradores."
      >
        <Button size="sm" onClick={() => setDialogo(true)}>
          <PlusIcon /> Nova empresa
        </Button>
      </CabecalhoPagina>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoKpi
          rotulo="Empresas ativas"
          valor={`${ativas.length}/${linhas.length}`}
          detalhe={`${linhas.length - ativas.length} em implantação ou suspensas`}
          subirEhRuim={false}
        />
        <CartaoKpi
          rotulo="Colaboradores cadastrados"
          valor={totalColaboradores}
          detalhe={`De ${totalContratados} licenças contratadas`}
          subirEhRuim={false}
        />
        <CartaoKpi
          rotulo="Ocupação das licenças"
          valor={pct(totalContratados ? (totalColaboradores / totalContratados) * 100 : 0)}
          detalhe="Cadastro efetivo sobre o contratado"
          subirEhRuim={false}
        />
        <CartaoKpi
          rotulo="Casos abertos na base"
          valor={casosAbertos}
          detalhe="Somatório de todas as empresas"
        />
      </div>

      {linhas.length === 0 ? (
        <div className="mt-8">
          <EstadoVazio Icone={BriefcaseIcon} titulo="Nenhuma empresa cadastrada" />
        </div>
      ) : (
        <Card className="mt-6">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead className="min-w-44">Plano</TableHead>
                  <TableHead className="min-w-40">Licenças</TableHead>
                  <TableHead className="text-right">Queixas 30d</TableHead>
                  <TableHead className="text-right">Casos abertos</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map(({ empresa, colaboradores, queixas30d, casosAbertos: abertos }) => {
                  const ocupacao = empresa.colaboradoresContratados
                    ? (colaboradores / empresa.colaboradoresContratados) * 100
                    : 0;
                  return (
                    <TableRow key={empresa.id}>
                      <TableCell className="min-w-52">
                        <span className="block font-medium">{empresa.nome}</span>
                        <span className="text-muted-foreground text-xs whitespace-nowrap">
                          Cliente desde {dataBR(empresa.criadaEm)}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground tnum text-sm whitespace-nowrap">
                        {mascaraCNPJ(empresa.cnpj)}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={empresa.plano}
                          onValueChange={(v) => void mudarPlano(empresa.id, v as Plano)}
                        >
                          <SelectTrigger size="sm" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(PLANO_LABEL) as Plano[]).map((p) => (
                              <SelectItem key={p} value={p}>
                                {PLANO_LABEL[p]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Progress value={Math.min(100, ocupacao)} className="w-16" />
                          <span className="text-muted-foreground tnum text-xs">
                            {colaboradores}/{empresa.colaboradoresContratados}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tnum">{queixas30d}</TableCell>
                      <TableCell className="text-right tnum">{abertos}</TableCell>
                      <TableCell>
                        {empresa.ativa ? (
                          <Badge variant="outline" className="bg-sev-ok-soft text-sev-ok border-sev-ok/30">
                            Ativa
                          </Badge>
                        ) : (
                          <Badge variant="muted">Inativa</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" onClick={() => acessar(empresa.id)}>
                            Acessar painel
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void alternarAtiva(empresa.id, !empresa.ativa)}
                          >
                            {empresa.ativa ? "Suspender" : "Ativar"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <p className="text-muted-foreground mt-6 text-xs">
        Empresas recém-criadas entram sem dados. Use “Acessar painel” para configurar a estrutura e
        cadastrar os usuários daquele cliente.
      </p>

      {dialogo && (
        <DialogoNovaEmpresa
          onFechar={() => setDialogo(false)}
          onSalvo={async () => {
            await carregar();
          }}
        />
      )}
    </>
  );
}

function DialogoNovaEmpresa({
  onFechar,
  onSalvo,
}: {
  onFechar: () => void;
  onSalvo: () => Promise<void>;
}) {
  const [nome, setNome] = React.useState("");
  const [cnpj, setCnpj] = React.useState("");
  const [plano, setPlano] = React.useState<Plano>("essencial");
  const [contratados, setContratados] = React.useState("50");
  const [salvando, setSalvando] = React.useState(false);

  const valido = nome.trim().length > 2 && cnpj.length === 14 && Number(contratados) > 0;

  async function salvar() {
    setSalvando(true);
    await api.criarEmpresa(nome.trim(), cnpj, plano, Number(contratados));
    await onSalvo();
    setSalvando(false);
    onFechar();
  }

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova empresa cliente</DialogTitle>
          <DialogDescription>
            A empresa entra como inativa. Ative depois de configurar unidades, setores e o
            administrador dela.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="e-nome">Razão social</Label>
            <Input id="e-nome" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="e-cnpj">CNPJ</Label>
            <Input
              id="e-cnpj"
              inputMode="numeric"
              value={mascaraCNPJ(cnpj)}
              onChange={(e) => setCnpj(e.target.value.replace(/\D/g, "").slice(0, 14))}
              placeholder="00.000.000/0000-00"
              className="tnum"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="e-plano">Plano</Label>
              <Select value={plano} onValueChange={(v) => setPlano(v as Plano)}>
                <SelectTrigger id="e-plano" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PLANO_LABEL) as Plano[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PLANO_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-lic">Licenças contratadas</Label>
              <Input
                id="e-lic"
                inputMode="numeric"
                value={contratados}
                onChange={(e) => setContratados(e.target.value.replace(/\D/g, "").slice(0, 5))}
                className="tnum"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button disabled={!valido || salvando} onClick={() => void salvar()}>
            {salvando && <LoaderCircleIcon className="animate-spin" />}
            Criar empresa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
