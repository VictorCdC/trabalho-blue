"use client";

import * as React from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Tema = "light" | "dark" | "sistema";

const CHAVE = "blue.tema";

function aplicar(t: Tema) {
  const escuro =
    t === "dark" || (t === "sistema" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", escuro);
}

export function BotaoTema() {
  const [tema, setTema] = React.useState<Tema>("sistema");

  React.useEffect(() => {
    const salvo = localStorage.getItem(CHAVE) as Tema | null;
    setTema(salvo ?? "sistema");
  }, []);

  const escolher = (t: Tema) => {
    setTema(t);
    if (t === "sistema") localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, t);
    aplicar(t);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Alterar tema">
          <SunIcon className="dark:hidden" />
          <MoonIcon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => escolher("light")}>
          <SunIcon /> Claro {tema === "light" && "✓"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => escolher("dark")}>
          <MoonIcon /> Escuro {tema === "dark" && "✓"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => escolher("sistema")}>
          <MonitorIcon /> Sistema {tema === "sistema" && "✓"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
