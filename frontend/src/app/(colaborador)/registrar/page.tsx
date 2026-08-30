"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2Icon, LoaderCircleIcon, PencilIcon } from "lucide-react";
import { MapaCorporal, OrientacaoLados, SeletorVista } from "@/components/mapa-corporal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import {
  AGRAVANTE_LABEL,
  INICIO_LABEL,
  INTENSIDADE_LABEL,
  RELACAO_LABEL,
  TIPO_DOR_LABEL,
  fundoIntensidade,
} from "@/lib/format";
import { rotuloRegiao } from "@/lib/regioes";
import { useDados, useSessao } from "@/lib/sessao";
import type {
  Agravante,
  InicioDor,
  Intensidade,
  Lado,
  RegiaoId,
  RelacaoTrabalho,
  TipoDor,
  Vista,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface Selecao {
  regiao: RegiaoId;
  lado: Lado;
}

export default function PaginaRegistrar() {
  const { usuario } = useSessao();
  const { recarregar } = useDados();

  const [vista, setVista] = React.useState<Vista>("frente");
  const [selecao, setSelecao] = React.useState<Selecao | null>(null);
  const [intensidade, setIntensidade] = React.useState<Intensidade | null>(null);
  const [tipo, setTipo] = React.useState<TipoDor | null>(null);
  const [inicio, setInicio] = React.useState<InicioDor | null>(null);
  const [agrava, setAgrava] = React.useState<Agravante | null>(null);
  const [relacao, setRelacao] = React.useState<RelacaoTrabalho | null>(null);
  const [observacao, setObservacao] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [pronto, setPronto] = React.useState(false);

  const detalhesRef = React.useRef<HTMLDivElement>(null);

  function selecionar(regiao: RegiaoId, lado: Lado) {
    const mesma = selecao?.regiao === regiao && selecao?.lado === lado;
    setSelecao(mesma ? null : { regiao, lado });
    if (!mesma) {
      window.setTimeout(
        () => detalhesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        80,
      );
    }
  }

  function limpar() {
    setSelecao(null);
    setIntensidade(null);
    setTipo(null);
    setInicio(null);
    setAgrava(null);
    setRelacao(null);
    setObservacao("");
    setPronto(false);
  }

  const completo = selecao && intensidade && tipo && inicio && agrava && relacao;

  async function enviar() {
    if (!usuario || !selecao || !intensidade || !tipo || !inicio || !agrava || !relacao) return;
    setEnviando(true);
    await api.registrarQueixa({
      colaboradorId: usuario.id,
      regiao: selecao.regiao,
      lado: selecao.lado,
      intensidade,
      tipo,
      inicio,
      agrava,
      relacaoTrabalho: relacao,
      observacao: observacao.trim(),
    });
    await recarregar();
    setEnviando(false);
    setPronto(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (pronto && selecao) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <span className="bg-sev-ok-soft text-sev-ok grid size-16 place-items-center rounded-full">
          <CheckCircle2Icon className="size-8" />
        </span>
        <h1 className="mt-5 text-xl font-semibold">Registro enviado</h1>
        <p className="text-muted-foreground mt-2 max-w-xs text-sm">
          {rotuloRegiao(selecao.regiao, selecao.lado)}, intensidade {intensidade}. Se o desconforto
          persistir ou piorar, registre de novo — é a repetição que aciona o SESMT.
        </p>
        <div className="mt-7 grid w-full max-w-xs gap-2">
          <Button variant="outline" onClick={limpar}>
            Registrar outro desconforto
          </Button>
          <Button asChild>
            <Link href="/inicio">Voltar ao início</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Onde está doendo?</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Toque na parte do corpo onde você sente o desconforto.
        </p>
      </header>

      <Card>
        <CardContent className="space-y-3">
          <div className="flex justify-center">
            <SeletorVista vista={vista} onChange={setVista} />
          </div>
          <div className="mx-auto max-w-[260px]">
            <OrientacaoLados vista={vista} />
            <MapaCorporal vista={vista} selecionada={selecao} onSelecionar={selecionar} />
          </div>
          {!selecao && (
            <p className="text-muted-foreground text-center text-xs">
              Não achou a região? Vire para {vista === "frente" ? "as costas" : "a frente"}.
            </p>
          )}
        </CardContent>
      </Card>

      {selecao && (
        <div ref={detalhesRef} className="scroll-mt-20 space-y-5">
          <div className="bg-primary text-primary-foreground flex items-center justify-between rounded-xl px-4 py-3">
            <div>
              <p className="text-xs opacity-75">Região selecionada</p>
              <p className="text-lg font-semibold">
                {rotuloRegiao(selecao.regiao, selecao.lado)}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSelecao(null)}
              className="gap-1.5"
            >
              <PencilIcon className="size-3.5" />
              Trocar
            </Button>
          </div>

          <Campo titulo="Qual a intensidade?" obrigatorio>
            <div className="grid grid-cols-5 gap-2">
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setIntensidade(n)}
                  aria-pressed={intensidade === n}
                  className={cn(
                    "flex h-16 flex-col items-center justify-center gap-1 rounded-lg border-2 text-lg font-bold transition-all",
                    intensidade === n
                      ? "border-transparent text-white shadow-sm"
                      : "bg-card hover:bg-accent",
                    intensidade === n && fundoIntensidade(n),
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-muted-foreground mt-2 min-h-5 text-center text-sm">
              {intensidade ? INTENSIDADE_LABEL[intensidade] : "1 é quase nada, 5 é muito forte"}
            </p>
          </Campo>

          <Campo titulo="Como é a dor?" obrigatorio>
            <Chips
              opcoes={TIPO_DOR_LABEL}
              valor={tipo}
              onChange={setTipo}
            />
          </Campo>

          <Campo titulo="Quando começou?" obrigatorio>
            <Chips opcoes={INICIO_LABEL} valor={inicio} onChange={setInicio} />
          </Campo>

          <Campo titulo="O que faz piorar?" obrigatorio>
            <Chips opcoes={AGRAVANTE_LABEL} valor={agrava} onChange={setAgrava} />
          </Campo>

          <Campo titulo="Você acha que tem relação com o trabalho?" obrigatorio>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(RELACAO_LABEL) as RelacaoTrabalho[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setRelacao(k)}
                  aria-pressed={relacao === k}
                  className={cn(
                    "touch-target rounded-lg border-2 px-3 text-sm font-medium transition-colors",
                    relacao === k
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-card hover:bg-accent",
                  )}
                >
                  {RELACAO_LABEL[k]}
                </button>
              ))}
            </div>
          </Campo>

          <Campo titulo="Quer contar mais alguma coisa?">
            <Label htmlFor="obs" className="sr-only">
              Observação
            </Label>
            <Textarea
              id="obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value.slice(0, 400))}
              placeholder="Opcional. Ex.: a cadeira não regula, o carrinho está pesado…"
              className="text-base"
            />
            <p className="text-muted-foreground mt-1 text-right text-xs tnum">
              {observacao.length}/400
            </p>
          </Campo>

          <div className="bg-card/95 sticky bottom-20 -mx-4 border-t px-4 py-3 backdrop-blur">
            <Button
              size="xl"
              className="w-full"
              disabled={!completo || enviando}
              onClick={() => void enviar()}
            >
              {enviando && <LoaderCircleIcon className="animate-spin" />}
              {completo ? "Registrar queixa" : "Responda os itens obrigatórios"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({
  titulo,
  obrigatorio,
  children,
}: {
  titulo: string;
  obrigatorio?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2.5 font-semibold">
        {titulo}
        {obrigatorio && <span className="text-destructive ml-1">*</span>}
      </h2>
      {children}
    </section>
  );
}

function Chips<T extends string>({
  opcoes,
  valor,
  onChange,
}: {
  opcoes: Record<T, string>;
  valor: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(opcoes) as T[]).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          aria-pressed={valor === k}
          className={cn(
            "rounded-full border-2 px-3.5 py-2 text-sm font-medium transition-colors",
            valor === k
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-card hover:bg-accent",
          )}
        >
          {opcoes[k]}
        </button>
      ))}
    </div>
  );
}
