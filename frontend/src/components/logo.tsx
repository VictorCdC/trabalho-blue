import { cn } from "@/lib/utils";

/* Marca provisória: monograma em bloco azul. Trocar quando houver
   identidade visual definitiva. */
export function Logo({
  className,
  tamanho = "md",
  comTexto = true,
  /** use sobre fundo azul: bloco claro com a letra azul */
  invertido = false,
}: {
  className?: string;
  tamanho?: "sm" | "md" | "lg";
  comTexto?: boolean;
  invertido?: boolean;
}) {
  const caixa = { sm: "size-7 text-[13px]", md: "size-9 text-base", lg: "size-12 text-xl" }[tamanho];
  const texto = { sm: "text-sm", md: "text-base", lg: "text-2xl" }[tamanho];

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className={cn(
          "grid place-items-center rounded-lg font-bold tracking-tight",
          invertido ? "bg-white text-primary" : "bg-primary text-primary-foreground",
          caixa,
        )}
      >
        B
      </span>
      {comTexto && (
        <span className={cn("font-semibold tracking-tight", texto)}>
          BLUE
        </span>
      )}
    </span>
  );
}
