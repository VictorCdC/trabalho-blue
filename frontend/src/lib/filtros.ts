"use client";

import * as React from "react";
import { naJanela } from "./analytics";
import { useDados } from "./sessao";
import type { CheckIn, Queixa, Usuario } from "./types";

export const TODOS = "todos";

export interface Filtro {
  unidadeId: string;
  setorId: string;
  cargoId: string;
  dias: number;
}

export const FILTRO_PADRAO: Filtro = {
  unidadeId: TODOS,
  setorId: TODOS,
  cargoId: TODOS,
  dias: 30,
};

export const PERIODOS = [
  { dias: 7, label: "7 dias" },
  { dias: 30, label: "30 dias" },
  { dias: 60, label: "60 dias" },
  { dias: 90, label: "90 dias" },
];

export interface Recorte {
  filtro: Filtro;
  setFiltro: React.Dispatch<React.SetStateAction<Filtro>>;
  /** colaboradores ativos dentro do recorte */
  colaboradores: Usuario[];
  /** dentro do recorte E do período */
  queixas: Queixa[];
  checkins: CheckIn[];
  /** dentro do recorte, período completo — necessário para comparar com o período anterior */
  historicoQueixas: Queixa[];
  historicoCheckins: CheckIn[];
  limpar(): void;
  ativo: boolean;
}

/** Recorte de unidade/setor/cargo/período compartilhado pelas telas do painel. */
export function useFiltros(inicial: Partial<Filtro> = {}): Recorte {
  const { snapshot } = useDados();
  const [filtro, setFiltro] = React.useState<Filtro>({ ...FILTRO_PADRAO, ...inicial });

  // trocar de unidade invalida setor e cargo escolhidos
  React.useEffect(() => {
    setFiltro((f) => (f.unidadeId === TODOS ? f : { ...f, setorId: TODOS, cargoId: TODOS }));
  }, [filtro.unidadeId]);

  const colaboradores = React.useMemo(() => {
    if (!snapshot) return [];
    return snapshot.usuarios.filter((u) => {
      if (u.role !== "colaborador" || !u.ativo) return false;
      if (filtro.unidadeId !== TODOS && u.unidadeId !== filtro.unidadeId) return false;
      if (filtro.setorId !== TODOS && u.setorId !== filtro.setorId) return false;
      if (filtro.cargoId !== TODOS && u.cargoId !== filtro.cargoId) return false;
      return true;
    });
  }, [snapshot, filtro.unidadeId, filtro.setorId, filtro.cargoId]);

  const historico = React.useMemo(() => {
    const ids = new Set(colaboradores.map((c) => c.id));
    return {
      queixas: (snapshot?.queixas ?? []).filter((q) => ids.has(q.colaboradorId)),
      checkins: (snapshot?.checkins ?? []).filter((c) => ids.has(c.colaboradorId)),
    };
  }, [snapshot, colaboradores]);

  const { queixas, checkins } = React.useMemo(
    () => ({
      queixas: historico.queixas.filter((q) => naJanela(q.data, filtro.dias)),
      checkins: historico.checkins.filter((c) => naJanela(c.data, filtro.dias)),
    }),
    [historico, filtro.dias],
  );

  const limpar = React.useCallback(() => setFiltro({ ...FILTRO_PADRAO, ...inicial }), []);

  const ativo =
    filtro.unidadeId !== TODOS || filtro.setorId !== TODOS || filtro.cargoId !== TODOS;

  return {
    filtro,
    setFiltro,
    colaboradores,
    queixas,
    checkins,
    historicoQueixas: historico.queixas,
    historicoCheckins: historico.checkins,
    limpar,
    ativo,
  };
}
