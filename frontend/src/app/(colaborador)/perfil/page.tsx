"use client";

import { useRouter } from "next/navigation";
import { EyeOffIcon, LogOutIcon, ShieldCheckIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cpfOculto, dataBR, iniciais } from "@/lib/format";
import { useDados, useSessao } from "@/lib/sessao";

export default function PaginaPerfil() {
  const router = useRouter();
  const { usuario, sair } = useSessao();
  const { snapshot, nomeCargo, nomeSetor, nomeUnidade } = useDados();

  if (!usuario) return null;

  const linhas: Array<[string, string]> = [
    ["CPF", cpfOculto(usuario.cpf)],
    ["Empresa", snapshot?.empresa.nome ?? "—"],
    ["Unidade", nomeUnidade(usuario.unidadeId)],
    ["Setor", nomeSetor(usuario.setorId)],
    ["Cargo", nomeCargo(usuario.cargoId)],
    ["Admissão", usuario.admissaoEm ? dataBR(usuario.admissaoEm) : "—"],
  ];

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-4">
        <Avatar className="size-14">
          <AvatarFallback className="text-base">{iniciais(usuario.nome)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{usuario.nome}</h1>
          <p className="text-muted-foreground text-sm">{nomeCargo(usuario.cargoId)}</p>
        </div>
      </header>

      <Card>
        <CardContent className="p-0">
          <dl className="divide-y">
            {linhas.map(([rotulo, valor]) => (
              <div key={rotulo} className="flex items-center justify-between gap-4 px-5 py-3">
                <dt className="text-muted-foreground text-sm">{rotulo}</dt>
                <dd className="truncate text-sm font-medium">{valor}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 text-sm">
          <h2 className="flex items-center gap-2 font-semibold">
            <ShieldCheckIcon className="text-primary size-4" />
            Quem vê o que você registra
          </h2>
          <Separator />
          <div className="flex gap-3">
            <ShieldCheckIcon className="text-sev-ok mt-0.5 size-4 shrink-0" />
            <p>
              <strong>SESMT e médico do trabalho</strong> veem seu nome e seu histórico — é assim que
              conseguem te chamar para uma avaliação e ajustar seu posto.
            </p>
          </div>
          <div className="flex gap-3">
            <EyeOffIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <p>
              <strong>RH e gestores</strong> veem apenas números por setor e por cargo, sem nome
              nenhum. Seu registro não vai para avaliação de desempenho.
            </p>
          </div>
        </CardContent>
      </Card>

      <Button
        variant="outline"
        className="w-full"
        onClick={() => {
          sair();
          router.replace("/login");
        }}
      >
        <LogOutIcon /> Sair da conta
      </Button>
    </div>
  );
}
