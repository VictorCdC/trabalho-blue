import { diaISO, hojeISO } from "../format";
import type {
  Agravante,
  Cargo,
  CheckIn,
  Empresa,
  InicioDor,
  Intensidade,
  Lado,
  Queixa,
  RegiaoId,
  Setor,
  TipoDor,
  Unidade,
  Usuario,
} from "../types";

/* Dados de demonstração determinísticos: mesma entrada, mesma saída, em
   qualquer render. Trocar este módulo pela chamada HTTP real é a única
   mudança necessária quando o backend existir — ver ../api/client.ts. */

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const JANELA_DIAS = 75;

function cpfFake(i: number): string {
  return String(10_000_000_000 + i * 1_372_937).slice(0, 11);
}

/* ------------------------------ empresas ------------------------------ */

export const EMPRESAS: Empresa[] = [
  {
    id: "e1",
    nome: "Metalúrgica Aurora",
    cnpj: "12345678000190",
    plano: "profissional",
    ativa: true,
    criadaEm: diaISO(-420),
    colaboradoresContratados: 40,
  },
  {
    id: "e2",
    nome: "Rede Bem Viver Supermercados",
    cnpj: "98765432000155",
    plano: "essencial",
    ativa: true,
    criadaEm: diaISO(-180),
    colaboradoresContratados: 15,
  },
  {
    id: "e3",
    nome: "Transportadora Litoral Norte",
    cnpj: "45678912000133",
    plano: "enterprise",
    ativa: false,
    criadaEm: diaISO(-22),
    colaboradoresContratados: 120,
  },
];

/* ------------------------ estrutura organizacional -------------------- */

export const UNIDADES: Unidade[] = [
  { id: "u1", empresaId: "e1", nome: "Matriz Fortaleza", cidade: "Fortaleza", uf: "CE" },
  { id: "u2", empresaId: "e1", nome: "Planta Maracanaú", cidade: "Maracanaú", uf: "CE" },
  { id: "u3", empresaId: "e2", nome: "Loja Centro", cidade: "Fortaleza", uf: "CE" },
];

export const SETORES: Setor[] = [
  { id: "s1", unidadeId: "u1", nome: "Administrativo" },
  { id: "s2", unidadeId: "u1", nome: "Atendimento" },
  { id: "s3", unidadeId: "u1", nome: "Estoque" },
  { id: "s4", unidadeId: "u2", nome: "Produção" },
  { id: "s5", unidadeId: "u2", nome: "Expedição" },
  { id: "s6", unidadeId: "u3", nome: "Frente de Caixa" },
  { id: "s7", unidadeId: "u3", nome: "Padaria" },
];

export const CARGOS: Cargo[] = [
  { id: "c1", setorId: "s1", nome: "Analista" },
  { id: "c2", setorId: "s1", nome: "Assistente Administrativo" },
  { id: "c3", setorId: "s2", nome: "Atendente" },
  { id: "c4", setorId: "s2", nome: "Supervisor de Atendimento" },
  { id: "c5", setorId: "s3", nome: "Conferente" },
  { id: "c6", setorId: "s3", nome: "Empilhadeirista" },
  { id: "c7", setorId: "s3", nome: "Auxiliar de Estoque" },
  { id: "c8", setorId: "s4", nome: "Operador de Máquina" },
  { id: "c9", setorId: "s4", nome: "Montador" },
  { id: "c10", setorId: "s4", nome: "Inspetor de Qualidade" },
  { id: "c11", setorId: "s5", nome: "Auxiliar de Expedição" },
  { id: "c12", setorId: "s5", nome: "Motorista" },
  { id: "c13", setorId: "s6", nome: "Operador de Caixa" },
  { id: "c14", setorId: "s6", nome: "Repositor" },
  { id: "c15", setorId: "s7", nome: "Padeiro" },
  { id: "c16", setorId: "s1", nome: "Coordenação" },
];

/* --------------------------- quadro de pessoal ------------------------ */

