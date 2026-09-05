"use client";

import * as React from "react";
import { api } from "./api";
import { limparCache, useRecurso } from "./recurso";
import type { Estrutura, UsuarioEu } from "./types";

/* Sessão e estrutura do tenant ativo.

   O que mudou: a sessão não vive mais no localStorage. O cookie é httpOnly e
   quem sabe quem está logado é o servidor — `api.eu()` é a única forma de
   descobrir, e um F5 recomeça por ela. O que resta no navegador é a escolha
   de qual empresa cliente o superuser está olhando, que não é credencial:
   para quem pertence a uma empresa o backend ignora esse valor.

   E não existe mais snapshot. Este provider carrega só a estrutura
   organizacional — dezenas de linhas que toda tela usa para trocar id por
   nome. Queixa, check-in e caso vêm por tela, já recortados. */

const CHAVE_EMPRESA = "blue.empresa";

interface SessaoCtx {
  carregando: boolean;
  usuario: UsuarioEu | null;
  /** empresa cujo painel está aberto — o superuser pode trocar */
  empresaAtivaId: string | null;
  entrar(nomeUsuario: string, senha: string): Promise<string | null>;
  sair(): Promise<void>;
  trocarEmpresa(id: string): void;
}

const SessaoContexto = React.createContext<SessaoCtx | null>(null);

function lerEmpresaSalva(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CHAVE_EMPRESA);
}

/** Quem não pertence a uma empresa (plataforma) entra na primeira ativa —
    sem isso o painel abriria sem tenant e ficaria em branco. */
async function empresaInicial(u: UsuarioEu): Promise<string | null> {
  if (u.empresaId) return u.empresaId;
  const salva = lerEmpresaSalva();
  if (salva) return salva;
  const lista = await api.empresas();
  return lista.find((x) => x.empresa.ativa)?.empresa.id ?? lista[0]?.empresa.id ?? null;
}

export function SessaoProvider({ children }: { children: React.ReactNode }) {
  const [carregando, setCarregando] = React.useState(true);
  const [usuario, setUsuario] = React.useState<UsuarioEu | null>(null);
  const [empresaAtivaId, setEmpresaAtivaId] = React.useState<string | null>(null);

  // o cliente HTTP precisa do tenant antes de qualquer requisição das telas;
  // por isso a sincronização acontece na renderização, e não num efeito
  api.usarEmpresa(empresaAtivaId);

  const adotar = React.useCallback(async (u: UsuarioEu) => {
    const alvo = await empresaInicial(u);
    api.usarEmpresa(alvo);
    setUsuario(u);
    setEmpresaAtivaId(alvo);
  }, []);

  React.useEffect(() => {
    let cancelado = false;
    api
      .eu()
      .then(async (u) => {
        if (!u || cancelado) return;
        await adotar(u);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [adotar]);

  const entrar = React.useCallback(
    // `nomeUsuario` e não `usuario`: aqui `usuario` já é o estado da sessão
    async (nomeUsuario: string, senha: string) => {
      try {
        await adotar(await api.entrar(nomeUsuario, senha));
        return null;
      } catch (erro) {
        return erro instanceof Error ? erro.message : "Não foi possível entrar.";
      }
    },
    [adotar],
  );

  const sair = React.useCallback(async () => {
    await api.sair();
    window.localStorage.removeItem(CHAVE_EMPRESA);
    // o cache de navegação vive em memória e não é do próximo usuário da aba
    limparCache();
    setUsuario(null);
    setEmpresaAtivaId(null);
  }, []);

  const trocarEmpresa = React.useCallback((id: string) => {
    window.localStorage.setItem(CHAVE_EMPRESA, id);
    api.usarEmpresa(id);
    // as chaves do cache não carregam o tenant: o painel da empresa anterior
    // não pode aparecer enquanto o da nova carrega
    limparCache();
    setEmpresaAtivaId(id);
  }, []);

  const valor = React.useMemo<SessaoCtx>(
    () => ({ carregando, usuario, empresaAtivaId, entrar, sair, trocarEmpresa }),
    [carregando, usuario, empresaAtivaId, entrar, sair, trocarEmpresa],
  );

  return <SessaoContexto.Provider value={valor}>{children}</SessaoContexto.Provider>;
}

export function useSessao(): SessaoCtx {
  const c = React.useContext(SessaoContexto);
  if (!c) throw new Error("useSessao precisa estar dentro de SessaoProvider");
  return c;
}

/* ----------------------------- estrutura ------------------------------ */

interface DadosCtx {
  carregando: boolean;
  estrutura: Estrutura | null;
  recarregar(): void;
  nomeUnidade(id: string | null): string;
  nomeSetor(id: string | null): string;
  nomeCargo(id: string | null): string;
  unidadeDoSetor(setorId: string | null): string;
  /** setores de uma unidade — os filtros encadeados da barra */
  setoresDaUnidade(unidadeId: string | null): { id: string; nome: string }[];
  cargosDoSetor(setorId: string | null, unidadeId: string | null): { id: string; nome: string }[];
}

const DadosContexto = React.createContext<DadosCtx | null>(null);

export function DadosProvider({ children }: { children: React.ReactNode }) {
  const { empresaAtivaId, usuario } = useSessao();
  // o colaborador não abre o painel e não tem `painel:ver`: pedir a estrutura
  // para ele seria um 403 garantido a cada carga da tela inicial
  const precisa = Boolean(empresaAtivaId && usuario && usuario.role !== "colaborador");

  const { dados, carregando, recarregar } = useRecurso(() => api.estrutura(), [empresaAtivaId], {
    ativo: precisa,
  });

  const valor = React.useMemo<DadosCtx>(() => {
    const unidades = new Map((dados?.unidades ?? []).map((u) => [u.id, u]));
    const setores = new Map((dados?.setores ?? []).map((s) => [s.id, s]));
    const cargos = new Map((dados?.cargos ?? []).map((c) => [c.id, c]));
    return {
      carregando,
      estrutura: dados,
      recarregar,
      nomeUnidade: (id) => (id ? (unidades.get(id)?.nome ?? "—") : "—"),
      nomeSetor: (id) => (id ? (setores.get(id)?.nome ?? "—") : "—"),
      nomeCargo: (id) => (id ? (cargos.get(id)?.nome ?? "—") : "—"),
      unidadeDoSetor: (setorId) => {
        const s = setorId ? setores.get(setorId) : undefined;
        return s ? (unidades.get(s.unidadeId)?.nome ?? "—") : "—";
      },
      setoresDaUnidade: (unidadeId) =>
        (dados?.setores ?? []).filter((s) => !unidadeId || s.unidadeId === unidadeId),
      cargosDoSetor: (setorId, unidadeId) => {
        if (setorId) return (dados?.cargos ?? []).filter((c) => c.setorId === setorId);
        const daUnidade = new Set(
          (dados?.setores ?? [])
            .filter((s) => !unidadeId || s.unidadeId === unidadeId)
            .map((s) => s.id),
        );
        return (dados?.cargos ?? []).filter((c) => daUnidade.has(c.setorId));
      },
    };
  }, [dados, carregando, recarregar]);

  return <DadosContexto.Provider value={valor}>{children}</DadosContexto.Provider>;
}

export function useDados(): DadosCtx {
  const c = React.useContext(DadosContexto);
  if (!c) throw new Error("useDados precisa estar dentro de DadosProvider");
  return c;
}
