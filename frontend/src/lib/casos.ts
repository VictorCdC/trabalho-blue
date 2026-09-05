import { rotuloRegiao } from "./regioes";
import type { Caso } from "./types";

/* O título do caso é derivado, não guardado.

   O servidor tem região, lado, origem e setor; o rótulo legível ("Lombar no
   setor Estoque") é texto de interface e vive junto com os nomes das regiões,
   em `regioes.ts`. Persistir o título obrigaria a duplicar essa tabela de
   rótulos no backend só para montar uma frase. */
export function tituloCaso(caso: Caso, nomeSetor: (id: string | null) => string): string {
  if (caso.origem === "coletivo") {
    return `${rotuloRegiao(caso.regiao, "na")} no setor ${nomeSetor(caso.setorId)}`;
  }
  return `${rotuloRegiao(caso.regiao, caso.lado)} recorrente`;
}
