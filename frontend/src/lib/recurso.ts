"use client";

import * as React from "react";
import { ErroApi } from "./api";
import { useEspera } from "./carregando";

/* Busca de dados do servidor.

   Cada tela declara o que precisa e as dependências que invalidam o pedido —
   trocar de setor ou de período refaz a consulta em vez de refiltrar um array
   em memória. Duas coisas que o hook resolve e que dariam bug se ficassem em
   cada página:

   - resposta atrasada não sobrescreve a mais nova. O usuário troca o filtro
     duas vezes rápido e a primeira resposta chega depois da segunda; o
     contador de pedidos descarta a velha.
   - o primeiro carregamento e a recarga são estados diferentes. `carregando`
     é só o primeiro; na recarga os dados antigos continuam na tela em vez de
     piscar um esqueleto. */

/* Cache de navegação.

   Sair da Visão geral, abrir Alertas e voltar refazia as três consultas e
   passava pelo esqueleto de novo, embora a resposta anterior ainda valesse.
   Quem passa `chave` guarda a última resposta e, na volta, desenha com ela
   enquanto revalida por trás.

   Duas regras que o desenho respeita:

   - o pedido **sempre** sai. O cache adianta o desenho, nunca substitui a
     requisição.
   - o cache é opt-in, e o que o servidor audita na leitura fica de fora:
     a ficha do colaborador, a lista de colaboradores identificada e o caso
     individual (`auditoria.registrar` em app/rotas/colaboradores.py e
     app/rotas/casos.py). Desenhar essas telas a partir do cache mostraria
     dado identificado antes do registro de acesso existir — e sem registro
     nenhum, se a revalidação falhasse.

   A chave inclui as deps, então cada recorte é uma entrada. O mapa morre com
   o F5; dentro da sessão ele é limpo quando muda quem está logado ou qual
   empresa está aberta (lib/sessao.tsx). */

const LIMITE_CACHE = 50;

const cache = new Map<string, unknown>();

/** Descarta tudo. Chamado ao sair e ao trocar de empresa: as chaves não
    carregam o tenant, e servir o painel da empresa anterior seria vazamento. */
export function limparCache(): void {
  cache.clear();
}

/** Quem está na tela agora, por nome de chave. */
const ouvintes = new Set<(nomes: readonly string[]) => void>();

/** Descarta o que foi guardado sob estes nomes e refaz quem estiver na tela.

    Abrir um caso muda o contador da barra lateral, e a barra lateral não
    passa por aqui de novo: ela é do layout, não desmonta entre telas, e sem
    aviso o número só se corrigia no F5. Quem faz a mutação diz o que ficou
    velho. */
export function invalidar(...nomes: string[]): void {
  for (const chave of [...cache.keys()]) {
    if (nomes.some((nome) => chave.startsWith(`${nome}|`))) cache.delete(chave);
  }
  for (const ouvinte of ouvintes) ouvinte(nomes);
}

function guardar(chave: string, valor: unknown): void {
  // reinserir joga a chave para o fim: quem sai é a menos usada recentemente
  cache.delete(chave);
  cache.set(chave, valor);
  if (cache.size > LIMITE_CACHE) {
    const maisAntiga = cache.keys().next().value;
    if (maisAntiga !== undefined) cache.delete(maisAntiga);
  }
}

export interface Recurso<T> {
  dados: T | null;
  carregando: boolean;
  recarregando: boolean;
  erro: string | null;
  recarregar: () => void;
}

export function useRecurso<T>(
  buscar: () => Promise<T>,
  deps: React.DependencyList,
  opcoes: { ativo?: boolean; chave?: string } = {},
): Recurso<T> {
  const ativo = opcoes.ativo ?? true;
  // o que identifica a resposta: o nome que a tela deu mais o recorte pedido
  const chave = opcoes.chave ? `${opcoes.chave}|${JSON.stringify(deps)}` : null;
  const [dados, setDados] = React.useState<T | null>(
    () => (chave !== null ? ((cache.get(chave) as T | undefined) ?? null) : null),
  );
  const [erro, setErro] = React.useState<string | null>(null);
  const [pendente, setPendente] = React.useState(ativo);
  const [gatilho, setGatilho] = React.useState(0);

  const pedidoAtual = React.useRef(0);
  // a função muda a cada render; as deps declaradas pela tela é que mandam
  const buscarRef = React.useRef(buscar);
  buscarRef.current = buscar;

  React.useEffect(() => {
    if (!ativo) {
      setPendente(false);
      return;
    }
    const meuPedido = ++pedidoAtual.current;
    // troca de recorte: se a resposta desse recorte já passou por aqui, ela
    // entra na tela agora e o pedido abaixo confirma
    if (chave !== null) {
      const guardado = cache.get(chave) as T | undefined;
      if (guardado !== undefined) setDados(guardado);
    }
    setPendente(true);
    buscarRef
      .current()
      .then((resultado) => {
        if (chave !== null) guardar(chave, resultado);
        if (meuPedido !== pedidoAtual.current) return; // chegou tarde
        setDados(resultado);
        setErro(null);
      })
      .catch((e: unknown) => {
        if (meuPedido !== pedidoAtual.current) return;
        setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar os dados.");
      })
      .finally(() => {
        if (meuPedido === pedidoAtual.current) setPendente(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, gatilho, ativo]);

  const recarregar = React.useCallback(() => setGatilho((n) => n + 1), []);

  const nome = opcoes.chave;
  React.useEffect(() => {
    if (nome === undefined) return;
    const ouvinte = (nomes: readonly string[]) => {
      if (nomes.includes(nome)) recarregar();
    };
    ouvintes.add(ouvinte);
    return () => {
      ouvintes.delete(ouvinte);
    };
  }, [nome, recarregar]);

  // só o primeiro carregamento acende a barra: a recarga acontece por trás
  // dos dados que já estão na tela e não precisa de anúncio
  const carregando = pendente && dados === null;
  useEspera(carregando);

  return {
    dados,
    carregando,
    recarregando: pendente && dados !== null,
    erro,
    recarregar,
  };
}

/** Espera o usuário parar de digitar antes de ir ao servidor.

    Sem isto cada tecla numa caixa de busca vira uma consulta — o que era de
    graça quando o filtro acontecia em memória, e não é mais. */
export function useDebounce(valor: string, ms = 300): string {
  const [atrasado, setAtrasado] = React.useState(valor);
  React.useEffect(() => {
    const id = window.setTimeout(() => setAtrasado(valor), ms);
    return () => window.clearTimeout(id);
  }, [valor, ms]);
  return atrasado;
}
