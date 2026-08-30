"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheckIcon } from "lucide-react";
import { CartaoAlerta } from "@/components/painel/cartao-alerta";
import {
  AvisoAnonimo,
  BarraFiltros,
  CabecalhoPagina,
  EstadoVazio,
} from "@/components/painel/comuns";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { REGRAS } from "@/lib/analytics";
import { useFiltros } from "@/lib/filtros";
import { pode } from "@/lib/rbac";
import { useDados, useSessao } from "@/lib/sessao";
import type { Alerta } from "@/lib/types";

export default function PaginaAlertas() {
  const router = useRouter();
  const { usuario } = useSessao();
  const { snapshot, alertas, recarregar } = useDados();
  const recorte = useFiltros();
  const [aba, setAba] = React.useState("todos");

  const identificar = pode(usuario?.role, "dados:identificados");
  const podeGerenciar = pode(usuario?.role, "casos:gerenciar");

  const casoPorAlerta = React.useMemo(
    () => new Map((snapshot?.casos ?? []).map((c) => [c.alertaId, c.id])),
    [snapshot],
  );

  const doRecorte = React.useMemo(() => {
    const ids = new Set(recorte.colaboradores.map((c) => c.id));
    const setores = new Set(recorte.colaboradores.map((c) => c.setorId));
    return alertas.filter((a) =>
      a.kind === "individual" ? ids.has(a.colaboradorId) : setores.has(a.setorId),
    );
  }, [alertas, recorte.colaboradores]);

  const lista = doRecorte.filter((a) =>
    aba === "todos" ? true : aba === "individuais" ? a.kind === "individual" : a.kind === "coletivo",
  );

  async function abrirCaso(alerta: Alerta) {
    if (!usuario) return;
    const caso = await api.abrirCaso(alerta, usuario.id);
    await recarregar();
    router.push(`/painel/casos/${caso.id}`);
  }

  const contagem = {
    todos: doRecorte.length,
    individuais: doRecorte.filter((a) => a.kind === "individual").length,
    coletivos: doRecorte.filter((a) => a.kind === "coletivo").length,
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Alertas"
        descricao={`Regra atual: ${REGRAS.individualMinOcorrencias}+ registros da mesma região pela mesma pessoa, ou ${REGRAS.coletivoMinPercentual}% de um setor na mesma região (mínimo ${REGRAS.coletivoMinPessoas} pessoas), em ${REGRAS.janelaDias} dias.`}
      />

      <div className="mb-6">
        <BarraFiltros recorte={recorte} />
      </div>

      {!identificar && (
        <AvisoAnonimo>
          Alertas individuais aparecem sem nome no seu perfil. O SESMT vê a pessoa e conduz o caso —
          use os alertas coletivos para decidir ações de setor.
        </AvisoAnonimo>
      )}

      <Tabs value={aba} onValueChange={setAba} className="mb-5">
        <TabsList>
          <TabsTrigger value="todos">Todos ({contagem.todos})</TabsTrigger>
          <TabsTrigger value="coletivos">Coletivos ({contagem.coletivos})</TabsTrigger>
          <TabsTrigger value="individuais">Individuais ({contagem.individuais})</TabsTrigger>
        </TabsList>
      </Tabs>

      {lista.length === 0 ? (
        <EstadoVazio
          Icone={ShieldCheckIcon}
          titulo="Nenhum alerta neste recorte"
          descricao="Ninguém cruzou os limites de recorrência no período e no recorte selecionados. Confira a adesão ao check-in antes de concluir que está tudo bem."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {lista.map((a) => (
            <CartaoAlerta
              key={a.id}
              alerta={a}
              identificar={identificar}
              casoId={casoPorAlerta.get(a.id)}
              onAbrirCaso={podeGerenciar && !casoPorAlerta.get(a.id) ? abrirCaso : undefined}
            />
          ))}
        </div>
      )}
    </>
  );
}
