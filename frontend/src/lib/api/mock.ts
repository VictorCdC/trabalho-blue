import { alertasColetivos, alertasIndividuais, ordenarAlertas } from "../analytics";
import { diaISO, hojeISO, mesmoDia } from "../format";
import { construirSeed, SENHA_DEMO, type Seed } from "../mock/seed";
import { rotuloRegiao } from "../regioes";
import type {
  AcaoCaso,
  Role,
  Alerta,
  Caso,
  CheckIn,
  Empresa,
  EstadoCheckIn,
  Queixa,
  Setor,
  StatusCaso,
  TipoAcao,
  Unidade,
  Usuario,
} from "../types";
import type {
  BlueApi,
  LoginDemo,
  NovaAcao,
  NovaQueixa,
  NovoCargo,
  NovoSetor,
  NovaUnidade,
  NovoUsuario,
  Snapshot,
} from "./index";

/* Implementação em memória da BlueApi. Os dados vivem neste módulo e são
   perdidos ao recarregar a página — é um ambiente de demonstração, não um
   banco. Substituir por um cliente HTTP não deve exigir mudança em nenhum
   componente: só a troca em ./index.ts. */

const LATENCIA_MS = 120;

function espera<T>(valor: T): Promise<T> {
  return new Promise((r) => setTimeout(() => r(valor), LATENCIA_MS));
}

let db: Seed = construirSeed();
let casos: Caso[] = [];
let proximoNumero = 1;
let seqId = 0;

function novoId(prefixo: string): string {
  seqId += 1;
  return `${prefixo}-${Date.now().toString(36)}-${seqId}`;
}

/* ------------------------- casos de demonstração ---------------------- */

function todosAlertas(empresaId: string): Alerta[] {
  const qs = db.queixas.filter((q) => q.empresaId === empresaId);
  const colabs = db.usuarios.filter((u) => u.empresaId === empresaId);
  return [
    ...alertasIndividuais(qs),
    ...alertasColetivos(qs, colabs, db.setores),
  ].sort(ordenarAlertas);
}

function tituloDoAlerta(a: Alerta): string {
  if (a.kind === "individual") {
    return `${rotuloRegiao(a.regiao, a.lado)} recorrente`;
  }
  const setor = db.setores.find((s) => s.id === a.setorId);
  return `${rotuloRegiao(a.regiao, "na")} no setor ${setor?.nome ?? ""}`.trim();
}

function montarCaso(
  alerta: Alerta,
  responsavelId: string,
  status: StatusCaso,
  abertoDiasAtras: number,
  acoes: Array<[number, TipoAcao, string, boolean]>,
): Caso {
  // id derivado do alerta: um caso por alerta, e o link continua válido
  // depois de um F5 (o mock reconstrói tudo a cada carga da página)
  const id = `caso-${alerta.id}`;
  return {
    id,
    numero: proximoNumero++,
    empresaId: alerta.empresaId,
    alertaId: alerta.id,
    origem: alerta.kind,
    titulo: tituloDoAlerta(alerta),
    regiao: alerta.regiao,
    lado: alerta.kind === "individual" ? alerta.lado : "na",
    colaboradorId: alerta.kind === "individual" ? alerta.colaboradorId : null,
    setorId: alerta.kind === "coletivo" ? alerta.setorId : null,
    status,
    severidade: alerta.severidade,
    responsavelId,
    abertoEm: diaISO(-abertoDiasAtras),
    atualizadoEm: diaISO(-(acoes.at(-1)?.[0] ?? abertoDiasAtras)),
    acoes: acoes.map(([dias, tipo, descricao, concluida], i) => ({
      id: `${id}-acao-${i}`,
      data: diaISO(-dias),
      tipo,
      descricao,
      autorId: responsavelId,
      concluida,
    })),
  };
}

