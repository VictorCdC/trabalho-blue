import { diasAtras, hojeISO } from "./format";
import type {
  Alerta,
  AlertaColetivo,
  AlertaIndividual,
  CheckIn,
  Intensidade,
  Lado,
  Queixa,
  RegiaoId,
  Setor,
  Severidade,
  Usuario,
} from "./types";

/* Regras de alerta. Valores fixos nesta versão; a intenção é que virem
   parâmetros por empresa numa tela de configuração futura. */
export const REGRAS = {
  janelaDias: 30,
  /** queixas na mesma região/lado, pela mesma pessoa, para abrir alerta */
  individualMinOcorrencias: 3,
  /** fração do setor relatando a mesma região para abrir alerta coletivo */
  coletivoMinPercentual: 20,
  /** e no mínimo esta quantidade de pessoas, para não alertar setor pequeno */
  coletivoMinPessoas: 3,
} as const;

export function naJanela(iso: string, dias: number = REGRAS.janelaDias, base = hojeISO()): boolean {
  const n = diasAtras(iso, base);
  return n >= 0 && n < dias;
}

function media(ns: number[]): number {
  return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0;
}

/* ----------------------------- alertas -------------------------------- */

function severidadeIndividual(ocorrencias: number, intensidadeMedia: number): Severidade {
  if (ocorrencias >= 6 || intensidadeMedia >= 4) return "alta";
  if (ocorrencias >= 4 || intensidadeMedia >= 3) return "media";
  return "baixa";
}

export function alertasIndividuais(
  queixas: Queixa[],
  janelaDias: number = REGRAS.janelaDias,
  base = hojeISO(),
): AlertaIndividual[] {
  const grupos = new Map<string, Queixa[]>();
  for (const q of queixas) {
    if (!naJanela(q.data, janelaDias, base)) continue;
    const chave = `${q.colaboradorId}|${q.regiao}|${q.lado}`;
    const g = grupos.get(chave);
    if (g) g.push(q);
    else grupos.set(chave, [q]);
  }

  const out: AlertaIndividual[] = [];
  for (const [chave, qs] of grupos) {
    if (qs.length < REGRAS.individualMinOcorrencias) continue;
    const intensidadeMedia = media(qs.map((q) => q.intensidade));
    const ultima = qs.reduce((a, b) => (a.data > b.data ? a : b));
    const [colaboradorId, regiao, lado] = chave.split("|");
    out.push({
      id: `alr-ind-${colaboradorId}-${regiao}-${lado}`,
      kind: "individual",
      empresaId: qs[0].empresaId,
      colaboradorId,
      regiao: regiao as RegiaoId,
      lado: lado as Lado,
      ocorrencias: qs.length,
      intensidadeMedia,
      janelaDias,
      ultimaEm: ultima.data,
      severidade: severidadeIndividual(qs.length, intensidadeMedia),
    });
  }
  return out.sort(ordenarAlertas);
}

function severidadeColetiva(percentual: number): Severidade {
  if (percentual >= 40) return "alta";
  if (percentual >= 28) return "media";
  return "baixa";
}

