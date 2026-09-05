import type {
  Alerta,
  Cargo,
  Caso,
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
  Setor,
  Unidade,
  UsuarioEu,
  UsuarioListado,
} from "../types";
import {
  ErroApi,
  type BlueApi,
  type Faixa,
  type NovaQueixa,
  type NovaUnidade,
  type NovoCargo,
  type NovoSetor,
  type NovoUsuario,
  type PatchEmpresa,
  type PatchUsuario,
  type Recorte,
} from "./index";

/* Cliente HTTP do BLUE.

   Três coisas que ele nunca faz, e que valem como lembrete:

   - não guarda token. A sessão é um cookie httpOnly, então `credentials:
     "include"` é tudo que existe de autenticação aqui — JavaScript não lê nem
     escreve esse cookie, e é por isso que um XSS não vira sessão roubada.
   - não filtra nem agrega. Se uma tela precisa de um recorte, ele vira query
     string e o Postgres responde.
   - não decide permissão. O 403 vem do servidor; a guarda de rota do frontend
     é só para não mostrar um link que levaria a ele. */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Tenant que o superuser está olhando. Não é credencial: é a escolha de qual
    cliente da plataforma está aberto, e o backend ignora o cabeçalho para
    quem pertence a uma empresa. */
let empresaAtiva: string | null = null;