interface SeedColab {
  nome: string;
  setorId: string;
  cargoId: string;
  /** chance de relatar desconforto em um dia de trabalho */
  propensao: number;
  /** região que domina os relatos desta pessoa */
  foco?: [RegiaoId, Lado];
  /** relatos ficam mais intensos com o passar das semanas */
  escalada?: boolean;
  /** quadro melhorou depois de uma intervenção */
  melhorou?: boolean;
}

const QUADRO_E1: SeedColab[] = [
  // Administrativo — trabalho sentado e tela: cervical e dorsal
  { nome: "Mariana Alves Prado", setorId: "s1", cargoId: "c1", propensao: 0.1, foco: ["cervical", "na"] },
  { nome: "Rafael Coutinho Lima", setorId: "s1", cargoId: "c1", propensao: 0.08, foco: ["dorsal", "na"] },
  { nome: "Juliana Sampaio Rocha", setorId: "s1", cargoId: "c2", propensao: 0.15, foco: ["cervical", "na"] },
  { nome: "Bruno Teixeira Maia", setorId: "s1", cargoId: "c2", propensao: 0.06 },
  { nome: "Camila Duarte Freitas", setorId: "s1", cargoId: "c1", propensao: 0.09, foco: ["punho", "direito"] },
  // Atendimento — digitação e telefone
  {
    nome: "Ana Beatriz Nogueira",
    setorId: "s2",
    cargoId: "c3",
    propensao: 0.34,
    foco: ["punho", "direito"],
    escalada: true,
  },
  { nome: "Diego Martins Pereira", setorId: "s2", cargoId: "c3", propensao: 0.12, foco: ["cervical", "na"] },
  { nome: "Larissa Gomes Vieira", setorId: "s2", cargoId: "c3", propensao: 0.17, foco: ["dorsal", "na"] },
  { nome: "Paulo Henrique Braga", setorId: "s2", cargoId: "c4", propensao: 0.07 },
  { nome: "Tatiane Ribeiro Costa", setorId: "s2", cargoId: "c3", propensao: 0.13, foco: ["punho", "esquerdo"] },
  // Estoque — carga e descarga: surto coletivo de lombar
  { nome: "Marcos Vinícius Souza", setorId: "s3", cargoId: "c5", propensao: 0.25, foco: ["lombar", "na"] },
  { nome: "Fernanda Lopes Andrade", setorId: "s3", cargoId: "c5", propensao: 0.21, foco: ["lombar", "na"] },
  { nome: "Cláudio Barbosa Neto", setorId: "s3", cargoId: "c6", propensao: 0.23, foco: ["lombar", "na"] },
  { nome: "Rodrigo Amaral Pinto", setorId: "s3", cargoId: "c7", propensao: 0.28, foco: ["lombar", "na"] },
  { nome: "Simone Cardoso Melo", setorId: "s3", cargoId: "c7", propensao: 0.19, foco: ["lombar", "na"] },
  { nome: "Eduardo Farias Campos", setorId: "s3", cargoId: "c6", propensao: 0.16, foco: ["ombro", "direito"] },
  { nome: "Patrícia Nunes Moura", setorId: "s3", cargoId: "c5", propensao: 0.2, foco: ["lombar", "na"] },
  // Produção — repetitivo de ombro; setor já passou por intervenção
  {
    nome: "José Carlos Almeida",
    setorId: "s4",
    cargoId: "c8",
    propensao: 0.22,
    foco: ["ombro", "direito"],
    melhorou: true,
  },
  { nome: "Vanessa Cruz Batista", setorId: "s4", cargoId: "c9", propensao: 0.18, foco: ["antebraco", "direito"] },
  {
    nome: "Igor Menezes Tavares",
    setorId: "s4",
    cargoId: "c8",
    propensao: 0.19,
    foco: ["ombro", "esquerdo"],
    melhorou: true,
  },
  { nome: "Renata Figueiredo Dias", setorId: "s4", cargoId: "c10", propensao: 0.11, foco: ["cervical", "na"] },
  {
    nome: "Wesley Santana Rocha",
    setorId: "s4",
    cargoId: "c9",
    propensao: 0.24,
    foco: ["ombro", "direito"],
    melhorou: true,
  },
  { nome: "Amanda Peixoto Lira", setorId: "s4", cargoId: "c9", propensao: 0.14, foco: ["punho", "direito"] },
  { nome: "Gustavo Bezerra Matos", setorId: "s4", cargoId: "c8", propensao: 0.17, foco: ["lombar", "na"] },
  // Expedição
  { nome: "Sérgio Aquino Ramos", setorId: "s5", cargoId: "c11", propensao: 0.21, foco: ["lombar", "na"] },
  { nome: "Kelly Oliveira Serra", setorId: "s5", cargoId: "c11", propensao: 0.15, foco: ["joelho", "direito"] },
  { nome: "Anderson Pires Cunha", setorId: "s5", cargoId: "c12", propensao: 0.18, foco: ["lombar", "na"] },
  { nome: "Michele Torres Aguiar", setorId: "s5", cargoId: "c11", propensao: 0.12, foco: ["punho", "esquerdo"] },
  { nome: "Fábio Correia Lemos", setorId: "s5", cargoId: "c12", propensao: 0.1, foco: ["panturrilha", "direito"] },
];

