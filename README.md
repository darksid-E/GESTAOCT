# Central de Dados Coqueria (GESTAOCT)

App web da Coqueria (Ternium) para registrar e acompanhar dados operacionais: reparos dos fornos,
máquinas de carregamento, relatório de passagem de turno e itens de controle. Roda no navegador
(computador e celular), com dados no Supabase e publicação na Vercel.

## Páginas

| Página | O que faz |
|---|---|
| **Gestão de Reparos** | Mapa 2D das baterias com a fase de cada reparo, modal com vista 3D, histórico, fotos antes/depois, tabela de dados com filtros, impressão e exportação Excel. |
| **Máquinas** | Lançamentos das máquinas 31, 33 e 32 de cada bateria. 31/32: altura programada ligada ao perfil de carga, medições da bandeja, desvio com justificativa, compactação. 33: só tempo de ciclo e nível de óleo. |
| **Relatório de Turno** | Cards por bateria (Controle Térmico, Máquinas, Caldeiras, FGDs) com o último valor de cada item, meta e cor. Itens de Máquinas vêm automáticos. Registro com mais de 2 dias aparece em branco. Metas editáveis por desenvolvedores. |
| **Itens de Controle** | Comporta, Sapata, Truck e Queda de Material: lançamentos, banco com filtros e Excel. |
| **Permissões** | Lista de usuários, quem é admin e quais páginas cada um vê, com indicadores de lançamentos. |

## Acesso e permissões

- Cadastro só com email **@ternium.com(.xx)**, confirmado por código. A regra vale no próprio banco
  (trigger em `auth.users`), não só na tela.
- `ver_<pagina>` (perfis) decide quem **vê** cada página (padrão: sim; `ver_permissoes`: não).
- `isAdmin` decide quem **lança/edita/exclui** dados.
- `isDev` decide quem altera **permissões e metas**; dev não altera outro dev.
- Tudo é garantido por RLS no Supabase. A interface só esconde o que a pessoa não pode usar.

Detalhes em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## Rodar localmente

```bash
npm install
cp supabase-config.example.js supabase-config.js   # preencha URL e chave publishable
npx serve .                                        # ou qualquer servidor estático
```

O frontend é HTML + módulos ES nativos (sem bundler). Os arquivos `src/*.ts` compilam para `js/*.js`
com `npm run build` (o `.js` gerado também fica no repositório).

## Testes

| Comando | O que testa |
|---|---|
| `npm run tipos` | Checagem do TypeScript |
| `npm run lint` | ESLint |
| `npm run test:unit` | Regras puras (datas, prazos, metas, paginação, fotos, permissões) |
| `npm run test:e2e` | Navegador (Playwright) com um Supabase **falso** — nada toca o banco real. Primeira vez: `npx playwright install chromium` |
| `npm run test:sql` | Migrações + RLS + triggers num Postgres local que imita o Supabase (variáveis `PG*`) |
| `npm test` | Tipos, lint, unidade e navegador |

O GitHub Actions (`.github/workflows/ci.yml`) roda tudo isso a cada push e pull request.
Para impedir deploy com erro, ative na branch `main` a proteção que exige o CI verde.

## Banco de dados (Supabase)

- Mudanças de esquema ficam em `supabase/migrations/`, em ordem de data. Todas podem ser rodadas
  de novo sem efeito colateral. Aplique pelo SQL Editor (ou `supabase db push`), **na ordem**.
- `supabase/consultas/` tem consultas de apoio (fotos órfãs, diagnóstico do relatório, metas excluídas).
- O esquema original (anterior a out/2026) ainda não está versionado: gere com
  `supabase db dump --schema public > supabase/migrations/00000000_esquema_base.sql`.

## Publicação

A Vercel publica a branch `main`. No build, `scripts/gerar-config.js` cria o `supabase-config.js`
a partir das variáveis `SUPABASE_URL` e `SUPABASE_KEY` (a chave publishable não é secreta; a
proteção é o RLS).
