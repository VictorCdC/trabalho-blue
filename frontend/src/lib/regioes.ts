import type { Lado, Regiao, RegiaoId, Vista } from "./types";

export const REGIOES: Regiao[] = [
  // cabeça e tronco — frente
  { id: "cabeca", nome: "Cabeça", bilateral: false, vistas: ["frente"], grupo: "cabeca_tronco" },
  { id: "pescoco", nome: "Pescoço", bilateral: false, vistas: ["frente"], grupo: "cabeca_tronco" },
  { id: "peito", nome: "Peito", bilateral: false, vistas: ["frente"], grupo: "cabeca_tronco" },
  { id: "abdomen", nome: "Abdômen", bilateral: false, vistas: ["frente"], grupo: "cabeca_tronco" },
  { id: "quadril", nome: "Quadril", bilateral: false, vistas: ["frente"], grupo: "cabeca_tronco" },
  // cabeça e tronco — costas
  { id: "nuca", nome: "Nuca", bilateral: false, vistas: ["costas"], grupo: "cabeca_tronco" },
  { id: "cervical", nome: "Cervical", bilateral: false, vistas: ["costas"], grupo: "cabeca_tronco" },
  { id: "dorsal", nome: "Dorsal (meio das costas)", curto: "Dorsal", bilateral: false, vistas: ["costas"], grupo: "cabeca_tronco" },
  { id: "lombar", nome: "Lombar", bilateral: false, vistas: ["costas"], grupo: "cabeca_tronco" },
  // membros superiores — nas duas vistas
  { id: "ombro", nome: "Ombro", bilateral: true, vistas: ["frente", "costas"], grupo: "membro_superior" },
  { id: "braco", nome: "Braço", bilateral: true, vistas: ["frente", "costas"], grupo: "membro_superior" },
  { id: "cotovelo", nome: "Cotovelo", bilateral: true, vistas: ["frente", "costas"], grupo: "membro_superior" },
  { id: "antebraco", nome: "Antebraço", bilateral: true, vistas: ["frente", "costas"], grupo: "membro_superior" },
  { id: "punho", nome: "Punho", bilateral: true, vistas: ["frente", "costas"], grupo: "membro_superior" },
  { id: "mao", nome: "Mão", bilateral: true, vistas: ["frente", "costas"], grupo: "membro_superior" },
  // membros inferiores — frente
  { id: "coxa", nome: "Coxa", bilateral: true, vistas: ["frente"], grupo: "membro_inferior" },
  { id: "joelho", nome: "Joelho", bilateral: true, vistas: ["frente"], grupo: "membro_inferior" },
  { id: "canela", nome: "Canela", bilateral: true, vistas: ["frente"], grupo: "membro_inferior" },
  { id: "pe", nome: "Pé", bilateral: true, vistas: ["frente"], grupo: "membro_inferior" },
  // membros inferiores — costas
  { id: "gluteo", nome: "Glúteo", bilateral: true, vistas: ["costas"], grupo: "membro_inferior" },
  { id: "posterior_coxa", nome: "Posterior da coxa", bilateral: true, vistas: ["costas"], grupo: "membro_inferior" },
  { id: "panturrilha", nome: "Panturrilha", bilateral: true, vistas: ["costas"], grupo: "membro_inferior" },
  { id: "calcanhar", nome: "Calcanhar", bilateral: true, vistas: ["costas"], grupo: "membro_inferior" },
];

const porId = new Map<RegiaoId, Regiao>(REGIOES.map((r) => [r.id, r]));

export function regiao(id: RegiaoId): Regiao {
  const r = porId.get(id);
  if (!r) throw new Error(`Região desconhecida: ${id}`);
  return r;
}

export function regioesDaVista(vista: Vista): Regiao[] {
  return REGIOES.filter((r) => r.vistas.includes(vista));
}

/** Nome enxuto para eixo de gráfico, célula de tabela e título de cartão. */
export function rotuloCurto(id: RegiaoId, lado: Lado = "na"): string {
  const r = regiao(id);
  const base = r.curto ?? r.nome;
  if (!r.bilateral || lado === "na") return base;
  return `${base} ${lado}`;
}

/** "Punho direito", "Lombar" — rótulo pronto para exibição. */
export function rotuloRegiao(id: RegiaoId, lado: "esquerdo" | "direito" | "na"): string {
  const r = regiao(id);
  if (!r.bilateral || lado === "na") return r.nome;
  return `${r.nome} ${lado}`;
}
