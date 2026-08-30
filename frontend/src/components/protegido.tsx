"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LockIcon } from "lucide-react";
import { TelaCarregando } from "@/components/tela-carregando";
import { Button } from "@/components/ui/button";
import { pode, ROTA_INICIAL, type Permissao } from "@/lib/rbac";
import { useSessao } from "@/lib/sessao";
import type { Role } from "@/lib/types";

/* Guarda de rota no cliente. É conveniência de navegação, não segurança:
   o backend precisa validar a permissão em toda requisição. */
export function Protegido({
  children,
  papeis,
  permissao,
}: {
  children: React.ReactNode;
  papeis?: Role[];
  permissao?: Permissao;
}) {
  const router = useRouter();
  const { carregando, usuario } = useSessao();

  React.useEffect(() => {
    if (!carregando && !usuario) router.replace("/login");
  }, [carregando, usuario, router]);

  if (carregando) return <TelaCarregando />;
  if (!usuario) return <TelaCarregando mensagem="Redirecionando para o login…" />;

  const papelOk = !papeis || papeis.includes(usuario.role);
  const permissaoOk = !permissao || pode(usuario.role, permissao);

  if (!papelOk || !permissaoOk) return <SemPermissao role={usuario.role} />;
  return <>{children}</>;
}

function SemPermissao({ role }: { role: Role }) {
  const router = useRouter();
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-sm text-center">
        <div className="bg-muted text-muted-foreground mx-auto grid size-12 place-items-center rounded-full">
          <LockIcon className="size-5" />
        </div>
        <h1 className="mt-4 text-lg font-semibold">Sem acesso a esta área</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Seu perfil não tem permissão para ver esta página. Se você precisa deste acesso, fale com o
          administrador da sua empresa.
        </p>
        <Button className="mt-6" onClick={() => router.replace(ROTA_INICIAL[role])}>
          Voltar para o início
        </Button>
      </div>
    </div>
  );
}
