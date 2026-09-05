import { Logo } from "@/components/logo";

/* A espera que não tem tela anterior para preservar: a sessão sendo
   verificada num F5, a raiz decidindo para onde mandar o usuário. Trocar de
   tela dentro do produto não passa por aqui — ali o conteúdo anterior fica
   e quem avisa é a barra (`components/barra-carregando.tsx`). */
export function TelaCarregando({ mensagem = "Carregando…" }: { mensagem?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <Logo
          tamanho="lg"
          comTexto={false}
          className="animate-pulse motion-reduce:animate-none"
        />
        <p className="text-muted-foreground text-sm">{mensagem}</p>
      </div>
    </div>
  );
}
