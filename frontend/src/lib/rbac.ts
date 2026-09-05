import type { Role } from "./types";
import { PERMISSOES, type Permissao } from "./rbac-gerado";

/* A matriz de permissões é gerada de /rbac/permissoes.json — a mesma fonte que
   o backend consome. Reexportada aqui para os componentes não precisarem saber
   disso. O frontend usa a matriz apenas para esconder o que o usuário não pode
   fazer; a autorização real é do backend. */

export { PERMISSOES };
export type { Permissao };

export function pode(role: Role | undefined, p: Permissao): boolean {
  if (!role) return false;
  return PERMISSOES[role].includes(p);
}

/** Rota inicial de cada perfil após o login. */
export const ROTA_INICIAL: Record<Role, string> = {
  colaborador: "/inicio",
  rh: "/painel",
  sesmt: "/painel",
  admin: "/painel",
  superuser: "/plataforma",
};

export interface ItemNav {
  href: string;
  label: string;
  icone: string;
  permissao: Permissao;
}

export interface GrupoNav {
  titulo: string;
  itens: ItemNav[];
}

/* Nove itens em lista corrida não dizem que "Casos" é trabalho do dia e
   "Estrutura" é configuração. Os grupos são a ordem em que o trabalho
   acontece: o que pede ação hoje, o que explica o porquê, o que se ajusta de
   vez em quando. */
export const NAV_PAINEL: GrupoNav[] = [
  {
    titulo: "Acompanhamento",
    itens: [
      { href: "/painel", label: "Visão geral", icone: "LayoutDashboard", permissao: "painel:ver" },
      { href: "/painel/alertas", label: "Alertas", icone: "TriangleAlert", permissao: "alertas:ver" },
      { href: "/painel/casos", label: "Casos", icone: "ClipboardList", permissao: "casos:ver" },
    ],
  },
  {
    titulo: "Análise",
    itens: [
      { href: "/painel/setores", label: "Setores", icone: "Building2", permissao: "dados:agregados" },
      { href: "/painel/colaboradores", label: "Colaboradores", icone: "Users", permissao: "colaboradores:ver_lista" },
      { href: "/painel/relatorios", label: "Relatórios", icone: "ChartColumn", permissao: "relatorios:ver" },
    ],
  },
  {
    titulo: "Administração",
    itens: [
      { href: "/painel/estrutura", label: "Estrutura", icone: "Network", permissao: "estrutura:gerenciar" },
      { href: "/painel/usuarios", label: "Usuários e acessos", icone: "ShieldCheck", permissao: "usuarios:gerenciar" },
      { href: "/plataforma", label: "Empresas clientes", icone: "Briefcase", permissao: "empresas:gerenciar" },
    ],
  },
];

/** Grupo sem item visível não vira título vazio: o RH não vê "Administração". */
export function navPara(role: Role | undefined): GrupoNav[] {
  return NAV_PAINEL.map((grupo) => ({
    ...grupo,
    itens: grupo.itens.filter((i) => pode(role, i.permissao)),
  })).filter((grupo) => grupo.itens.length > 0);
}