export function alertasColetivos(
  queixas: Queixa[],
  colaboradores: Usuario[],
  setores: Setor[],
  janelaDias: number = REGRAS.janelaDias,
  base = hojeISO(),
): AlertaColetivo[] {
  const setorDe = new Map(colaboradores.map((c) => [c.id, c.setorId]));
  const unidadeDoSetor = new Map(setores.map((s) => [s.id, s.unidadeId]));

  const totalPorSetor = new Map<string, number>();
  for (const c of colaboradores) {
    if (!c.setorId || c.role !== "colaborador" || !c.ativo) continue;
    totalPorSetor.set(c.setorId, (totalPorSetor.get(c.setorId) ?? 0) + 1);
  }

  // setor + região -> conjunto de pessoas distintas que relataram
  const pessoas = new Map<string, Set<string>>();
  const ultima = new Map<string, string>();
  for (const q of queixas) {
    if (!naJanela(q.data, janelaDias, base)) continue;
    const setorId = setorDe.get(q.colaboradorId);
    if (!setorId) continue;
    const chave = `${setorId}|${q.regiao}`;
    let s = pessoas.get(chave);
    if (!s) pessoas.set(chave, (s = new Set()));
    s.add(q.colaboradorId);
    const u = ultima.get(chave);
    if (!u || q.data > u) ultima.set(chave, q.data);
  }

  const out: AlertaColetivo[] = [];
  for (const [chave, set] of pessoas) {
    const [setorId, regiao] = chave.split("|");
    const total = totalPorSetor.get(setorId) ?? 0;
    if (!total) continue;
    const afetados = set.size;
    if (afetados < REGRAS.coletivoMinPessoas) continue;
    const percentual = (afetados / total) * 100;
    if (percentual < REGRAS.coletivoMinPercentual) continue;
    const unidadeId = unidadeDoSetor.get(setorId) ?? "";
    out.push({
      id: `alr-col-${setorId}-${regiao}`,
      kind: "coletivo",
      empresaId: colaboradores.find((c) => c.setorId === setorId)?.empresaId ?? "",
      unidadeId,
      setorId,
      regiao: regiao as RegiaoId,
      afetados,
      totalSetor: total,
      percentual,
      janelaDias,
      ultimaEm: ultima.get(chave) ?? hojeISO(),
      severidade: severidadeColetiva(percentual),
    });
  }
  return out.sort(ordenarAlertas);
}

const PESO_SEV: Record<Severidade, number> = { alta: 3, media: 2, baixa: 1 };

/** Severidade desc, coletivo antes de individual, mais recente antes. */
export function ordenarAlertas(a: Alerta, b: Alerta): number {
  const d = PESO_SEV[b.severidade] - PESO_SEV[a.severidade];
  if (d !== 0) return d;
  // no empate, coletivo vem antes: atinge mais gente com uma só intervenção
  if (a.kind !== b.kind) return a.kind === "coletivo" ? -1 : 1;
  return b.ultimaEm.localeCompare(a.ultimaEm);
}

/* --------------------------- agregações ------------------------------- */

export interface PontoSerie {
  data: string;
  queixas: number;
  checkins: number;
  bem: number;
  intensidadeMedia: number;
}

/** Série diária agregada — base dos gráficos de tendência. */
export function serieDiaria(
  queixas: Queixa[],
  checkins: CheckIn[],
  dias: number,
  base = hojeISO(),
): PontoSerie[] {
  const mapa = new Map<string, { q: Queixa[]; c: CheckIn[] }>();
  for (let d = dias - 1; d >= 0; d -= 1) {
    const iso = new Date(new Date(base).getTime() - d * 86_400_000).toISOString();
    mapa.set(iso.slice(0, 10), { q: [], c: [] });
  }
  for (const q of queixas) {
    mapa.get(q.data.slice(0, 10))?.q.push(q);
  }
  for (const c of checkins) {
    mapa.get(c.data.slice(0, 10))?.c.push(c);
  }
  return [...mapa.entries()].map(([dia, { q, c }]) => ({
    data: `${dia}T00:00:00.000Z`,
    queixas: q.length,
    checkins: c.length,
    bem: c.filter((x) => x.estado === "bem").length,
    intensidadeMedia: media(q.map((x) => x.intensidade)),
  }));
}

/** Agrupa por semana (rótulo = primeiro dia). Melhor leitura em 60/90 dias. */
export function agruparPorSemana(serie: PontoSerie[]): PontoSerie[] {
  const out: PontoSerie[] = [];
  for (let i = 0; i < serie.length; i += 7) {
    const bloco = serie.slice(i, i + 7);
    out.push({
      data: bloco[0].data,
      queixas: bloco.reduce((a, b) => a + b.queixas, 0),
      checkins: bloco.reduce((a, b) => a + b.checkins, 0),
      bem: bloco.reduce((a, b) => a + b.bem, 0),
      intensidadeMedia: media(bloco.filter((b) => b.queixas > 0).map((b) => b.intensidadeMedia)),
    });
  }
  return out;
}

export interface ContagemRegiao {
  regiao: RegiaoId;
  total: number;
  pessoas: number;
  intensidadeMedia: number;
}

