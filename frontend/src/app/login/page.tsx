"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ActivityIcon, LoaderCircleIcon, ShieldCheckIcon } from "lucide-react";
import { Logo } from "@/components/logo";
import { BotaoTema } from "@/components/tema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mascaraCPF } from "@/lib/format";
import { ROTA_INICIAL } from "@/lib/rbac";
import { useSessao } from "@/lib/sessao";

export default function PaginaLogin() {
  const router = useRouter();
  const { entrar, usuario, carregando } = useSessao();
  const [cpf, setCpf] = React.useState("");
  const [senha, setSenha] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);

  React.useEffect(() => {
    if (!carregando && usuario) router.replace(ROTA_INICIAL[usuario.role]);
  }, [carregando, usuario, router]);

  /* Os atalhos de perfil saíram junto com o mock: eles vinham de uma chamada
     que listava CPFs válidos, e uma rota dessas não existe contra um backend
     de verdade. As credenciais da demonstração são impressas pelo seed. */
  async function submeter(cpfEntrada: string, senhaEntrada: string) {
    setErro(null);
    setEnviando(true);
    const falha = await entrar(cpfEntrada, senhaEntrada);
    setEnviando(false);
    if (falha) setErro(falha);
  }

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Painel de marca — só no desktop */}
      <aside className="bg-primary text-primary-foreground relative hidden flex-col justify-between p-12 lg:flex">
        <Logo tamanho="lg" invertido className="text-primary-foreground" />
        <div className="max-w-md">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight">
            O exame periódico que acontece todo dia.
          </h1>
          <p className="mt-5 text-lg opacity-85">
            Seus colaboradores registram desconfortos em segundos, pelo celular. Você vê o padrão
            surgir por setor e por função — e age antes de virar afastamento.
          </p>
          <ul className="mt-10 space-y-4 text-sm opacity-85">
            <li className="flex gap-3">
              <ActivityIcon className="mt-0.5 size-5 shrink-0" />
              <span>
                Alertas automáticos quando alguém repete a mesma queixa ou quando um setor inteiro
                começa a doer no mesmo lugar.
              </span>
            </li>
            <li className="flex gap-3">
              <ShieldCheckIcon className="mt-0.5 size-5 shrink-0" />
              <span>
                Dado de saúde identificado só chega ao SESMT. O RH acompanha números por setor, sem
                nome — como manda a LGPD.
              </span>
            </li>
          </ul>
        </div>
        <p className="text-xs opacity-60">
          Plataforma preventiva de saúde ocupacional. Não substitui atendimento médico.
        </p>
      </aside>

      {/* Formulário */}
      <main className="flex min-h-dvh flex-col px-5 py-8 sm:px-8 lg:min-h-dvh lg:justify-center lg:px-14">
        <div className="mb-8 flex items-center justify-between lg:hidden">
          <Logo />
          <BotaoTema />
        </div>
        <div className="hidden lg:mb-8 lg:flex lg:justify-end">
          <BotaoTema />
        </div>

        <div className="mx-auto w-full max-w-sm lg:mx-0">
          <h2 className="text-2xl font-semibold tracking-tight">Entrar</h2>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Use seu CPF e a senha que a empresa forneceu.
          </p>

          <form
            className="mt-7 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submeter(cpf, senha);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="cpf">CPF</Label>
              <Input
                id="cpf"
                inputMode="numeric"
                autoComplete="username"
                placeholder="000.000.000-00"
                value={mascaraCPF(cpf)}
                onChange={(e) => setCpf(e.target.value.replace(/\D/g, "").slice(0, 11))}
                aria-invalid={Boolean(erro)}
                className="h-11 text-base tnum"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                aria-invalid={Boolean(erro)}
                className="h-11 text-base"
              />
            </div>

            {erro && (
              <p role="alert" className="text-destructive text-sm font-medium">
                {erro}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={enviando}>
              {enviando ? <LoaderCircleIcon className="animate-spin" /> : null}
              Entrar
            </Button>

            <button
              type="button"
              className="text-muted-foreground hover:text-foreground mx-auto block text-sm underline-offset-4 hover:underline"
              onClick={() =>
                setErro("No primeiro acesso a senha é sua data de nascimento. Procure o RH se precisar redefinir.")
              }
            >
              Esqueci minha senha
            </button>
          </form>

        </div>
      </main>
    </div>
  );
}
