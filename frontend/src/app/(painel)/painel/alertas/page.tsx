"use client";

import * as React from "react";
import { ShieldCheckIcon } from "lucide-react";
import { CartaoAlerta } from "@/components/painel/cartao-alerta";
import {
  AvisoAnonimo,
  BarraFiltros,
  CabecalhoPagina,
  EstadoVazio,
  Paginador,
} from "@/components/painel/comuns";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { useFiltros } from "@/lib/filtros";
import { pct } from "@/lib/format";
import { pode } from "@/lib/rbac";
import { useNavegar } from "@/lib/carregando";
import { invalidar, useRecurso } from "@/lib/recurso";
import { useSessao } from "@/lib/sessao";
import type { Alerta } from "@/lib/types";

const POR_PAGINA = 24;

type Aba = "todos" | "individuais" | "coletivos";

export default function PaginaAlertas() {
  const { ir } = useNavegar();
  const { usuario } = useSessao();
  const filtros = useFiltros();
  const [aba, setAba] = React.useState<Aba>("todos");
  const [pagina, setPagina] = React.useState(0);

  const identificar = pode(usuario?.role, "dados:identificados");
  const podeGerenciar = pode(usuario?.role, "casos:gerenciar");
  const { recorte } = filtros;

  // a regra vem do servidor que a aplica, em vez de ser recopiada aqui
  const regras = useRecurso(() => api.regrasAlerta(), [], { chave: "alertas/regras" });
  const lista = useRecurso(
    () => api.alertas(recorte, aba, { limit: POR_PAGINA, offset: pagina * POR_PAGINA }),
    [recorte, aba, pagina],
    { chave: "alertas" },
  );

  React.useEffect(() => setPagina(0), [recorte, aba]);

  async function abrirCaso(alerta: Alerta) {
    const caso = await api.abrirCaso(alerta.id);
    // o alerta vira caso: mudam os contadores da barra e as duas listas
    invalidar("menu/casos", "menu/alertas", "casos", "casos/contagem", "alertas", "painel/alertas");
    ir(`/painel/casos/${caso.id}`);
  }

  const r = regras.dados;
  const total = lista.dados?.total ?? 0;

  return (
    <>
      <CabecalhoPagina
        titulo="Alertas"
        descricao={
          r
            ? `Regra atual: ${r.individualMinOcorrencias}+ registros da mesma região pela mesma pessoa, ou ${pct(r.coletivoMinPercentual)} de um setor na mesma região (mínimo ${r.coletivoMinPessoas} pessoas), em ${r.janelaDias} dias.`
            : undefined
        }
      />

      <div className="mb-6">
        <BarraFiltros filtros={filtros} />
      </div>

      {!identificar && (
        <AvisoAnonimo>
          Alertas individuais chegam sem nome no seu perfil — o servidor não envia a identificação.
          O SESMT vê a pessoa e conduz o caso; use os alertas coletivos para decidir ações de setor.
        </AvisoAnonimo>
      )}

      <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)} className="mb-5">
        <TabsList>
          <TabsTrigger value="todos">Todos</TabsTrigger>
          <TabsTrigger value="coletivos">Coletivos</TabsTrigger>
          <TabsTrigger value="individuais">Individuais</TabsTrigger>
        </TabsList>
      </Tabs>

      {lista.carregando ? (
        <div className="bg-muted h-64 animate-pulse rounded-xl" />
      ) : total === 0 ? (
        <EstadoVazio
          Icone={ShieldCheckIcon}
          titulo="Nenhum alerta neste recorte"
          descricao="Ninguém cruzou os limites de recorrência no período e no recorte selecionados. Confira a adesão ao check-in antes de concluir que está tudo bem."
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {lista.dados?.itens.map((a) => (
              <CartaoAlerta
                key={a.id}
                alerta={a}
                onAbrirCaso={podeGerenciar && !a.casoId ? abrirCaso : undefined}
              />
            ))}
          </div>
          <Paginador
            total={total}
            pagina={pagina}
            porPagina={POR_PAGINA}
            onPagina={setPagina}
          />
        </>
      )}
    </>
  );
}