function querystring(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    if (valor === undefined || valor === null || valor === "") continue;
    q.set(chave, String(valor));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

function doRecorte(recorte: Recorte, faixa?: Faixa) {
  return {
    unidade_id: recorte.unidadeId,
    setor_id: recorte.setorId,
    cargo_id: recorte.cargoId,
    dias: recorte.dias,
    limit: faixa?.limit,
    offset: faixa?.offset,
  };
}

async function pedir<T>(caminho: string, init?: RequestInit): Promise<T> {
  const cabecalhos: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  if (init?.body) cabecalhos["Content-Type"] = "application/json";
  if (empresaAtiva) cabecalhos["X-Empresa-Id"] = empresaAtiva;

  const resposta = await fetch(`${BASE}${caminho}`, {
    ...init,
    headers: cabecalhos,
    credentials: "include", // o cookie de sessão
  });

  if (resposta.status === 204) return undefined as T;
  if (!resposta.ok) {
    throw new ErroApi(resposta.status, await mensagemDeErro(resposta));
  }
  return (await resposta.json()) as T;
}

async function mensagemDeErro(resposta: Response): Promise<string> {
  try {
    const corpo = (await resposta.json()) as { detail?: unknown };
    if (typeof corpo.detail === "string") return corpo.detail;
    // erro de validação do FastAPI: uma lista de problemas por campo
    if (Array.isArray(corpo.detail)) {
      const primeiro = corpo.detail[0] as { msg?: string } | undefined;
      if (primeiro?.msg) return primeiro.msg;
    }
  } catch {
    // resposta sem JSON: cai na mensagem genérica abaixo
  }
  return resposta.status >= 500
    ? "O servidor não conseguiu responder. Tente de novo em instantes."
    : "Não foi possível completar a operação.";
}

export const httpApi: BlueApi = {
  /* ------------------------------ sessão ------------------------------ */

  entrar(usuario, senha) {
    return pedir<UsuarioEu>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ usuario, senha }),
    });
  },

  async eu() {
    try {
      return await pedir<UsuarioEu>("/auth/eu");
    } catch (erro) {
      // 401 aqui é o caso normal de "ninguém logado", não uma falha
      if (erro instanceof ErroApi && erro.status === 401) return null;
      throw erro;
    }
  },

  async sair() {
    await pedir<void>("/auth/sair", { method: "POST" });
    empresaAtiva = null;
  },

  usarEmpresa(empresaId) {
    empresaAtiva = empresaId;
  },

  estrutura() {
    return pedir<Estrutura>("/estrutura");
  },

  /* ------------------------------ painel ------------------------------ */

  painelResumo(recorte) {
    return pedir<PainelResumo>(`/painel/resumo${querystring(doRecorte(recorte))}`);
  },

  painelSetores(recorte) {
    return pedir<ResumoSetor[]>(`/painel/setores${querystring(doRecorte(recorte))}`);
  },

  painelCargos(recorte) {
    return pedir<ResumoCargo[]>(`/painel/cargos${querystring(doRecorte(recorte))}`);
  },

  /* ------------------------------ alertas ----------------------------- */

  regrasAlerta() {
    return pedir<RegrasAlerta>("/alertas/regras");
  },

  alertas(recorte, tipo = "todos", faixa) {
    return pedir<Pagina<Alerta>>(`/alertas${querystring({ ...doRecorte(recorte, faixa), tipo })}`);
  },

  /* --------------------------- colaboradores -------------------------- */

  colaboradores(recorte, busca, faixa) {
    return pedir<Pagina<ColaboradorLinha>>(
      `/colaboradores${querystring({ ...doRecorte(recorte, faixa), busca })}`,
    );
  },

  colaborador(id) {
    return pedir<ResumoColaborador>(`/colaboradores/${id}`);
  },

  queixasDoColaborador(id, dias, faixa) {
    return pedir<Pagina<Queixa>>(`/colaboradores/${id}/queixas${querystring({ dias, ...faixa })}`);
  },

  /* ------------------------------- casos ------------------------------ */

  casos(status, faixa) {
    return pedir<Pagina<Caso>>(`/casos${querystring({ status, ...faixa })}`);
  },

  contagemCasos() {
    return pedir<ContagemCasos>("/casos/contagem");
  },

  caso(id) {
    return pedir<Caso>(`/casos/${id}`);
  },

  abrirCaso(alertaId) {
    return pedir<Caso>("/casos", { method: "POST", body: JSON.stringify({ alertaId }) });
  },

  mudarStatusCaso(casoId, status) {
    return pedir<Caso>(`/casos/${casoId}`, { method: "PATCH", body: JSON.stringify({ status }) });
  },

  adicionarAcao(casoId, acao) {
    return pedir<Caso>(`/casos/${casoId}/acoes`, { method: "POST", body: JSON.stringify(acao) });
  },

  concluirAcao(casoId, acaoId, concluida) {
    return pedir<Caso>(`/casos/${casoId}/acoes/${acaoId}`, {
      method: "PATCH",
      body: JSON.stringify({ concluida }),
    });
  },

  /* -------------------------- área do colaborador --------------------- */

  meuResumo() {
    return pedir<MeuResumo>("/meu/resumo");
  },

  minhasQueixas(dias, faixa) {
    return pedir<Pagina<Queixa>>(`/meu/queixas${querystring({ dias, ...faixa })}`);
  },

  meusCheckins(dias) {
    return pedir<CheckIn[]>(`/meu/checkins${querystring({ dias })}`);
  },

  registrarCheckIn(estado: EstadoCheckIn) {
    return pedir<CheckIn>("/meu/checkins", { method: "POST", body: JSON.stringify({ estado }) });
  },

  registrarQueixa(entrada: NovaQueixa) {
    return pedir<Queixa>("/meu/queixas", { method: "POST", body: JSON.stringify(entrada) });
  },

  /* --------------------------- administração -------------------------- */

  usuarios(filtro, faixa) {
    return pedir<Pagina<UsuarioListado>>(
      `/usuarios${querystring({ role: filtro?.role, busca: filtro?.busca, ...faixa })}`,
    );
  },

  criarUsuario(entrada: NovoUsuario) {
    return pedir<UsuarioListado>("/usuarios", { method: "POST", body: JSON.stringify(entrada) });
  },

  atualizarUsuario(id, patch: PatchUsuario) {
    return pedir<UsuarioListado>(`/usuarios/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  criarUnidade(entrada: NovaUnidade) {
    return pedir<Unidade>("/unidades", { method: "POST", body: JSON.stringify(entrada) });
  },

  criarSetor(entrada: NovoSetor) {
    return pedir<Setor>("/setores", { method: "POST", body: JSON.stringify(entrada) });
  },

  criarCargo(entrada: NovoCargo) {
    return pedir<Cargo>("/cargos", { method: "POST", body: JSON.stringify(entrada) });
  },

  removerSetor(id) {
    return pedir<void>(`/setores/${id}`, { method: "DELETE" });
  },

  removerCargo(id) {
    return pedir<void>(`/cargos/${id}`, { method: "DELETE" });
  },

  /* ----------------------------- plataforma --------------------------- */

  empresas() {
    return pedir<ResumoEmpresa[]>("/empresas");
  },

  criarEmpresa(nome, cnpj, plano: Plano, contratados) {
    return pedir<Empresa>("/empresas", {
      method: "POST",
      body: JSON.stringify({ nome, cnpj, plano, colaboradoresContratados: contratados }),
    });
  },

  atualizarEmpresa(id, patch: PatchEmpresa) {
    return pedir<Empresa>(`/empresas/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
};
