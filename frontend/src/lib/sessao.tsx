"use client";

import * as React from "react";
import { api, type Snapshot } from "./api";
import { alertasColetivos, alertasIndividuais, ordenarAlertas } from "./analytics";
import type { Alerta, Usuario } from "./types";

/* Sessão e dados do tenant ativo.

   Atenção ao trocar o mock por HTTP: aqui o snapshot traz a empresa inteira
   porque o mock roda no navegador. O backend real deve devolver apenas o
   que o perfil pode ver — um colaborador jamais deve receber as queixas
   dos colegas. */

const CHAVE = "blue.sessao";

/** Quem não pertence a uma empresa (plataforma) entra na primeira ativa —
    sem isso o painel abriria sem tenant e ficaria em branco. */
async function empresaInicial(u: Usuario): Promise<string | null> {
  if (u.empresaId) return u.empresaId;
  const lista = await api.listarEmpresas();
  return lista.find((x) => x.empresa.ativa)?.empresa.id ?? lista[0]?.empresa.id ?? null;
}

interface SessaoCtx {
  carregando: boolean;
  usuario: Usuario | null;
  /** empresa cujo painel está aberto — o superuser pode trocar */
  empresaAtivaId: string | null;
  entrar(cpf: string, senha: string): Promise<string | null>;
  sair(): void;
  trocarEmpresa(id: string): void;
}

const SessaoContexto = React.createContext<SessaoCtx | null>(null);

export function SessaoProvider({ children }: { children: React.ReactNode }) {
  const [carregando, setCarregando] = React.useState(true);
  const [usuario, setUsuario] = React.useState<Usuario | null>(null);
  const [empresaAtivaId, setEmpresaAtivaId] = React.useState<string | null>(null);

  // sessão persiste no navegador; lida depois da hidratação
  React.useEffect(() => {
    let cancelado = false;
    const bruto = typeof window === "undefined" ? null : window.localStorage.getItem(CHAVE);
    if (!bruto) {
      setCarregando(false);
      return;
    }
    try {
      const { usuarioId, empresaId } = JSON.parse(bruto) as {
        usuarioId: string;
        empresaId: string | null;
      };
      api
        .usuarioPorId(usuarioId)
        .then(async (u) => {
          if (!u) return;
          const alvo = empresaId ?? (await empresaInicial(u));
          if (cancelado) return;
          setUsuario(u);
          setEmpresaAtivaId(alvo);
        })
        .finally(() => {
          if (!cancelado) setCarregando(false);
        });
    } catch {
      window.localStorage.removeItem(CHAVE);
      setCarregando(false);
    }
    return () => {
      cancelado = true;
    };
  }, []);

  const persistir = React.useCallback((u: Usuario | null, empresaId: string | null) => {
    if (typeof window === "undefined") return;
    if (!u) window.localStorage.removeItem(CHAVE);
    else window.localStorage.setItem(CHAVE, JSON.stringify({ usuarioId: u.id, empresaId }));
  }, []);

  const entrar = React.useCallback(
    async (cpf: string, senha: string) => {
      const r = await api.login(cpf, senha);
      if ("erro" in r) return r.erro;
      const empresaId = await empresaInicial(r.usuario);
      setUsuario(r.usuario);
      setEmpresaAtivaId(empresaId);
      persistir(r.usuario, empresaId);
      return null;
    },
    [persistir],
  );

  const sair = React.useCallback(() => {
    setUsuario(null);
    setEmpresaAtivaId(null);
    persistir(null, null);
  }, [persistir]);

  const trocarEmpresa = React.useCallback(
    (id: string) => {
      setEmpresaAtivaId(id);
      persistir(usuario, id);
    },
    [persistir, usuario],
  );

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

/* ------------------------------- dados -------------------------------- */

interface DadosCtx {
  carregando: boolean;
  snapshot: Snapshot | null;
  alertas: Alerta[];
  recarregar(): Promise<void>;
  nomeUnidade(id: string | null): string;
  nomeSetor(id: string | null): string;
  nomeCargo(id: string | null): string;
  colaborador(id: string): Usuario | undefined;
  unidadeDoSetor(setorId: string): string;
}

const DadosContexto = React.createContext<DadosCtx | null>(null);

export function DadosProvider({ children }: { children: React.ReactNode }) {
  const { empresaAtivaId } = useSessao();
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
  const [carregando, setCarregando] = React.useState(false);

  const carregar = React.useCallback(async (empresaId: string) => {
    setCarregando(true);
    try {
      setSnapshot(await api.snapshot(empresaId));
    } finally {
      setCarregando(false);
    }
  }, []);

  React.useEffect(() => {
    if (!empresaAtivaId) {
      setSnapshot(null);
      return;
    }
    void carregar(empresaAtivaId);
  }, [empresaAtivaId, carregar]);

  const recarregar = React.useCallback(async () => {
    if (empresaAtivaId) await carregar(empresaAtivaId);
  }, [empresaAtivaId, carregar]);

  const alertas = React.useMemo<Alerta[]>(() => {
    if (!snapshot) return [];
    return [
      ...alertasIndividuais(snapshot.queixas),
      ...alertasColetivos(snapshot.queixas, snapshot.usuarios, snapshot.setores),
    ].sort(ordenarAlertas);
  }, [snapshot]);

  const valor = React.useMemo<DadosCtx>(() => {
    const unidades = new Map((snapshot?.unidades ?? []).map((u) => [u.id, u]));
    const setores = new Map((snapshot?.setores ?? []).map((s) => [s.id, s]));
    const cargos = new Map((snapshot?.cargos ?? []).map((c) => [c.id, c]));
    const usuarios = new Map((snapshot?.usuarios ?? []).map((u) => [u.id, u]));
    return {
      carregando,
      snapshot,
      alertas,
      recarregar,
      nomeUnidade: (id) => (id ? (unidades.get(id)?.nome ?? "—") : "—"),
      nomeSetor: (id) => (id ? (setores.get(id)?.nome ?? "—") : "—"),
      nomeCargo: (id) => (id ? (cargos.get(id)?.nome ?? "—") : "—"),
      colaborador: (id) => usuarios.get(id),
      unidadeDoSetor: (setorId) => {
        const s = setores.get(setorId);
        return s ? (unidades.get(s.unidadeId)?.nome ?? "—") : "—";
      },
    };
  }, [snapshot, alertas, carregando, recarregar]);

  return <DadosContexto.Provider value={valor}>{children}</DadosContexto.Provider>;
}

export function useDados(): DadosCtx {
  const c = React.useContext(DadosContexto);
  if (!c) throw new Error("useDados precisa estar dentro de DadosProvider");
  return c;
}
