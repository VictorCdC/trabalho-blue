/* Modelo de domínio do BLUE. Espelha o que o backend expõe (backend/app/esquemas.py) —
   mudar algo aqui é mudar o contrato.

   Os agregados (Kpis, PontoSerie, ContagemRegiao, ResumoSetor…) eram calculados
   no navegador, em `lib/analytics.ts`, sobre o histórico inteiro da empresa.
   Hoje o backend os devolve prontos: o que sobrou aqui é a forma deles. */

export type Role = "colaborador" | "rh" | "sesmt" | "admin" | "superuser";

export type Plano = "essencial" | "profissional" | "enterprise";

/** Envelope de toda listagem paginada. `total` é a contagem sem limit/offset. */
export interface Pagina<T> {
  itens: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface Empresa {
  id: string;
  nome: string;
  cnpj: string;
  plano: Plano;
  ativa: boolean;
  criadaEm: string | null; // ISO
  colaboradoresContratados: number;
}

export interface Unidade {
  id: string;
  empresaId: string;
  nome: string;
  cidade: string;
  uf: string;
  /** efetivo lotado — cadastral (organograma), não clínico */
  colaboradores: number;
}

export interface Setor {
  id: string;
  unidadeId: string;
  nome: string;
  colaboradores: number;
}

export interface Cargo {
  id: string;
  setorId: string;
  nome: string;
}

/** O contexto do tenant ativo — chega numa chamada só. */
export interface Estrutura {
  empresa: Empresa;
  /** efetivo ativo da empresa, para o cabeçalho */
  colaboradores: number;
  unidades: Unidade[];
  setores: Setor[];
  cargos: Cargo[];
}

/* ------------------------------- pessoas ------------------------------ */

/** O próprio usuário autenticado. Vem de /auth/eu, a partir do cookie. */
export interface UsuarioEu {
  id: string;
  empresaId: string | null; // null = superuser (plataforma)
  nome: string;
  cpf: string; // só dígitos — é o dado do próprio usuário
  email: string | null;
  role: Role;
  unidadeId: string | null;
  setorId: string | null;
  cargoId: string | null;
  admissaoEm: string | null;
  /** nomes já resolvidos pelo servidor: o colaborador não baixa a estrutura */
  empresaNome: string | null;
  unidadeNome: string | null;
  setorNome: string | null;
  cargoNome: string | null;
}

/** Linha da administração de acessos. Sem CPF: a tela não precisa dele. */
export interface UsuarioListado {
  id: string;
  nome: string;
  email: string | null;
  role: Role;
  ativo: boolean;
  unidadeId: string | null;
  setorId: string | null;
  cargoId: string | null;
}

/** Linha do quadro de pessoal.
 *
 *  Os quatro campos clínicos vêm `null` para quem não tem `dados:identificados`
 *  — nulo, e não zero: zero seria uma afirmação sobre a saúde de alguém. */
export interface ColaboradorLinha {
  id: string;
  nome: string;
  cpfMascarado: string; // já ocultado pelo servidor
  unidadeId: string | null;
  setorId: string | null;
  cargoId: string | null;
  admissaoEm: string | null;
  ativo: boolean;

  queixas: number | null;
  intensidadeMedia: number | null;
  regiaoTop: RegiaoId | null;
  ultimaQueixaEm: string | null;
  alertas: number | null;
}

/* ------------------------------- queixa ------------------------------- */

export type Lado = "esquerdo" | "direito" | "na";

export type Intensidade = 1 | 2 | 3 | 4 | 5;

export type TipoDor =
  "pontada" | "queimacao" | "peso" | "formigamento" | "rigidez" | "latejante" | "cansaco";

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
  colaboradorId: string;
  data: string; // ISO — um por colaborador por dia
  estado: EstadoCheckIn;
}

/* ------------------------------- alertas ------------------------------ */

export type Severidade = "baixa" | "media" | "alta";

interface AlertaComum {
  id: string;
  regiao: RegiaoId;
  janelaDias: number;
  ultimaEm: string;
  severidade: Severidade;
  /** caso já aberto para este alerta, resolvido pelo servidor */
  casoId: string | null;
}

export interface AlertaIndividual extends AlertaComum {
  kind: "individual";
  /** nulos sem `dados:identificados`: o alerta existe, a pessoa não sai */
  colaboradorId: string | null;
  colaboradorNome: string | null;
  setorId: string | null;
  lado: Lado;
  ocorrencias: number;
  intensidadeMedia: number;
}

export interface AlertaColetivo extends AlertaComum {
  kind: "coletivo";
  unidadeId: string;
  setorId: string;
  afetados: number;
  totalSetor: number;
  percentual: number;
}

export type Alerta = AlertaIndividual | AlertaColetivo;

