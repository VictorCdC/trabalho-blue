import type {
  Agravante,
  InicioDor,
  Intensidade,
  Plano,
  RelacaoTrabalho,
  Role,
  Severidade,
  StatusCaso,
  TipoAcao,
  TipoDor,
} from "./types";

/* ------------------------------- datas -------------------------------- */

const DIA = 86_400_000;

export function hojeISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function diaISO(offsetDias: number, base = hojeISO()): string {
  return new Date(new Date(base).getTime() + offsetDias * DIA).toISOString();
}

export function mesmoDia(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10);
}

export function diasAtras(iso: string, base = hojeISO()): number {
  return Math.round((new Date(base).getTime() - new Date(iso).getTime()) / DIA);
}

export function dataCurta(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function dataBR(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function dataRelativa(iso: string): string {
  const n = diasAtras(iso);
  if (n <= 0) return "hoje";
  if (n === 1) return "ontem";
  if (n < 7) return `há ${n} dias`;
  if (n < 14) return "há 1 semana";
  if (n < 30) return `há ${Math.floor(n / 7)} semanas`;
  if (n < 60) return "há 1 mês";
  return `há ${Math.floor(n / 30)} meses`;
}

/* --------------------------------- cpf -------------------------------- */

export function mascaraCPF(digitos: string): string {
  const d = digitos.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

export function cpfOculto(digitos: string): string {
  const d = digitos.replace(/\D/g, "");
  return `***.***.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function mascaraCNPJ(digitos: string): string {
  const d = digitos.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

/* ------------------------------- rótulos ------------------------------ */

export const ROLE_LABEL: Record<Role, string> = {
  colaborador: "Colaborador",
  rh: "RH",
  sesmt: "SESMT",
  admin: "Administrador",
  superuser: "Plataforma",
};

export const ROLE_DESCRICAO: Record<Role, string> = {
  colaborador: "Registra o próprio bem-estar",
  rh: "Vê indicadores agregados, sem identificação",
  sesmt: "Vê casos identificados e conduz intervenções",
  admin: "Gerencia estrutura e usuários da empresa",
  superuser: "Gerencia empresas clientes da plataforma",
};

export const TIPO_DOR_LABEL: Record<TipoDor, string> = {
  pontada: "Pontada / agulhada",
  queimacao: "Queimação",
  peso: "Peso / pressão",
  formigamento: "Formigamento",
  rigidez: "Rigidez / travando",
  latejante: "Latejante",
  cansaco: "Cansaço muscular",
};

export const INICIO_LABEL: Record<InicioDor, string> = {
  hoje: "Começou hoje",
  essa_semana: "Essa semana",
  esse_mes: "Esse mês",
  mais_de_mes: "Mais de um mês",
};

export const AGRAVANTE_LABEL: Record<Agravante, string> = {
  esforco_repetitivo: "Esforço repetitivo",
  levantar_peso: "Levantar ou carregar peso",
  ficar_sentado: "Ficar muito tempo sentado",
  ficar_em_pe: "Ficar muito tempo em pé",
  movimento_especifico: "Um movimento específico",
  fim_do_turno: "Piora no fim do turno",
  nao_sei: "Não sei dizer",
};

export const RELACAO_LABEL: Record<RelacaoTrabalho, string> = {
  sim: "Sim",
  nao: "Não",
  nao_sei: "Não sei",
};

export const STATUS_CASO_LABEL: Record<StatusCaso, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  resolvido: "Resolvido",
};

export const TIPO_ACAO_LABEL: Record<TipoAcao, string> = {
  encaminhado_medico: "Encaminhado ao médico do trabalho",
  avaliacao_ergonomica: "Avaliação ergonômica do posto",
  ginastica_laboral: "Ginástica laboral",
  ajuste_posto: "Ajuste do posto de trabalho",
  mudanca_funcao: "Mudança de função ou setor",
  treinamento: "Treinamento / orientação",
  reavaliacao: "Reavaliação agendada",
  observacao: "Observação",
};

export const SEVERIDADE_LABEL: Record<Severidade, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
};

export const PLANO_LABEL: Record<Plano, string> = {
  essencial: "Essencial",
  profissional: "Profissional",
  enterprise: "Enterprise",
};

export const INTENSIDADE_LABEL: Record<Intensidade, string> = {
  1: "Muito leve",
  2: "Leve",
  3: "Moderada",
  4: "Forte",
  5: "Muito forte",
};

/* --------------------------- cor por severidade ----------------------- */

/** Classe de cor de texto/ícone para a intensidade 1–5. */
export function corIntensidade(i: Intensidade): string {
  return (
    {
      1: "text-sev-1",
      2: "text-sev-2",
      3: "text-sev-3",
      4: "text-sev-4",
      5: "text-sev-5",
    } as const
  )[i];
}

/** Cor de fundo (chapa) para a intensidade 1–5. */
export function fundoIntensidade(i: Intensidade): string {
  return (
    {
      1: "bg-sev-1",
      2: "bg-sev-2",
      3: "bg-sev-3",
      4: "bg-sev-4",
      5: "bg-sev-5",
    } as const
  )[i];
}

/** Valor CSS bruto — para SVG e gráficos, onde classe não serve. */
export function varIntensidade(i: number): string {
  const n = Math.min(5, Math.max(1, Math.round(i)));
  return `var(--sev-${n})`;
}

export function classesSeveridade(s: Severidade): string {
  return {
    baixa: "bg-sev-3-soft text-sev-3 border-sev-3/30",
    media: "bg-sev-4-soft text-sev-4 border-sev-4/30",
    alta: "bg-sev-5-soft text-sev-5 border-sev-5/30",
  }[s];
}

export function primeiroNome(nome: string): string {
  return nome.split(" ")[0];
}

export function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

export function pct(n: number, casas = 0): string {
  return `${n.toFixed(casas).replace(".", ",")}%`;
}

export function num(n: number, casas = 1): string {
  return n.toFixed(casas).replace(".", ",");
}

const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "Bom dia · quinta, 28/08" — saudação usada no topo da tela do colaborador. */
export function rotuloDoDia(agora = new Date()): string {
  const h = agora.getHours();
  const saudacao = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  return `${saudacao} · ${DIAS_SEMANA[agora.getDay()]}, ${dataCurta(agora.toISOString())}`;
}
