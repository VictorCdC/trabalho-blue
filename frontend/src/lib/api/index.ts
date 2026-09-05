import type {
  Alerta,
  Caso,
  Cargo,
  CheckIn,
  ColaboradorLinha,
  ContagemCasos,
  Empresa,
  Estrutura,
  EstadoCheckIn,
  MeuResumo,
  Pagina,
  PainelResumo,
  Plano,
  Queixa,
  RegrasAlerta,
  ResumoCargo,
  ResumoColaborador,
  ResumoEmpresa,
  ResumoSetor,
  Role,
  Setor,
  StatusCaso,
  TipoAcao,
  Unidade,
  UsuarioEu,
  UsuarioListado,
} from "../types";
import { httpApi } from "./http";

/* Único ponto de acoplamento com o servidor.

   O que mudou em relação ao desenho anterior: não existe mais `snapshot()`.
   Ele devolvia a empresa inteira — todos os usuários, queixas, check-ins e
   casos — e cada tela reagregava aquilo em `useMemo`. Agora cada chamada traz
   o recorte já filtrado, já somado e já paginado pelo backend. */

/** Recorte de unidade/setor/cargo/período. Vira query string. */
export interface Recorte {
  unidadeId?: string;
  setorId?: string;
  cargoId?: string;
  dias?: number;
}

export interface Faixa {
  limit?: number;
  offset?: number;
}

export type NovaQueixa = Omit<Queixa, "id" | "colaboradorId" | "data">;

export interface NovaAcao {
  tipo: TipoAcao;
  descricao: string;
  concluida?: boolean;
}

export interface NovoUsuario {
  nome: string;
  cpf: string;
  email: string | null;
  role: Role;
  unidadeId: string | null;
  setorId: string | null;
  cargoId: string | null;
  /** obrigatória: é a senha do primeiro acesso */
  nascimento: string;
  admissaoEm: string | null;
}

export type PatchUsuario = Partial<
  Pick<UsuarioListado, "nome" | "email" | "role" | "unidadeId" | "setorId" | "cargoId" | "ativo">
>;

// as contagens de efetivo são calculadas pelo servidor, não enviadas
export type NovaUnidade = Omit<Unidade, "id" | "empresaId" | "colaboradores">;
export type NovoSetor = Omit<Setor, "id" | "colaboradores">;
export type NovoCargo = Omit<Cargo, "id">;

export type PatchEmpresa = Partial<
  Pick<Empresa, "nome" | "plano" | "ativa" | "colaboradoresContratados">
>;

/** Erro de resposta do servidor, com a mensagem que ele mandou exibir. */
export class ErroApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroApi";
  }
}

export interface BlueApi {
  /* sessão — o cookie é httpOnly, então quem sabe quem está logado é o servidor */
  entrar(cpf: string, senha: string): Promise<UsuarioEu>;
  eu(): Promise<UsuarioEu | null>;
  sair(): Promise<void>;
  /** tenant que o superuser está olhando; ignorado para os demais perfis */
  usarEmpresa(empresaId: string | null): void;

  estrutura(): Promise<Estrutura>;

  /* painel — agregados */
  painelResumo(recorte: Recorte): Promise<PainelResumo>;
  painelSetores(recorte: Recorte): Promise<ResumoSetor[]>;
  painelCargos(recorte: Recorte): Promise<ResumoCargo[]>;

  /* alertas */
  regrasAlerta(): Promise<RegrasAlerta>;
  alertas(
    recorte: Recorte,
    tipo?: "todos" | "individuais" | "coletivos",
    faixa?: Faixa,
  ): Promise<Pagina<Alerta>>;

  /* colaboradores */
  colaboradores(recorte: Recorte, busca?: string, faixa?: Faixa): Promise<Pagina<ColaboradorLinha>>;
  colaborador(id: string): Promise<ResumoColaborador>;
  queixasDoColaborador(id: string, dias: number, faixa?: Faixa): Promise<Pagina<Queixa>>;

  /* casos */
  casos(status: StatusCaso | "todos", faixa?: Faixa): Promise<Pagina<Caso>>;
  contagemCasos(): Promise<ContagemCasos>;
  caso(id: string): Promise<Caso>;
  abrirCaso(alertaId: string): Promise<Caso>;
  mudarStatusCaso(casoId: string, status: StatusCaso): Promise<Caso>;
  adicionarAcao(casoId: string, acao: NovaAcao): Promise<Caso>;
  concluirAcao(casoId: string, acaoId: string, concluida: boolean): Promise<Caso>;

  /* área do colaborador */
  meuResumo(): Promise<MeuResumo>;
  minhasQueixas(dias: number, faixa?: Faixa): Promise<Pagina<Queixa>>;
  meusCheckins(dias: number): Promise<CheckIn[]>;
  registrarCheckIn(estado: EstadoCheckIn): Promise<CheckIn>;
  registrarQueixa(entrada: NovaQueixa): Promise<Queixa>;

  /* administração */
  usuarios(
    filtro?: { role?: Role; busca?: string },
    faixa?: Faixa,
  ): Promise<Pagina<UsuarioListado>>;
  criarUsuario(entrada: NovoUsuario): Promise<UsuarioListado>;
  atualizarUsuario(id: string, patch: PatchUsuario): Promise<UsuarioListado>;
  criarUnidade(entrada: NovaUnidade): Promise<Unidade>;
  criarSetor(entrada: NovoSetor): Promise<Setor>;
  criarCargo(entrada: NovoCargo): Promise<Cargo>;
  removerSetor(id: string): Promise<void>;
  removerCargo(id: string): Promise<void>;

  /* plataforma */
  empresas(): Promise<ResumoEmpresa[]>;
  criarEmpresa(nome: string, cnpj: string, plano: Plano, contratados: number): Promise<Empresa>;
  atualizarEmpresa(id: string, patch: PatchEmpresa): Promise<Empresa>;
}

export const api: BlueApi = httpApi;
