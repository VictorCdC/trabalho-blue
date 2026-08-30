import { Logo } from "@/components/logo";

export function TelaCarregando({ mensagem = "Carregando…" }: { mensagem?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="flex flex-col items-center gap-4">
        <Logo tamanho="lg" comTexto={false} className="animate-pulse" />
        <p className="text-muted-foreground text-sm">{mensagem}</p>
      </div>
    </div>
  );
}