export function porRegiao(queixas: Queixa[]): ContagemRegiao[] {
  const m = new Map<RegiaoId, { total: number; pessoas: Set<string>; ints: number[] }>();
  for (const q of queixas) {
    let e = m.get(q.regiao);
    if (!e) m.set(q.regiao, (e = { total: 0, pessoas: new Set(), ints: [] }));
    e.total += 1;
    e.pessoas.add(q.colaboradorId);
    e.ints.push(q.intensidade);
  }
  return [...m.entries()]
    .map(([regiao, e]) => ({
      regiao,
      total: e.total,
      pessoas: e.pessoas.size,
      intensidadeMedia: media(e.ints),
    }))
    .sort((a, b) => b.total - a.total);
}

export interface ContagemRegiaoLado extends ContagemRegiao {
  lado: Lado;
}

/** Igual a porRegiao, mas separando lado esquerdo/direito — o mapa de calor
    precisa disso para não pintar os dois punhos quando só um dói. */
export function porRegiaoLado(queixas: Queixa[]): ContagemRegiaoLado[] {
  const m = new Map<string, { total: number; pessoas: Set<string>; ints: number[] }>();
  for (const q of queixas) {
    const chave = `${q.regiao}|${q.lado}`;
    let e = m.get(chave);
    if (!e) m.set(chave, (e = { total: 0, pessoas: new Set(), ints: [] }));
    e.total += 1;
    e.pessoas.add(q.colaboradorId);
    e.ints.push(q.intensidade);
  }
  return [...m.entries()]
    .map(([chave, e]) => {
      const [regiao, lado] = chave.split("|");
      return {
        regiao: regiao as RegiaoId,
        lado: lado as Lado,
        total: e.total,
        pessoas: e.pessoas.size,
        intensidadeMedia: media(e.ints),
      };
    })
    .sort((a, b) => b.total - a.total);
}

export interface ResumoSetor {
  setorId: string;
  totalColaboradores: number;
  pessoasComQueixa: number;
  queixas: number;
  intensidadeMedia: number;
  adesao: number;
  regiaoTop: RegiaoId | null;
  /** já relatou algo no período — satura rápido, serve de contexto */
  percentualAfetado: number;
  /** dias com desconforto sobre dias com check-in: quanto o setor dói */
  taxaDesconforto: number;
  /** pessoas que cruzaram o limite de recorrência na mesma região */
  pessoasRecorrentes: number;
  percentualRecorrente: number;
}