function semearCasos(): void {
  casos = [];
  proximoNumero = 1;

  const sesmt = db.usuarios.find((u) => u.role === "sesmt" && u.empresaId === "e1");
  if (!sesmt) return;
  const alertas = todosAlertas("e1");

  const coletivoLombarEstoque = alertas.find(
    (a) => a.kind === "coletivo" && a.setorId === "s3" && a.regiao === "lombar",
  );
  if (coletivoLombarEstoque) {
    casos.push(
      montarCaso(coletivoLombarEstoque, sesmt.id, "em_andamento", 21, [
        [21, "avaliacao_ergonomica", "Vistoria do fluxo de recebimento e da altura das prateleiras.", true],
        [16, "treinamento", "Treinamento de levantamento de carga para toda a equipe do turno da manhã.", true],
        [9, "ginastica_laboral", "Ginástica laboral 3x por semana, 10 min antes do início do turno.", false],
        [9, "reavaliacao", "Reavaliar indicadores do setor em 30 dias.", false],
      ]),
    );
  }

  const coletivoOmbroProducao = alertas.find(
    (a) => a.kind === "coletivo" && a.setorId === "s4" && a.regiao === "ombro",
  );
  if (coletivoOmbroProducao) {
    casos.push(
      montarCaso(coletivoOmbroProducao, sesmt.id, "resolvido", 58, [
        [58, "avaliacao_ergonomica", "Medição da altura da bancada da linha de montagem 2.", true],
        [50, "ajuste_posto", "Bancadas reguladas e apoio de braço instalado em 6 postos.", true],
        [36, "ginastica_laboral", "Alongamento de ombro incluído na pausa da manhã.", true],
        [12, "reavaliacao", "Queda de 63% nos relatos de ombro no setor. Caso encerrado.", true],
      ]),
    );
  }

  const ana = db.usuarios.find((u) => u.nome === "Ana Beatriz Nogueira");
  const individualAna = alertas.find(
    (a) => a.kind === "individual" && a.colaboradorId === ana?.id && a.regiao === "punho",
  );
  if (individualAna) {
    casos.push(
      montarCaso(individualAna, sesmt.id, "aberto", 4, [
        [4, "observacao", "Relatos de punho direito em escalada nas últimas 3 semanas, intensidade crescente.", true],
      ]),
    );
  }

  const individualExtra = alertas.find(
    (a) => a.kind === "individual" && a.severidade === "alta" && a.colaboradorId !== ana?.id,
  );
  if (individualExtra) {
    casos.push(
      montarCaso(individualExtra, sesmt.id, "em_andamento", 13, [
        [13, "encaminhado_medico", "Encaminhado ao médico do trabalho para avaliação clínica.", true],
        [6, "ajuste_posto", "Aguardando troca da cadeira e do apoio de punho.", false],
      ]),
    );
  }
}

semearCasos();

/* ------------------------------ helpers ------------------------------- */

function snapshotDe(empresaId: string): Snapshot {
  const unidades = db.unidades.filter((u) => u.empresaId === empresaId);
  const idsUnidade = new Set(unidades.map((u) => u.id));
  const setores = db.setores.filter((s) => idsUnidade.has(s.unidadeId));
  const idsSetor = new Set(setores.map((s) => s.id));
  return {
    empresa: db.empresas.find((e) => e.id === empresaId)!,
    unidades,
    setores,
    cargos: db.cargos.filter((c) => idsSetor.has(c.setorId)),
    usuarios: db.usuarios.filter((u) => u.empresaId === empresaId),
    queixas: db.queixas.filter((q) => q.empresaId === empresaId),
    checkins: db.checkins.filter((c) => c.empresaId === empresaId),
    casos: casos.filter((c) => c.empresaId === empresaId),
  };
}

function somenteDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/* -------------------------------- api --------------------------------- */

