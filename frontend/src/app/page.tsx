"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { TelaCarregando } from "@/components/tela-carregando";
import { ROTA_INICIAL } from "@/lib/rbac";
import { useSessao } from "@/lib/sessao";

export default function Raiz() {
  const router = useRouter();
  const { carregando, usuario } = useSessao();

  React.useEffect(() => {
    if (carregando) return;
    router.replace(usuario ? ROTA_INICIAL[usuario.role] : "/login");
  }, [carregando, usuario, router]);

  return <TelaCarregando />;
}
