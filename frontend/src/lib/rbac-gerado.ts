/* Gerado por `python rbac/gerar.py` a partir de rbac/permissoes.json. Não edite. */

import type { Role } from "./types";

/*
   Decisão de privacidade (LGPD): dado clínico identificado é exclusivo do SESMT. RH e
   admin veem apenas agregados; a equipe da plataforma (superuser) administra tenants mas
   NÃO lê queixa identificada. Para permitir, acrescente 'dados:identificados' em superuser
   — e assuma a consequência.
*/

export type Permissao =
  | "checkin:registrar"
  | "queixa:registrar"
  | "queixa:ver_proprias"
  | "painel:ver"
  | "dados:agregados"
  | "dados:identificados"
  | "alertas:ver"
  | "casos:ver"
  | "casos:gerenciar"
  | "colaboradores:ver_lista"
  | "relatorios:ver"
  | "estrutura:gerenciar"
  | "usuarios:gerenciar"
  | "empresas:gerenciar";

export const PERMISSOES: Record<Role, readonly Permissao[]> = {
  colaborador: [
    "checkin:registrar",
    "queixa:registrar",
    "queixa:ver_proprias",
  ],
  rh: [
    "painel:ver",
    "dados:agregados",
    "alertas:ver",
    "relatorios:ver",
  ],
  sesmt: [
    "painel:ver",
    "dados:agregados",
    "dados:identificados",
    "alertas:ver",
    "casos:ver",
    "casos:gerenciar",
    "colaboradores:ver_lista",
    "relatorios:ver",
  ],
  admin: [
    "painel:ver",
    "dados:agregados",
    "alertas:ver",
    "casos:ver",
    "colaboradores:ver_lista",
    "relatorios:ver",
    "estrutura:gerenciar",
    "usuarios:gerenciar",
  ],
  superuser: [
    "painel:ver",
    "dados:agregados",
    "alertas:ver",
    "casos:ver",
    "colaboradores:ver_lista",
    "relatorios:ver",
    "estrutura:gerenciar",
    "usuarios:gerenciar",
    "empresas:gerenciar",
  ],
};