/** Pessoas com >= minOcorrencias registros na mesma região/lado. */
function contarRecorrentes(queixas: Queixa[], minOcorrencias = REGRAS.individualMinOcorrencias): number {
  const contagem = new Map<string, number>();
  for (const q of queixas) {
    const chave = `${q.colaboradorId}|${q.regiao}|${q.lado}`;
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  const pessoas = new Set<string>();
  for (const [chave, n] of contagem) {
    if (n >= minOcorrencias) pessoas.add(chave.split("|")[0]);
  }
  return pessoas.size;
}

export function porSetor(
  queixas: Queixa[],
  checkins: CheckIn[],
  colaboradores: Usuario[],
  dias: number,
): ResumoSetor[] {
  const ativos = colaboradores.filter((c) => c.role === "colaborador" && c.ativo && c.setorId);
  const setorDe = new Map(ativos.map((c) => [c.id, c.setorId as string]));
  const porSetorId = new Map<string, Usuario[]>();
  for (const c of ativos) {
    const arr = porSetorId.get(c.setorId as string);
    if (arr) arr.push(c);
    else porSetorId.set(c.setorId as string, [c]);
  }

  const diasUteis = Math.max(1, Math.round((dias * 5) / 7));

  return [...porSetorId.entries()]
    .map(([setorId, membros]) => {
      const qs = queixas.filter((q) => setorDe.get(q.colaboradorId) === setorId);
      const cs = checkins.filter((c) => setorDe.get(c.colaboradorId) === setorId);
      const regioes = porRegiao(qs);
      const pessoas = new Set(qs.map((q) => q.colaboradorId)).size;
      const recorrentes = contarRecorrentes(qs);
      return {
        setorId,
        totalColaboradores: membros.length,
        pessoasComQueixa: pessoas,
        queixas: qs.length,
        intensidadeMedia: media(qs.map((q) => q.intensidade)),
        adesao: Math.min(100, (cs.length / (membros.length * diasUteis)) * 100),
        regiaoTop: regioes[0]?.regiao ?? null,
        percentualAfetado: membros.length ? (pessoas / membros.length) * 100 : 0,
        taxaDesconforto: cs.length ? (qs.length / cs.length) * 100 : 0,
        pessoasRecorrentes: recorrentes,
        percentualRecorrente: membros.length ? (recorrentes / membros.length) * 100 : 0,
      };
    })
    .sort(
      (a, b) =>
        b.percentualRecorrente - a.percentualRecorrente || b.taxaDesconforto - a.taxaDesconforto,
    );
}

export interface Kpis {
  colaboradoresAtivos: number;
  checkins: number;
  adesao: number;
  queixas: number;
  pessoasComQueixa: number;
  percentualAfetado: number;
  intensidadeMedia: number;
  relacaoTrabalhoSim: number;
  /** variação percentual das queixas contra o período anterior de igual tamanho */
  variacaoQueixas: number;
  /** dias com desconforto sobre dias com check-in */
  taxaDesconforto: number;
  pessoasRecorrentes: number;
  percentualRecorrente: number;
}

export function calcularKpis(
  queixas: Queixa[],
  checkins: CheckIn[],
  colaboradores: Usuario[],
  dias: number,
  base = hojeISO(),
): Kpis {
  const ativos = colaboradores.filter((c) => c.role === "colaborador" && c.ativo);
  const noPeriodo = queixas.filter((q) => naJanela(q.data, dias, base));
  const anterior = queixas.filter((q) => {
    const n = diasAtras(q.data, base);
    return n >= dias && n < dias * 2;
  });
  const csPeriodo = checkins.filter((c) => naJanela(c.data, dias, base));
  const diasUteis = Math.max(1, Math.round((dias * 5) / 7));
  const pessoas = new Set(noPeriodo.map((q) => q.colaboradorId)).size;

  return {
    colaboradoresAtivos: ativos.length,
    checkins: csPeriodo.length,
    adesao: ativos.length ? Math.min(100, (csPeriodo.length / (ativos.length * diasUteis)) * 100) : 0,
    queixas: noPeriodo.length,
    pessoasComQueixa: pessoas,
    percentualAfetado: ativos.length ? (pessoas / ativos.length) * 100 : 0,
    intensidadeMedia: media(noPeriodo.map((q) => q.intensidade)),
    relacaoTrabalhoSim: noPeriodo.length
      ? (noPeriodo.filter((q) => q.relacaoTrabalho === "sim").length / noPeriodo.length) * 100
      : 0,
    variacaoQueixas: anterior.length
      ? ((noPeriodo.length - anterior.length) / anterior.length) * 100
      : 0,
    taxaDesconforto: csPeriodo.length ? (noPeriodo.length / csPeriodo.length) * 100 : 0,
    pessoasRecorrentes: contarRecorrentes(noPeriodo),
    percentualRecorrente: ativos.length
      ? (contarRecorrentes(noPeriodo) / ativos.length) * 100
      : 0,
  };
}

/** Distribuição de intensidade 1–5, para a barra empilhada do painel. */
export function distribuicaoIntensidade(queixas: Queixa[]): Array<{ intensidade: Intensidade; total: number }> {
  const base: Array<{ intensidade: Intensidade; total: number }> = [1, 2, 3, 4, 5].map((i) => ({
    intensidade: i as Intensidade,
    total: 0,
  }));
  for (const q of queixas) base[q.intensidade - 1].total += 1;
  return base;
}

/** Sequência de dias úteis consecutivos com check-in, contando de hoje. */
export function sequenciaCheckIn(checkins: CheckIn[], base = hojeISO()): number {
  const dias = new Set(checkins.map((c) => c.data.slice(0, 10)));
  let seq = 0;
  for (let d = 0; d < 120; d += 1) {
    const data = new Date(new Date(base).getTime() - d * 86_400_000);
    const dow = data.getDay();
    if (dow === 0 || dow === 6) continue;
    if (dias.has(data.toISOString().slice(0, 10))) seq += 1;
    else if (d > 0) break;
  }
  return seq;
}
