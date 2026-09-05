# BLUE — frontend

Next.js 15 (App Router) + React 19 + TypeScript + Tailwind v4 + shadcn/ui.

```bash
npm install
npm run dev        # http://localhost:3000 — precisa do backend em :8000
npm run build
npm run typecheck
npm run lint
```

O frontend não tem mais dados próprios: tudo vem da API. Sem o backend no ar as
telas ficam vazias. Para popular a demonstração, veja `backend/scripts/semear.py`.

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

Desde a migração para a API, isso deixou de ser só uma frase: o servidor não
envia o que o perfil não pode ver. Um alerta individual chega ao RH com
`colaboradorId: null` — não é a tela que esconde o nome, é que ele não veio.

## Estrutura

```
src/
├── app/
│   ├── login/                  # usuário (nome.sobrenome) + senha
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
    ├── api/                    # BlueApi (contrato) + cliente HTTP
    ├── recurso.ts              # useRecurso: busca, recarga e corrida de pedidos
    ├── rbac.ts                 # permissões por perfil
    ├── sessao.tsx              # sessão + estrutura do tenant ativo
    ├── filtros.ts              # recorte unidade/setor/cargo/período
    ├── casos.ts                # título do caso, derivado de região e setor
    └── types.ts                # o contrato — espelha backend/app/esquemas.py
```

## Como os dados chegam

Todo acesso passa por `src/lib/api/index.ts`, que exporta o cliente HTTP de
`http.ts`. Três regras valem para a pasta inteira:

- **A tela não agrega.** KPIs, série temporal, mapa de calor, resumo por setor e
  por cargo vêm somados do backend (`/painel/resumo`, `/painel/setores`,
  `/painel/cargos`). Não existe mais `analytics.ts`: aquelas funções viraram
  consultas SQL em `backend/app/indicadores.py`.
- **Toda listagem é paginada.** `Pagina<T>` traz `itens`, `total`, `limit` e
  `offset`; o componente `Paginador` desenha o rodapé a partir do `total` do
  servidor. Nenhuma tela recebe a lista inteira para cortar em memória.
- **A sessão é um cookie httpOnly.** O cliente manda `credentials: "include"` e
  nada mais; não há token em `localStorage`. Quem sabe quem está logado é
  `/auth/eu`. O que sobra no navegador é a empresa que o superuser escolheu
  olhar, que não é credencial.

O filtro de unidade/setor/cargo/período (`useFiltros`) devolve um `Recorte` que
vira query string. Trocar de setor refaz a consulta; antes refiltrava um array.

## Regras de alerta

Os limiares vêm de `/alertas/regras`, porque quem os aplica é o servidor
(`backend/app/alertas.py`) — a tela pede para poder explicar a regra ao usuário
sem manter uma segunda cópia dos números.

- **Individual:** 3+ registros na mesma região **e lado**, pela mesma pessoa, em 30 dias.
- **Coletivo:** 20%+ do setor relatando a mesma região em 30 dias, com no mínimo 3 pessoas.
- Severidade: individual por ocorrências e intensidade média; coletivo por percentual do setor.

Métricas de painel evitam saturar: `percentualRecorrente` (quem cruzou o limite) e
`taxaDesconforto` (dias com queixa / dias com check-in) discriminam bem mais que
"quem já relatou algo", que chega a 100% em qualquer setor num mês.

## Supressão de grupo pequeno

Quando o recorte tem menos que `K_MINIMO_AGREGACAO` pessoas, o servidor devolve
`suprimido: true` e nada mais — nem a contagem do grupo. As telas mostram
`<RecorteSuprimido />` em vez de zeros. O mesmo vale linha a linha em
`/painel/setores` e `/painel/cargos`.

Isso vale para todos os perfis, inclusive o SESMT: a regra não abre exceção por
papel, e quem tem `dados:identificados` chega ao dado da pessoa pela ficha, que
é o caminho auditado.

## Ambiente de demonstração

Os dados fictícios são plantados pelo backend:

```bash
cd backend && python -m scripts.semear
```

O script imprime a credencial de cada perfil. As oito contas de empresa usam
`NOME.SOBRENOME` com a senha `blue1234`; a da plataforma é `admin` /
`admin123`, que não segue o formato porque é o acesso de manutenção da
demonstração.

São quatro contas de painel (uma por perfil) e cinco colaboradores, um por
setor:

- **ana.nogueira** — Ana Beatriz Nogueira (Atendimento): punho direito em
  escalada → alerta individual, e o caso aberto a partir dele.
- **marcos.souza**, **jose.almeida**, **kelly.serra** e **beatriz.pontes** —
  um por setor, com 75 dias de check-in e queixa cada.

Com cinco colaboradores espalhados, todo recorte fica abaixo de
`K_MINIMO_AGREGACAO`: o painel responde "grupo pequeno demais" em vez de
número, e não há alerta coletivo. As telas do colaborador têm dado cheio.

## Identidade visual

Tokens em `src/app/globals.css`. Azul é a identidade; verde/âmbar/laranja/vermelho
são reservados a intensidade de dor e severidade de alerta — cor sempre significa
algo. Claro e escuro suportados (`.dark`, aplicado antes da primeira pintura).
O monograma em `src/components/logo.tsx` é provisório.

## Pendências conhecidas

- Exportação de PDF/CSV nos relatórios: botões presentes, geração é do backend.
- Sem notificação push/SMS: o check-in aparece quando o colaborador abre o app.
- Thresholds de alerta não são configuráveis por empresa ainda.