const QUADRO_E2: SeedColab[] = [
  { nome: "Beatriz Xavier Pontes", setorId: "s6", cargoId: "c13", propensao: 0.26, foco: ["punho", "direito"] },
  { nome: "Leandro Aguiar Brito", setorId: "s6", cargoId: "c13", propensao: 0.22, foco: ["punho", "direito"] },
  { nome: "Cristiane Melo Bastos", setorId: "s6", cargoId: "c13", propensao: 0.19, foco: ["ombro", "direito"] },
  { nome: "Vitor Hugo Salgado", setorId: "s6", cargoId: "c14", propensao: 0.2, foco: ["lombar", "na"] },
  { nome: "Nathália Braz Ferreira", setorId: "s6", cargoId: "c14", propensao: 0.16, foco: ["lombar", "na"] },
  { nome: "Elias Monteiro Rocha", setorId: "s7", cargoId: "c15", propensao: 0.18, foco: ["ombro", "esquerdo"] },
  { nome: "Rosana Lira Cavalcante", setorId: "s7", cargoId: "c15", propensao: 0.14, foco: ["canela", "direito"] },
  { nome: "Thiago Meireles Pinho", setorId: "s7", cargoId: "c15", propensao: 0.11 },
];

/** Gestores e equipe da plataforma — logins fixos usados na demonstração. */
const GESTORES: Array<Omit<Usuario, "id" | "cpf" | "nascimento" | "ativo">> = [
  {
    empresaId: "e1",
    nome: "Helena Castro Vasconcelos",
    email: "helena@aurora.com.br",
    role: "admin",
    unidadeId: "u1",
    setorId: "s1",
    cargoId: "c16",
    admissaoEm: diaISO(-1200),
  },
  {
    empresaId: "e1",
    nome: "Priscila Moraes Aragão",
    email: "priscila.rh@aurora.com.br",
    role: "rh",
    unidadeId: "u1",
    setorId: "s1",
    cargoId: "c16",
    admissaoEm: diaISO(-980),
  },
  {
    empresaId: "e1",
    nome: "Otávio Mendes Ferraz",
    email: "otavio.sesmt@aurora.com.br",
    role: "sesmt",
    unidadeId: "u1",
    setorId: "s1",
    cargoId: "c16",
    admissaoEm: diaISO(-640),
  },
  {
    empresaId: "e2",
    nome: "Denise Aparecida Rangel",
    email: "denise@bemviver.com.br",
    role: "admin",
    unidadeId: "u3",
    setorId: "s6",
    cargoId: "c13",
    admissaoEm: diaISO(-300),
  },
  {
    empresaId: null,
    nome: "Letícia Ramalho",
    email: "leticia@blue.app",
    role: "superuser",
    unidadeId: null,
    setorId: null,
    cargoId: null,
    admissaoEm: null,
  },
];

/* --------------------- perfis de queixa por setor --------------------- */

