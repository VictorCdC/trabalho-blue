/* Modelo de domínio do BLUE. Espelha o que o backend deverá expor —
   mudar algo aqui é mudar o contrato. */

export type Role = "colaborador" | "rh" | "sesmt" | "admin" | "superuser";

export type Plano = "essencial" | "profissional" | "enterprise";

export interface Empresa {
  id: string;
  nome: string;
  cnpj: string;
  plano: Plano;
  ativa: boolean;
  criadaEm: string; // ISO
  colaboradoresContratados: number;
}

export interface Unidade {
  id: string;
  empresaId: string;
  nome: string;
  cidade: string;
  uf: string;
}

export interface Setor {
  id: string;
  unidadeId: string;
  nome: string;
}

export interface Cargo {
  id: string;
  setorId: string;
  nome: string;
}

export interface Usuario {
  id: string;
  empresaId: string | null; // null = superuser (plataforma)
  nome: string;
  cpf: string; // só dígitos
  nascimento: string; // ISO
  email: string | null;
  role: Role;
  unidadeId: string | null;
  setorId: string | null;
  cargoId: string | null;
  admissaoEm: string | null;
  ativo: boolean;
}

/* ------------------------------- queixa ------------------------------- */

export type Lado = "esquerdo" | "direito" | "na";

export type Intensidade = 1 | 2 | 3 | 4 | 5;

export type TipoDor =
  | "pontada"
  | "queimacao"
  | "peso"
  | "formigamento"
  | "rigidez"
  | "latejante"
  | "cansaco";

export type InicioDor = "hoje" | "essa_semana" | "esse_mes" | "mais_de_mes";

export type Agravante =
  | "esforco_repetitivo"
  | "levantar_peso"
  | "ficar_sentado"
  | "ficar_em_pe"
  | "movimento_especifico"
  | "fim_do_turno"
  | "nao_sei";

export type RelacaoTrabalho = "sim" | "nao" | "nao_sei";

export interface Queixa {
  id: string;
  empresaId: string;
  colaboradorId: string;
  data: string; // ISO
  regiao: RegiaoId;
  lado: Lado;
  intensidade: Intensidade;
  tipo: TipoDor;
  inicio: InicioDor;
  agrava: Agravante;
  relacaoTrabalho: RelacaoTrabalho;
  observacao: string;
}

/* ------------------------------ check-in ------------------------------ */

export type EstadoCheckIn = "bem" | "desconforto";

export interface CheckIn {
  id: string;
  empresaId: string;
  colaboradorId: string;
  data: string; // ISO — um por colaborador por dia
  estado: EstadoCheckIn;
}

/* ------------------------------- alertas ------------------------------ */

export type Severidade = "baixa" | "media" | "alta";

export interface AlertaIndividual {
  id: string;
  kind: "individual";
  empresaId: string;
  colaboradorId: string;
  regiao: RegiaoId;
  lado: Lado;
  ocorrencias: number;
  intensidadeMedia: number;
  janelaDias: number;
  ultimaEm: string;
  severidade: Severidade;
}

export interface AlertaColetivo {
  id: string;
  kind: "coletivo";
  empresaId: string;
  unidadeId: string;
  setorId: string;
  regiao: RegiaoId;
  afetados: number;
  totalSetor: number;
  percentual: number;
  janelaDias: number;
  ultimaEm: string;
  severidade: Severidade;
}

export type Alerta = AlertaIndividual | AlertaColetivo;

/* -------------------------------- casos ------------------------------- */

export type StatusCaso = "aberto" | "em_andamento" | "resolvido";

export type TipoAcao =
  | "encaminhado_medico"
  | "avaliacao_ergonomica"
  | "ginastica_laboral"
  | "ajuste_posto"
  | "mudanca_funcao"
  | "treinamento"
  | "reavaliacao"
  | "observacao";

export interface AcaoCaso {
  id: string;
  data: string; // ISO
  tipo: TipoAcao;
  descricao: string;
  autorId: string;
  concluida: boolean;
}

export interface Caso {
  id: string;
  numero: number;
  empresaId: string;
  alertaId: string;
  origem: "individual" | "coletivo";
  titulo: string;
  regiao: RegiaoId;
  /** lado do corpo; "na" para regiões centrais e casos coletivos */
  lado: Lado;
  colaboradorId: string | null;
  setorId: string | null;
  status: StatusCaso;
  severidade: Severidade;
  responsavelId: string;
  abertoEm: string;
  atualizadoEm: string;
  acoes: AcaoCaso[];
}

/* ------------------------- regiões do corpo --------------------------- */

export type RegiaoId =
  // centrais — vista frontal
  | "cabeca"
  | "pescoco"
  | "peito"
  | "abdomen"
  | "quadril"
  // centrais — vista posterior
  | "nuca"
  | "cervical"
  | "dorsal"
  | "lombar"
  // bilaterais — membros superiores (visíveis nas duas vistas)
  | "ombro"
  | "braco"
  | "cotovelo"
  | "antebraco"
  | "punho"
  | "mao"
  // bilaterais — membros inferiores, vista frontal
  | "coxa"
  | "joelho"
  | "canela"
  | "pe"
  // bilaterais — membros inferiores, vista posterior
  | "gluteo"
  | "posterior_coxa"
  | "panturrilha"
  | "calcanhar";

export type Vista = "frente" | "costas";

export interface Regiao {
  id: RegiaoId;
  nome: string;
  /** rótulo enxuto para gráficos e tabelas, quando o nome é longo */
  curto?: string;
  bilateral: boolean;
  vistas: Vista[];
  grupo: "cabeca_tronco" | "membro_superior" | "membro_inferior";
}