export const mockApi: BlueApi = {
  async login(cpf, senha) {
    const digitos = somenteDigitos(cpf);
    const usuario = db.usuarios.find((u) => u.cpf === digitos);
    await espera(null);
    if (!usuario) return { erro: "CPF não encontrado." };
    if (senha !== SENHA_DEMO) return { erro: "Senha incorreta." };
    if (!usuario.ativo) return { erro: "Acesso desativado. Procure o RH da sua empresa." };
    return { usuario };
  },

  async loginsDemo() {
    const ordem: Role[] = ["colaborador", "rh", "sesmt", "admin", "superuser"];
    const preferidos: Partial<Record<Role, string>> = {
      colaborador: "Ana Beatriz Nogueira",
      rh: "Priscila Moraes Aragão",
      sesmt: "Otávio Mendes Ferraz",
      admin: "Helena Castro Vasconcelos",
      superuser: "Letícia Ramalho",
    };
    const lista: LoginDemo[] = [];
    for (const role of ordem) {
      const u =
        db.usuarios.find((x) => x.role === role && x.nome === preferidos[role]) ??
        db.usuarios.find((x) => x.role === role);
      if (!u) continue;
      lista.push({
        role,
        nome: u.nome,
        cpf: u.cpf,
        senha: SENHA_DEMO,
        empresaNome: db.empresas.find((e) => e.id === u.empresaId)?.nome ?? null,
      });
    }
    return espera(lista);
  },

  async usuarioPorId(id) {
    return espera(db.usuarios.find((u) => u.id === id) ?? null);
  },

  async snapshot(empresaId) {
    return espera(snapshotDe(empresaId));
  },

  async listarEmpresas() {
    return espera(
      db.empresas.map((e) => {
        const colabs = db.usuarios.filter((u) => u.empresaId === e.id && u.role === "colaborador");
        const qs = db.queixas.filter((q) => q.empresaId === e.id);
        return {
          empresa: e,
          colaboradores: colabs.length,
          queixas30d: qs.filter((q) => q.data >= diaISO(-30)).length,
          casosAbertos: casos.filter((c) => c.empresaId === e.id && c.status !== "resolvido").length,
        };
      }),
    );
  },

  /* ------------------------- colaborador ------------------------------ */

  async registrarCheckIn(colaboradorId, estado) {
    const u = db.usuarios.find((x) => x.id === colaboradorId);
    if (!u?.empresaId) throw new Error("Colaborador sem empresa");
    const hoje = hojeISO();
    const existente = db.checkins.find(
      (c) => c.colaboradorId === colaboradorId && mesmoDia(c.data, hoje),
    );
    if (existente) {
      existente.estado = estado;
      return espera(existente);
    }
    const novo: CheckIn = {
      id: novoId("chk"),
      empresaId: u.empresaId,
      colaboradorId,
      data: hoje,
      estado,
    };
    db.checkins.push(novo);
    return espera(novo);
  },

  async registrarQueixa(entrada) {
    const u = db.usuarios.find((x) => x.id === entrada.colaboradorId);
    if (!u?.empresaId) throw new Error("Colaborador sem empresa");
    const nova: Queixa = {
      ...entrada,
      id: novoId("qx"),
      empresaId: u.empresaId,
      data: hojeISO(),
    };
    db.queixas.push(nova);
    // um dia com queixa é sempre um dia de desconforto
    await this.registrarCheckIn(entrada.colaboradorId, "desconforto");
    return espera(nova);
  },

  /* ---------------------------- casos --------------------------------- */

  async abrirCaso(alerta, responsavelId) {
    const existente = casos.find((c) => c.alertaId === alerta.id);
    if (existente) return espera(existente);
    const caso = montarCaso(alerta, responsavelId, "aberto", 0, []);
    casos.push(caso);
    return espera(caso);
  },

  async mudarStatusCaso(casoId, status) {
    const c = casos.find((x) => x.id === casoId);
    if (!c) throw new Error("Caso não encontrado");
    c.status = status;
    c.atualizadoEm = hojeISO();
    return espera(c);
  },

  async adicionarAcao(casoId, acao) {
    const c = casos.find((x) => x.id === casoId);
    if (!c) throw new Error("Caso não encontrado");
    const nova: AcaoCaso = { ...acao, id: novoId("acao"), data: hojeISO() };
    c.acoes.push(nova);
    c.atualizadoEm = nova.data;
    if (c.status === "aberto") c.status = "em_andamento";
    return espera(c);
  },

  async concluirAcao(casoId, acaoId, concluida) {
    const c = casos.find((x) => x.id === casoId);
    const a = c?.acoes.find((x) => x.id === acaoId);
    if (!c || !a) throw new Error("Ação não encontrada");
    a.concluida = concluida;
    c.atualizadoEm = hojeISO();
    return espera(c);
  },

  /* -------------------------- administração --------------------------- */

  async criarUsuario(entrada) {
    const novo: Usuario = {
      ...entrada,
      id: novoId("usr"),
      cpf: somenteDigitos(entrada.cpf),
      ativo: true,
    };
    if (db.usuarios.some((u) => u.cpf === novo.cpf)) {
      throw new Error("Já existe um usuário com este CPF.");
    }
    db.usuarios.push(novo);
    return espera(novo);
  },

  async atualizarUsuario(id, patch) {
    const u = db.usuarios.find((x) => x.id === id);
    if (!u) throw new Error("Usuário não encontrado");
    Object.assign(u, patch);
    return espera(u);
  },

  async criarUnidade(entrada) {
    const nova: Unidade = { ...entrada, id: novoId("uni") };
    db.unidades.push(nova);
    return espera(nova);
  },

  async criarSetor(entrada) {
    const novo: Setor = { ...entrada, id: novoId("set") };
    db.setores.push(novo);
    return espera(novo);
  },

  async criarCargo(entrada) {
    const novo = { ...entrada, id: novoId("car") };
    db.cargos.push(novo);
    return espera(novo);
  },

  async removerCargo(id) {
    const emUso = db.usuarios.some((u) => u.cargoId === id);
    if (emUso) throw new Error("Cargo em uso por colaboradores.");
    db.cargos = db.cargos.filter((c) => c.id !== id);
    return espera(undefined);
  },

  async removerSetor(id) {
    const emUso = db.usuarios.some((u) => u.setorId === id);
    if (emUso) throw new Error("Setor em uso por colaboradores.");
    db.setores = db.setores.filter((s) => s.id !== id);
    db.cargos = db.cargos.filter((c) => c.setorId !== id);
    return espera(undefined);
  },

  /* --------------------------- plataforma ----------------------------- */

  async criarEmpresa(nome, cnpj, plano, contratados) {
    const nova: Empresa = {
      id: novoId("emp"),
      nome,
      cnpj: somenteDigitos(cnpj),
      plano,
      ativa: false,
      criadaEm: hojeISO(),
      colaboradoresContratados: contratados,
    };
    db.empresas.push(nova);
    return espera(nova);
  },

  async atualizarEmpresa(id, patch) {
    const e = db.empresas.find((x) => x.id === id);
    if (!e) throw new Error("Empresa não encontrada");
    Object.assign(e, patch);
    return espera(e);
  },

  async reiniciarDemo() {
    db = construirSeed();
    seqId = 0;
    semearCasos();
    return espera(undefined);
  },
};

