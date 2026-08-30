# BLUE — frontend

Next.js 15 (App Router) + React 19 + TypeScript + Tailwind v4 + shadcn/ui.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run typecheck
npm run lint
```

## Perfis e acessos

| Perfil | Vê | Não vê |
|---|---|---|
| `colaborador` | check-in diário, mapa corporal, o próprio histórico | qualquer dado de colega |
| `sesmt` | queixas **identificadas**, casos, intervenções | administração de usuários |
| `rh` | números agregados por unidade/setor/cargo | nome de colaborador em queixa |
| `admin` | estrutura organizacional, usuários e acessos, agregados | dado clínico identificado |
| `superuser` | empresas clientes, planos, qualquer tenant | dado clínico identificado |

A matriz completa é gerada de `/rbac/permissoes.json` para `src/lib/rbac-gerado.ts`
(`python rbac/gerar.py`) — a mesma fonte que o backend consome. `src/lib/rbac.ts`
reexporta a matriz e acrescenta o que é só de navegação.
**A guarda no cliente é conveniência de navegação; a autorização real é do backend.**

## Estrutura

```
src/
├── app/
│   ├── login/                  # CPF + senha
│   ├── (colaborador)/          # mobile-first, navegação inferior
│   │   ├── inicio/             # check-in do dia + resumo
│   │   ├── registrar/          # mapa corporal + formulário da queixa
│   │   ├── historico/
│   │   └── perfil/
│   └── (painel)/               # desktop, sidebar
│       ├── painel/             # visão geral, alertas, casos, setores,
│       │                       # colaboradores, relatórios, estrutura, usuários
│       └── plataforma/         # empresas clientes (superuser)
├── components/
│   ├── mapa-corporal.tsx       # SVG clicável; também serve de mapa de calor
│   ├── painel/                 # KPIs, filtros, gráficos, cartão de alerta
│   └── ui/                     # shadcn/ui
└── lib/
    ├── api/                    # BlueApi (contrato) + mock em memória
    ├── analytics.ts            # regras de alerta e agregações
    ├── rbac.ts                 # permissões por perfil
    ├── sessao.tsx              # sessão + dados do tenant ativo
    ├── filtros.ts              # recorte unidade/setor/cargo/período
    └── mock/seed.ts            # dados fictícios determinísticos
```

## Regras de alerta

Em `src/lib/analytics.ts` → `REGRAS` (fixas nesta versão, viram parâmetro por empresa depois):

- **Individual:** 3+ registros na mesma região **e lado**, pela mesma pessoa, em 30 dias.
- **Coletivo:** 20%+ do setor relatando a mesma região em 30 dias, com no mínimo 3 pessoas.
- Severidade: individual por ocorrências e intensidade média; coletivo por percentual do setor.

Métricas de painel evitam saturar: `percentualRecorrente` (quem cruzou o limite) e
`taxaDesconforto` (dias com queixa / dias com check-in) discriminam bem mais que
"quem já relatou algo", que chega a 100% em qualquer setor num mês.

## Dados: como ligar no backend

Todo acesso a dados passa por `src/lib/api/index.ts`:

```ts
export const api: BlueApi = mockApi;   // ← troque por httpApi
```

Crie `src/lib/api/http.ts` implementando `BlueApi` com `fetch` em
`process.env.NEXT_PUBLIC_API_URL` e mude essa linha. **Nenhum componente muda.**

Dois pontos de atenção nessa troca:

1. `snapshot(empresaId)` hoje devolve a empresa inteira porque o mock roda no
   navegador. O backend real deve devolver só o que o perfil pode ver — um
   colaborador nunca deve receber as queixas dos colegas.
2. Os dados do mock vivem em memória e voltam ao estado inicial a cada recarga
   da página. Ids de caso são derivados do alerta, então links continuam válidos.

## Ambiente de demonstração

A tela de login lista um atalho por perfil (senha `blue1234`) **apenas quando
`NEXT_PUBLIC_AMBIENTE=demo`** — em `.env.development` para o `npm run dev`, e no
compose. Qualquer outro valor esconde os atalhos. "Restaurar dados", na barra
lateral, recria o conjunto fictício.

Dados plantados para a demonstração:

- **Ana Beatriz Nogueira** (Atendimento): punho direito em escalada → alerta individual.
- **Estoque**: surto coletivo de lombar → caso em andamento com ginástica laboral.
- **Produção**: ombro em queda depois de ajuste de bancada → caso resolvido.

## Identidade visual

Tokens em `src/app/globals.css`. Azul é a identidade; verde/âmbar/laranja/vermelho
são reservados a intensidade de dor e severidade de alerta — cor sempre significa
algo. Claro e escuro suportados (`.dark`, aplicado antes da primeira pintura).
O monograma em `src/components/logo.tsx` é provisório.

## Pendências conhecidas

- Exportação de PDF/CSV nos relatórios: botões presentes, geração é do backend.
- Sem notificação push/SMS: o check-in aparece quando o colaborador abre o app.
- Thresholds de alerta não são configuráveis por empresa ainda.