/** Limiares em vigor, ditos pelo servidor que os aplica. */
export interface RegrasAlerta {
  janelaDias: number;
  individualMinOcorrencias: number;
  coletivoMinPercentual: number;
  coletivoMinPessoas: number;
}

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
  alertaId: string;
  origem: "individual" | "coletivo";
  regiao: RegiaoId;
  /** lado do corpo; "na" para regiões centrais e casos coletivos */
  lado: Lado;
  colaboradorId: string | null;
  /** nome resolvido pelo servidor; nulo sem `dados:identificados` */
  colaboradorNome: string | null;
  setorId: string | null;
  status: StatusCaso;
  severidade: Severidade;
  responsavelId: string;
  responsavelNome: string | null;
  abertoEm: string;
  atualizadoEm: string;
  /** vazio na listagem, preenchido no detalhe */
  acoes: AcaoCaso[];
  acoesTotais: number;
  acoesConcluidas: number;
}

export interface ContagemCasos {
  todos: number;
  aberto: number;
  emAndamento: number;
  resolvido: number;
}

/* ------------------------------ agregados ----------------------------- */

export interface Kpis {
  colaboradoresAtivos: number;
  checkins: number;
  adesao: number;
  queixas: number;
  pessoasComQueixa: number;
  percentualAfetado: number;
  intensidadeMedia: number;
  relacaoTrabalhoSim: number;
  /** variação percentual contra o período anterior de igual duração */
  variacaoQueixas: number;
  taxaDesconforto: number;
  pessoasRecorrentes: number;
  percentualRecorrente: number;
}

export interface PontoSerie {
  data: string;
  queixas: number;
  checkins: number;
  bem: number;
  intensidadeMedia: number;
}

export interface ContagemRegiao {
  regiao: RegiaoId;
  total: number;
  pessoas: number;
  intensidadeMedia: number;
}

export interface ContagemRegiaoLado extends ContagemRegiao {
  lado: Lado;
}

export interface FatiaIntensidade {
  intensidade: Intensidade;
  total: number;
}

/** Contagem de um valor de vocabulário fechado (tipo de dor, agravante…).
 *  O rótulo legível continua no frontend: é texto de interface, não dado. */
export interface ContagemRotulada {
  chave: string;
  total: number;
}

export interface ContagemAlertas {
  todos: number;
  individuais: number;
  coletivos: number;
  alta: number;
}

/** Linha por setor. `suprimido` significa grupo pequeno demais para divulgar —
 *  nesse caso todo o resto vem nulo, inclusive a contagem de pessoas. */
export interface ResumoSetor {
  setorId: string;
  suprimido: boolean;
  totalColaboradores: number | null;
  pessoasComQueixa: number | null;
  queixas: number | null;
  intensidadeMedia: number | null;
  adesao: number | null;
  regiaoTop: RegiaoId | null;
  percentualAfetado: number | null;
  taxaDesconforto: number | null;
  pessoasRecorrentes: number | null;
  percentualRecorrente: number | null;
  alertas: number;
}

export interface ResumoCargo {
  cargoId: string;
  setorId: string | null;
  suprimido: boolean;
  efetivo: number | null;
  pessoas: number | null;
  total: number | null;
  intensidadeMedia: number | null;
  percentual: number | null;
}

/** Tudo que o painel desenha, numa resposta só. */
export interface PainelResumo {
  /** recorte com menos de K_MINIMO_AGREGACAO pessoas: nada é divulgado */
  suprimido: boolean;
  dias: number;
  colaboradores: number | null;
  kpis: Kpis | null;
  serie: PontoSerie[];
  /** a série vem semanal em janelas longas, onde o gráfico diário fica ilegível */
  porSemana: boolean;
  regioes: ContagemRegiao[];
  calor: ContagemRegiaoLado[];
  intensidades: FatiaIntensidade[];
  tipos: ContagemRotulada[];
  agravantes: ContagemRotulada[];
  relacoes: ContagemRotulada[];
  alertas: ContagemAlertas | null;
}

/** A ficha que o SESMT abre. Leitura auditada no servidor. */
export interface ResumoColaborador {
  colaborador: ColaboradorLinha;
  queixas30Dias: number;
  queixasJanela: number;
  checkins30Dias: number;
  checkinsBem30Dias: number;
  intensidadeMedia30Dias: number;
  sequenciaCheckin: number;
  janelaDias: number;
  regioes: ContagemRegiao[];
  calor: ContagemRegiaoLado[];
  serie: PontoSerie[];
  alertas: AlertaIndividual[];
  casos: Caso[];
}

/** A tela inicial do colaborador, pronta. */
export interface MeuResumo {
  checkinHoje: CheckIn | null;
  sequencia: number;
  checkins30Dias: number;
  queixas30Dias: number;
  regioes60Dias: ContagemRegiao[];
  calor60Dias: ContagemRegiaoLado[];
  casoAtivo: Caso | null;
}

export interface ResumoEmpresa {
  empresa: Empresa;
  colaboradores: number;
  queixas30Dias: number;
  casosAbertos: number;
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
