"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardPlusIcon, HistoryIcon, HouseIcon, UserRoundIcon } from "lucide-react";
import { Logo } from "@/components/logo";
import { Protegido } from "@/components/protegido";
import { BotaoTema } from "@/components/tema";
import { cn } from "@/lib/utils";

const ABAS = [
  { href: "/inicio", label: "Início", Icone: HouseIcon },
  { href: "/registrar", label: "Registrar", Icone: ClipboardPlusIcon },
  { href: "/historico", label: "Histórico", Icone: HistoryIcon },
  { href: "/perfil", label: "Perfil", Icone: UserRoundIcon },
];

export default function LayoutColaborador({ children }: { children: React.ReactNode }) {
  const caminho = usePathname();

  return (
    <Protegido papeis={["colaborador"]}>
      <div className="flex min-h-dvh flex-col">
        <header className="bg-card/85 sticky top-0 z-20 flex h-14 items-center justify-between border-b px-4 backdrop-blur">
          <Logo tamanho="sm" />
          <BotaoTema />
        </header>

        <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-5 pb-28">{children}</main>

        <nav
          aria-label="Navegação principal"
          className="bg-card/95 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <ul className="mx-auto grid max-w-2xl grid-cols-4">
            {ABAS.map(({ href, label, Icone }) => {
              const ativo = caminho === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={ativo ? "page" : undefined}
                    className={cn(
                      "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                      ativo ? "text-primary" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icone className={cn("size-5", ativo && "stroke-[2.5]")} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </Protegido>
  );
}