const PERFIL_SETOR: Record<string, Array<[RegiaoId, Lado]>> = {
  s1: [["cervical", "na"], ["dorsal", "na"], ["punho", "direito"], ["cabeca", "na"], ["lombar", "na"]],
  s2: [["cervical", "na"], ["punho", "direito"], ["dorsal", "na"], ["ombro", "direito"], ["cabeca", "na"]],
  s3: [["lombar", "na"], ["ombro", "direito"], ["joelho", "direito"], ["dorsal", "na"], ["punho", "direito"]],
  s4: [["ombro", "direito"], ["lombar", "na"], ["antebraco", "direito"], ["cervical", "na"], ["punho", "direito"]],
  s5: [["lombar", "na"], ["panturrilha", "direito"], ["ombro", "esquerdo"], ["joelho", "esquerdo"], ["pe", "direito"]],
  s6: [["punho", "direito"], ["ombro", "direito"], ["lombar", "na"], ["cervical", "na"], ["canela", "direito"]],
  s7: [["ombro", "esquerdo"], ["lombar", "na"], ["canela", "direito"], ["antebraco", "direito"], ["punho", "direito"]],
};

const TIPO_POR_REGIAO: Partial<Record<RegiaoId, TipoDor[]>> = {
  punho: ["formigamento", "pontada", "queimacao"],
  antebraco: ["queimacao", "cansaco", "formigamento"],
  lombar: ["peso", "rigidez", "pontada"],
  dorsal: ["peso", "rigidez", "cansaco"],
  cervical: ["rigidez", "peso", "latejante"],
  ombro: ["pontada", "rigidez", "cansaco"],
  cabeca: ["latejante", "peso"],
  joelho: ["pontada", "rigidez"],
  panturrilha: ["cansaco", "peso"],
  canela: ["cansaco", "queimacao"],
  pe: ["queimacao", "cansaco"],
};

const AGRAVA_POR_REGIAO: Partial<Record<RegiaoId, Agravante[]>> = {
  punho: ["esforco_repetitivo", "movimento_especifico", "fim_do_turno"],
  antebraco: ["esforco_repetitivo", "fim_do_turno"],
  lombar: ["levantar_peso", "ficar_sentado", "fim_do_turno"],
  dorsal: ["ficar_sentado", "fim_do_turno"],
  cervical: ["ficar_sentado", "fim_do_turno", "movimento_especifico"],
  ombro: ["esforco_repetitivo", "levantar_peso", "movimento_especifico"],
  joelho: ["ficar_em_pe", "movimento_especifico"],
  panturrilha: ["ficar_em_pe", "fim_do_turno"],
  canela: ["ficar_em_pe", "fim_do_turno"],
  pe: ["ficar_em_pe", "fim_do_turno"],
  cabeca: ["fim_do_turno", "nao_sei"],
};

const OBSERVACOES = [
  "Piora quando fico muito tempo na mesma posição.",
  "Começou depois que mudaram o layout do posto.",
  "Sinto mais no fim do turno, melhora no dia seguinte.",
  "Tomei analgésico por conta própria para conseguir trabalhar.",
  "A cadeira não regula na altura certa.",
  "Acordei com a região travada hoje.",
  "Melhorou um pouco depois do alongamento na pausa.",
  "Estou evitando forçar essa região durante o expediente.",
  "O peso das caixas parece ter aumentado nas últimas semanas.",
  "",
  "",
  "",
  "",
];

/* ----------------------------- construção ----------------------------- */

function ehFimDeSemana(iso: string): boolean {
  const d = new Date(iso).getDay();
  return d === 0 || d === 6;
}

function escolha<T>(rnd: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}

function intensidadeDe(rnd: () => number, base: number): Intensidade {
  const v = Math.min(5, Math.max(1, Math.round(base + (rnd() - 0.5) * 1.6)));
  return v as Intensidade;
}

export interface Seed {
  empresas: Empresa[];
  unidades: Unidade[];
  setores: Setor[];
  cargos: Cargo[];
  usuarios: Usuario[];
  queixas: Queixa[];
  checkins: CheckIn[];
}

