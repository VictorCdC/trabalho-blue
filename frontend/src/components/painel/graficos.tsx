"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { dataCurta, num, varIntensidade } from "@/lib/format";
import { rotuloCurto } from "@/lib/regioes";
import type { ContagemRegiao, PontoSerie } from "@/lib/types";

const EIXO = {
  stroke: "var(--muted-foreground)",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

function Caixa({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-popover rounded-md border px-3 py-2 text-xs shadow-md">{children}</div>
  );
}

/* --------------------------- tendência -------------------------------- */

export function GraficoTendencia({
  serie,
  porSemana,
  altura = 240,
}: {
  serie: PontoSerie[];
  porSemana?: boolean;
  altura?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <AreaChart data={serie} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="grad-queixas" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="data" tickFormatter={dataCurta} {...EIXO} interval="preserveStartEnd" minTickGap={24} />
        <YAxis allowDecimals={false} {...EIXO} width={40} />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as PontoSerie;
            return (
              <Caixa>
                <p className="font-semibold">
                  {porSemana ? `Semana de ${dataCurta(String(label))}` : dataCurta(String(label))}
                </p>
                <p className="mt-1 tnum">{p.queixas} queixas</p>
                <p className="text-muted-foreground tnum">{p.checkins} check-ins</p>
                {p.queixas > 0 && (
                  <p className="text-muted-foreground tnum">
                    intensidade média {num(p.intensidadeMedia)}
                  </p>
                )}
              </Caixa>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="queixas"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#grad-queixas)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ---------------------------- regiões --------------------------------- */

export function GraficoRegioes({
  dados,
  limite = 8,
  altura,
}: {
  dados: ContagemRegiao[];
  limite?: number;
  altura?: number;
}) {
  const lista = dados.slice(0, limite).map((d) => ({
    ...d,
    nome: rotuloCurto(d.regiao),
  }));
  const h = altura ?? Math.max(140, lista.length * 34 + 20);

  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={lista} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} {...EIXO} />
        <YAxis type="category" dataKey="nome" width={104} {...EIXO} />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as ContagemRegiao & { nome: string };
            return (
              <Caixa>
                <p className="font-semibold">{p.nome}</p>
                <p className="mt-1 tnum">{p.total} registros</p>
                <p className="text-muted-foreground tnum">{p.pessoas} pessoas</p>
                <p className="text-muted-foreground tnum">
                  intensidade média {num(p.intensidadeMedia)}
                </p>
              </Caixa>
            );
          }}
        />
        <Bar dataKey="total" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
          {lista.map((d) => (
            <Cell key={d.regiao} fill={varIntensidade(d.intensidadeMedia)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
