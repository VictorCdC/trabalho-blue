import type {
  AcaoCaso,
  Alerta,
  Cargo,
  Caso,
  CheckIn,
  Empresa,
  EstadoCheckIn,
  Plano,
  Queixa,
  Role,
  Setor,
  StatusCaso,
  Unidade,
  Usuario,
} from "../types";
import { mockApi } from "./mock";

/* Único ponto de acoplamento com o servidor. Hoje aponta para a
   implementação em memória (./mock). Quando o backend existir, criar
   ./http.ts implementando BlueApi com fetch em NEXT_PUBLIC_API_URL e
   trocar a linha do export no fim deste arquivo — nenhum componente muda. */

export interface Snapshot {
  empresa: Empresa;
  unidades: Unidade[];
  setores: Setor[];
  cargos: Cargo[];
  usuarios: Usuario[];
  queixas: Queixa[];
  checkins: CheckIn[];
  casos: Caso[];
}

export interface ResumoEmpresa {
  empresa: Empresa;
  colaboradores: number;
  queixas30d: number;
  casosAbertos: number;
}

export type LoginResultado = { usuario: Usuario } | { erro: string };

/** Atalhos exibidos na tela de login enquanto o ambiente é de demonstração. */
export interface LoginDemo {
  role: Role;
  nome: string;
  cpf: string;
  senha: string;
  empresaNome: string | null;
}

export type NovaQueixa = Omit<Queixa, "id" | "empresaId" | "data">;
export type NovaAcao = Omit<AcaoCaso, "id" | "data">;
export type NovoUsuario = Omit<Usuario, "id" | "ativo">;
export type NovaUnidade = Omit<Unidade, "id">;
export type NovoSetor = Omit<Setor, "id">;
export type NovoCargo = Omit<Cargo, "id">;

export interface BlueApi {
  login(cpf: string, senha: string): Promise<LoginResultado>;
  loginsDemo(): Promise<LoginDemo[]>;
  usuarioPorId(id: string): Promise<Usuario | null>;
  snapshot(empresaId: string): Promise<Snapshot>;
  listarEmpresas(): Promise<ResumoEmpresa[]>;

  registrarCheckIn(colaboradorId: string, estado: EstadoCheckIn): Promise<CheckIn>;
  registrarQueixa(entrada: NovaQueixa): Promise<Queixa>;

  abrirCaso(alerta: Alerta, responsavelId: string): Promise<Caso>;
  mudarStatusCaso(casoId: string, status: StatusCaso): Promise<Caso>;
  adicionarAcao(casoId: string, acao: NovaAcao): Promise<Caso>;
  concluirAcao(casoId: string, acaoId: string, concluida: boolean): Promise<Caso>;

  criarUsuario(entrada: NovoUsuario): Promise<Usuario>;
  atualizarUsuario(id: string, patch: Partial<Usuario>): Promise<Usuario>;
  criarUnidade(entrada: NovaUnidade): Promise<Unidade>;
  criarSetor(entrada: NovoSetor): Promise<Setor>;
  criarCargo(entrada: NovoCargo): Promise<Cargo>;
  removerCargo(id: string): Promise<void>;
  removerSetor(id: string): Promise<void>;

  criarEmpresa(nome: string, cnpj: string, plano: Plano, contratados: number): Promise<Empresa>;
  atualizarEmpresa(id: string, patch: Partial<Empresa>): Promise<Empresa>;

  reiniciarDemo(): Promise<void>;
}

export const api: BlueApi = mockApi;
