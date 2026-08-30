"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckIcon,
  ChevronRightIcon,
  FlameIcon,
  FrownIcon,
  LoaderCircleIcon,
  SmileIcon,
  StethoscopeIcon,
} from "lucide-react";
import { MapaCorporal, montarCalor } from "@/components/mapa-corporal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { naJanela, porRegiao, porRegiaoLado, sequenciaCheckIn } from "@/lib/analytics";
import {
  dataRelativa,
  hojeISO,
  mesmoDia,
  primeiroNome,
  rotuloDoDia,
} from "@/lib/format";
import { rotuloRegiao } from "@/lib/regioes";
import { useDados, useSessao } from "@/lib/sessao";
import type { CheckIn, Vista } from "@/lib/types";

export default function PaginaInicio() {
  const router = useRouter();
  const { usuario } = useSessao();
  const { snapshot, recarregar } = useDados();
  const [enviando, setEnviando] = React.useState<"bem" | "desconforto" | null>(null);
  const [vista, setVista] = React.useState<Vista>("frente");

  const meu = React.useMemo(() => {
    if (!snapshot || !usuario) return null;
    const queixas = snapshot.queixas.filter((q) => q.colaboradorId === usuario.id);
    const checkins = snapshot.checkins.filter((c) => c.colaboradorId === usuario.id);
    const caso = snapshot.casos.find(
      (c) => c.colaboradorId === usuario.id && c.status !== "resolvido",
    );
    return { queixas, checkins, caso };
  }, [snapshot, usuario]);

  const hoje = meu?.checkins.find((c) => mesmoDia(c.data, hojeISO())) ?? null;

  async function registrar(estado: "bem" | "desconforto") {
    if (!usuario) return;
    setEnviando(estado);
    if (estado === "desconforto") {
      router.push("/registrar");
      return;
    }
    await api.registrarCheckIn(usuario.id, "bem");
    await recarregar();
    setEnviando(null);
  }

  if (!usuario || !meu) {
    return <div className="bg-muted h-64 animate-pulse rounded-xl" />;
  }

  const queixas30 = meu.queixas.filter((q) => naJanela(q.data, 30));
  const checkins30 = meu.checkins.filter((c) => naJanela(c.data, 30));
  const sequencia = sequenciaCheckIn(meu.checkins);
  const queixas60 = meu.queixas.filter((q) => naJanela(q.data, 60));
  const regioes = porRegiao(queixas60);
  const calor = montarCalor(porRegiaoLado(queixas60));

  return (
    <div className="space-y-5">
      <header>
        <p className="text-muted-foreground text-sm">{rotuloDoDia()}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Olá, {primeiroNome(usuario.nome)}
        </h1>
      </header>

      {hoje ? (
        <CheckInFeito checkin={hoje} onRefazer={() => registrar("desconforto")} />
      ) : (
        <Card>
          <CardContent className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Como você está hoje?</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Leva 5 segundos. Só você e o SESMT veem seus registros.
              </p>
            </div>
            <div className="grid gap-3">
              <Button
                size="xl"
                variant="outline"
                className="justify-start gap-3 border-2"
                disabled={enviando !== null}
                onClick={() => void registrar("bem")}
              >
                {enviando === "bem" ? (
                  <LoaderCircleIcon className="animate-spin" />
                ) : (
                  <SmileIcon className="text-sev-ok size-6" />
                )}
                <span className="font-semibold">Estou bem</span>
              </Button>
              <Button
                size="xl"
                variant="outline"
                className="justify-start gap-3 border-2"
                disabled={enviando !== null}
                onClick={() => void registrar("desconforto")}
              >
                {enviando === "desconforto" ? (
                  <LoaderCircleIcon className="animate-spin" />
                ) : (
                  <FrownIcon className="text-sev-4 size-6" />
                )}
                <span className="font-semibold">Sinto algum desconforto</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {sequencia > 1 && (
        <div className="bg-secondary text-secondary-foreground flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm">
          <FlameIcon className="size-4 shrink-0" />
          <span>
            <strong className="tnum">{sequencia} dias</strong> seguidos registrando. Continue assim —
            é o histórico que mostra o que está mudando.
          </span>
        </div>
      )}

      {meu.caso && (
        <Card className="border-primary/30">
          <CardContent className="flex gap-3">
            <StethoscopeIcon className="text-primary mt-0.5 size-5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold">O SESMT está acompanhando você</p>
              <p className="text-muted-foreground mt-1">
                Seus relatos de {rotuloRegiao(meu.caso.regiao, meu.caso.lado).toLowerCase()} abriram um
                acompanhamento {dataRelativa(meu.caso.abertoEm)}. Você pode ser chamado para uma
                avaliação — é prevenção, não avaliação de desempenho.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Metrica valor={checkins30.length} rotulo="dias registrados" sufixo="nos últimos 30" />
        <Metrica valor={queixas30.length} rotulo="com desconforto" sufixo="nos últimos 30" />
        <Metrica
          valor={regioes[0] ? rotuloRegiao(regioes[0].regiao, "na") : "—"}
          rotulo="região mais relatada"
          sufixo="em 60 dias"
          texto
        />
      </div>

      {regioes.length > 0 && (
        <Card>
          <CardContent>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold">Seu mapa dos últimos 60 dias</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Quanto mais forte a cor, mais vezes você relatou ali.
                </p>
              </div>
              <div className="bg-muted flex rounded-lg p-0.5 text-xs">
                {(["frente", "costas"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVista(v)}
                    className={
                      vista === v
                        ? "bg-card rounded-md px-2.5 py-1 font-medium shadow-xs"
                        : "text-muted-foreground rounded-md px-2.5 py-1"
                    }
                  >
                    {v === "frente" ? "Frente" : "Costas"}
                  </button>
                ))}
              </div>
            </div>
            <div className="mx-auto mt-4 max-w-[190px]">
              <MapaCorporal vista={vista} calor={calor} />
            </div>
            <ul className="mt-4 space-y-1.5">
              {regioes.slice(0, 4).map((r) => (
                <li key={r.regiao} className="flex items-center justify-between text-sm">
                  <span>{rotuloRegiao(r.regiao, "na")}</span>
                  <span className="text-muted-foreground tnum">
                    {r.total} {r.total === 1 ? "registro" : "registros"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Link
        href="/historico"
        className="hover:bg-accent flex items-center justify-between rounded-xl border px-4 py-3.5 text-sm font-medium transition-colors"
      >
        Ver histórico completo
        <ChevronRightIcon className="text-muted-foreground size-4" />
      </Link>
    </div>
  );
}

function CheckInFeito({ checkin, onRefazer }: { checkin: CheckIn; onRefazer: () => void }) {
  const bem = checkin.estado === "bem";
  return (
    <Card className={bem ? "border-sev-ok/40" : "border-sev-4/40"}>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <span
            className={
              bem
                ? "bg-sev-ok-soft text-sev-ok grid size-10 shrink-0 place-items-center rounded-full"
                : "bg-sev-4-soft text-sev-4 grid size-10 shrink-0 place-items-center rounded-full"
            }
          >
            {bem ? <CheckIcon className="size-5" /> : <FrownIcon className="size-5" />}
          </span>
          <div>
            <p className="font-semibold">Check-in de hoje registrado</p>
            <p className="text-muted-foreground text-sm">
              {bem ? "Você marcou que está bem. Bom trabalho." : "Você relatou desconforto hoje."}
            </p>
          </div>
        </div>
        <Button variant="outline" className="w-full" onClick={onRefazer}>
          {bem ? "Mudou algo? Registrar desconforto" : "Registrar outro desconforto"}
        </Button>
      </CardContent>
    </Card>
  );
}

function Metrica({
  valor,
  rotulo,
  sufixo,
  texto,
}: {
  valor: React.ReactNode;
  rotulo: string;
  sufixo: string;
  texto?: boolean;
}) {
  return (
    <div className="bg-card rounded-xl border px-3 py-3.5">
      <p className={texto ? "text-sm leading-tight font-semibold" : "text-2xl font-semibold tnum"}>
        {valor}
      </p>
      <p className="text-muted-foreground mt-1 text-[11px] leading-tight">{rotulo}</p>
      <p className="text-muted-foreground/70 text-[10px] leading-tight">{sufixo}</p>
    </div>
  );
}
