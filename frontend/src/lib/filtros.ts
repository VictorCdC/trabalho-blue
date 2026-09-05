"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import type { Recorte } from "./api";

/* O recorte de unidade / setor / cargo / período.

   Antes este arquivo filtrava arrays: recebia o quadro inteiro da empresa e
   devolvia colaboradores, queixas e check-ins já cortados, refazendo tudo a
   cada mudança de filtro. Agora ele só guarda a escolha do usuário e a
   converte em parâmetros de consulta — quem corta é o `WHERE`.

   O recorte também vive na query string. Sem isso um F5 voltava para "tudo,
   30 dias", "olha o setor X no trimestre" não cabia num link, e voltar de uma
   ficha para a lista trazia a lista sem o filtro que levou até ela.

   Quem escreve é `history.replaceState`, não `router.push`: apertar um filtro
   é refinar a mesma tela, não navegar. Empilhando uma entrada por ajuste, o
   botão "voltar" do navegador viraria um desfazedor de filtros e o usuário
   precisaria de sete cliques para sair da tela. */

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

export interface UsoFiltro {
  filtro: Filtro;
  setFiltro: React.Dispatch<React.SetStateAction<Filtro>>;
  /** o mesmo recorte, no formato que a API espera */
  recorte: Recorte;
  limpar(): void;
  ativo: boolean;
}

/** "todos" é escolha de interface; a API entende ausência do parâmetro. */
function opcional(valor: string): string | undefined {
  return valor === TODOS ? undefined : valor;
}

/** Nome de cada campo na URL. Curto porque é o que a pessoa vê e cola. */
const PARAM = { unidadeId: "unidade", setorId: "setor", cargoId: "cargo" } as const;

const RECORTES = ["unidadeId", "setorId", "cargoId"] as const;

function lerDaUrl(padrao: Filtro): Filtro {
  if (typeof window === "undefined") return padrao;
  const busca = new URLSearchParams(window.location.search);
  const dias = Number(busca.get("dias"));
  return {
    unidadeId: busca.get(PARAM.unidadeId) ?? padrao.unidadeId,
    setorId: busca.get(PARAM.setorId) ?? padrao.setorId,
    cargoId: busca.get(PARAM.cargoId) ?? padrao.cargoId,
    // período que não é opção da interface não existe: cai no padrão da tela
    dias: PERIODOS.some((p) => p.dias === dias) ? dias : padrao.dias,
  };
}

/** Id inválido na URL não é problema de segurança — o tenant é do servidor —
    e a consulta volta vazia. Por isso só o período é validado aqui. */
function escreverNaUrl(filtro: Filtro, padrao: Filtro): void {
  const busca = new URLSearchParams(window.location.search);
  for (const campo of RECORTES) {
    if (filtro[campo] === TODOS) busca.delete(PARAM[campo]);
    else busca.set(PARAM[campo], filtro[campo]);
  }
  if (filtro.dias === padrao.dias) busca.delete("dias");
  else busca.set("dias", String(filtro.dias));

  const query = busca.toString();
  window.history.replaceState(
    null,
    "",
    query ? `${window.location.pathname}?${query}` : window.location.pathname,
  );
}

export function useFiltros(inicial: Partial<Filtro> = {}): UsoFiltro {
  const caminho = usePathname();
  const padrao = React.useMemo(() => ({ ...FILTRO_PADRAO, ...inicial }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Só lê a URL quando ela já é a desta tela. Numa navegação entre telas do
  // painel o `location` do navegador ainda pode ser o da tela anterior no
  // primeiro render, e o recorte de uma tela vazava para a outra: abrir
  // Alertas a partir da Visão geral filtrada trazia Alertas filtrado, sem
  // ninguém ter pedido. O `usePathname` do router é o destino de verdade.
  const [filtro, setFiltro] = React.useState<Filtro>(() =>
    typeof window !== "undefined" && window.location.pathname === caminho
      ? lerDaUrl(padrao)
      : padrao,
  );

  React.useEffect(() => {
    // mesma guarda na escrita: não carimbar o recorte desta tela na URL de outra
    if (window.location.pathname !== caminho) return;
    escreverNaUrl(filtro, padrao);
  }, [filtro, padrao, caminho]);

  const recorte = React.useMemo<Recorte>(
    () => ({
      unidadeId: opcional(filtro.unidadeId),
      setorId: opcional(filtro.setorId),
      cargoId: opcional(filtro.cargoId),
      dias: filtro.dias,
    }),
    [filtro.unidadeId, filtro.setorId, filtro.cargoId, filtro.dias],
  );

  const limpar = React.useCallback(() => setFiltro(padrao), [padrao]);

  const ativo =
    filtro.unidadeId !== TODOS || filtro.setorId !== TODOS || filtro.cargoId !== TODOS;

  return { filtro, setFiltro, recorte, limpar, ativo };
}
