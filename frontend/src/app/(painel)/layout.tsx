"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as Icones from "lucide-react";
import { BriefcaseIcon, LogOutIcon, MenuIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { Logo } from "@/components/logo";
import { Protegido } from "@/components/protegido";
import { BotaoTema } from "@/components/tema";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { iniciais, ROLE_LABEL } from "@/lib/format";
import { navPara } from "@/lib/rbac";
import { useDados, useSessao } from "@/lib/sessao";
import { cn } from "@/lib/utils";
import type { Empresa } from "@/lib/types";

export default function LayoutPainel({ children }: { children: React.ReactNode }) {
  const caminho = usePathname();
  const router = useRouter();
  const { usuario, sair, empresaAtivaId, trocarEmpresa } = useSessao();
  const { snapshot, alertas, recarregar } = useDados();
  const [menuAberto, setMenuAberto] = React.useState(false);
  const [empresas, setEmpresas] = React.useState<Empresa[]>([]);

  const itens = navPara(usuario?.role);
  const superuser = usuario?.role === "superuser";

  React.useEffect(() => {
    if (!superuser) return;
    void api.listarEmpresas().then((r) => setEmpresas(r.map((x) => x.empresa)));
  }, [superuser]);

  React.useEffect(() => {
    setMenuAberto(false);
  }, [caminho]);

  const naoResolvidos = (snapshot?.casos ?? []).filter((c) => c.status !== "resolvido").length;

  return (
    <Protegido papeis={["rh", "sesmt", "admin", "superuser"]}>
      <div className="flex min-h-dvh">
        {/* Sidebar */}
        <aside
          className={cn(
            "bg-sidebar fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
            menuAberto ? "translate-x-0 shadow-2xl" : "-translate-x-full",
          )}
        >
          <div className="flex h-16 items-center justify-between border-b px-5">
            <Logo />
            <Button
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              onClick={() => setMenuAberto(false)}
              aria-label="Fechar menu"
            >
              <XIcon />
            </Button>
          </div>

          {superuser && empresas.length > 0 && (
            <div className="border-b px-4 py-3">
              <label className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
                Empresa
              </label>
              <Select value={empresaAtivaId ?? ""} onValueChange={trocarEmpresa}>
                <SelectTrigger size="sm" className="mt-1.5 w-full">
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <nav className="flex-1 overflow-y-auto p-3">
            <ul className="space-y-0.5">
              {itens.map((item) => {
                const Icone = (Icones as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
                  item.icone
                ];
                const ativo =
                  item.href === "/painel"
                    ? caminho === "/painel"
                    : caminho.startsWith(item.href);
                const contador =
                  item.href === "/painel/alertas"
                    ? alertas.length
                    : item.href === "/painel/casos"
                      ? naoResolvidos
                      : 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        ativo
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      {Icone && <Icone className="size-4 shrink-0" />}
                      <span className="flex-1 truncate">{item.label}</span>
                      {contador > 0 && (
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[11px] font-semibold tnum",
                            ativo ? "bg-primary-foreground/20" : "bg-muted",
                          )}
                        >
                          {contador}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="border-t p-3">
            <p className="text-muted-foreground px-3 pb-2 text-[11px]">
              Ambiente de demonstração — os dados são fictícios.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground w-full justify-start"
              onClick={async () => {
                await api.reiniciarDemo();
                await recarregar();
                router.refresh();
              }}
            >
              <RotateCcwIcon /> Restaurar dados
            </Button>
          </div>
        </aside>

        {menuAberto && (
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setMenuAberto(false)}
            aria-hidden
          />
        )}

        {/* Conteúdo */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="bg-card/85 sticky top-0 z-20 flex h-16 items-center gap-3 border-b px-4 backdrop-blur lg:px-8">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMenuAberto(true)}
              aria-label="Abrir menu"
            >
              <MenuIcon />
            </Button>

            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{snapshot?.empresa.nome ?? "—"}</p>
              <p className="text-muted-foreground truncate text-xs">
                {snapshot?.unidades.length ?? 0} unidades ·{" "}
                {(snapshot?.usuarios ?? []).filter((u) => u.role === "colaborador").length}{" "}
                colaboradores
              </p>
            </div>

            <BotaoTema />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="hover:bg-accent flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors">
                  <Avatar>
                    <AvatarFallback>{iniciais(usuario?.nome ?? "")}</AvatarFallback>
                  </Avatar>
                  <span className="hidden text-left sm:block">
                    <span className="block max-w-40 truncate text-sm font-medium">
                      {usuario?.nome}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {usuario ? ROLE_LABEL[usuario.role] : ""}
                    </span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{usuario?.nome}</DropdownMenuLabel>
                <div className="px-2 pb-1.5">
                  <Badge variant="secondary">{usuario ? ROLE_LABEL[usuario.role] : ""}</Badge>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    sair();
                    router.replace("/login");
                  }}
                >
                  <LogOutIcon /> Sair da conta
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">
            {empresaAtivaId ? (
              children
            ) : (
              <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-20 text-center">
                <BriefcaseIcon className="text-muted-foreground size-8" />
                <p className="mt-3 font-medium">Nenhuma empresa selecionada</p>
                <p className="text-muted-foreground mt-1 max-w-sm text-sm">
                  Escolha uma empresa cliente no seletor da barra lateral para abrir o painel dela.
                </p>
                {superuser && (
                  <Button asChild className="mt-5" variant="outline">
                    <Link href="/plataforma">Ver empresas clientes</Link>
                  </Button>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </Protegido>
  );
}
