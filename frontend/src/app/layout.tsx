import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "BLUE — bem-estar no trabalho",
  description:
    "Monitoramento contínuo do bem-estar físico dos colaboradores. Identifique padrões de dor e aja antes que o problema se agrave.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f8fb" },
    { media: "(prefers-color-scheme: dark)", color: "#081420" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

/* Aplica o tema antes da primeira pintura para não piscar branco. */
const SCRIPT_TEMA = `try{var t=localStorage.getItem("blue.tema");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