export function construirSeed(): Seed {
  const base = hojeISO();
  const usuarios: Usuario[] = [];
  const queixas: Queixa[] = [];
  const checkins: CheckIn[] = [];
  let idx = 0;

  const unidadeDoSetor = new Map(SETORES.map((s) => [s.id, s.unidadeId]));

  const quadros: Array<[string, SeedColab[]]> = [
    ["e1", QUADRO_E1],
    ["e2", QUADRO_E2],
  ];

  for (const [empresaId, quadro] of quadros) {
    for (const sc of quadro) {
      idx += 1;
      const id = `col-${idx}`;
      const rnd = mulberry32(idx * 7919 + 13);

      usuarios.push({
        id,
        empresaId,
        nome: sc.nome,
        cpf: cpfFake(idx),
        nascimento: diaISO(-(7000 + Math.floor(rnd() * 7000))),
        email: null,
        role: "colaborador",
        unidadeId: unidadeDoSetor.get(sc.setorId) ?? null,
        setorId: sc.setorId,
        cargoId: sc.cargoId,
        admissaoEm: diaISO(-(120 + Math.floor(rnd() * 2200))),
        ativo: true,
      });

      const adesao = 0.62 + rnd() * 0.33;
      const perfil = PERFIL_SETOR[sc.setorId] ?? ([["lombar", "na"]] as Array<[RegiaoId, Lado]>);
      let seq = 0;

      for (let d = JANELA_DIAS; d >= 0; d -= 1) {
        const data = diaISO(-d, base);
        if (ehFimDeSemana(data)) continue;
        if (rnd() > adesao) continue; // não fez check-in nesse dia

        seq += 1;
        const recencia = 1 - d / JANELA_DIAS; // 0 = antigo, 1 = hoje
        let p = sc.propensao;
        if (sc.escalada) p *= 0.45 + 1.5 * recencia;
        if (sc.melhorou) p *= 1.5 - 1.1 * recencia;

        const desconforto = rnd() < p;
        checkins.push({
          id: `chk-${id}-${seq}`,
          empresaId,
          colaboradorId: id,
          data,
          estado: desconforto ? "desconforto" : "bem",
        });
        if (!desconforto) continue;

        const [reg, lado] = sc.foco && rnd() < 0.72 ? sc.foco : escolha(rnd, perfil);

        let baseInt = 2.4 + sc.propensao * 4;
        if (sc.escalada) baseInt = 1.9 + 2.6 * recencia;
        if (sc.melhorou) baseInt = 4.1 - 1.8 * recencia;

        const inicio: InicioDor =
          d > 40 ? "mais_de_mes" : d > 14 ? "esse_mes" : d > 3 ? "essa_semana" : "hoje";

        queixas.push({
          id: `qx-${id}-${seq}`,
          empresaId,
          colaboradorId: id,
          data,
          regiao: reg,
          lado,
          intensidade: intensidadeDe(rnd, baseInt),
          tipo: escolha(rnd, TIPO_POR_REGIAO[reg] ?? ["pontada", "peso", "cansaco"]),
          inicio,
          agrava: escolha(rnd, AGRAVA_POR_REGIAO[reg] ?? ["nao_sei", "fim_do_turno"]),
          relacaoTrabalho: rnd() < 0.74 ? "sim" : rnd() < 0.6 ? "nao_sei" : "nao",
          observacao: escolha(rnd, OBSERVACOES),
        });
      }
    }
  }

  for (const g of GESTORES) {
    idx += 1;
    usuarios.push({
      ...g,
      id: `usr-${idx}`,
      cpf: cpfFake(idx),
      nascimento: diaISO(-(9000 + idx * 37)),
      ativo: true,
    });
  }

  return {
    empresas: EMPRESAS,
    unidades: UNIDADES,
    setores: SETORES,
    cargos: CARGOS,
    usuarios,
    queixas,
    checkins,
  };
}

/** Senha única de demonstração — o backend real fará hash e política própria. */
export const SENHA_DEMO = "blue1234";

export { JANELA_DIAS };
