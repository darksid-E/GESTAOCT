# Arquitetura

## Visão geral

```
index.html ── js/main.js (inicializa os módulos)
                │
                ├── state (src/state.ts → js/state.js)   estado global, config, cache local, regras de página
                ├── sessao.js        token: renova antes de vencer, repete em 401, sincroniza perfil e abas
                ├── supabase-api.js  todas as chamadas ao PostgREST (com paginação listarTodos)
                ├── fotos.js         compressão, URL assinada e exclusão de fotos no Storage
                ├── auth.js          login, cadastro por código, recuperação, permissões na interface
                ├── navigation.js    menu lateral, abas e submenu de bateria
                ├── páginas: mapa2d.js + modal-reparo.js + twin3d.js + tabela.js + impressao.js + dashboard.js (Reparos)
                │            maquinas.js · relatorio-turno.js · itens-controle.js · permissoes.js
                └── utilitários (TypeScript): utils (esc, datas, prazos) · toast (avisos) · dialogo (confirmação)
```

Sem bundler: o navegador carrega os módulos ES direto. O TypeScript (`src/`) só compila para `js/`.

## Dados e segurança

| Camada | Regra |
|---|---|
| `auth.users` | trigger `ct_bloquear_email_externo`: só email @ternium.com(.xx) |
| `usuario_valido()` | logado + email confirmado + domínio Ternium; exigido por todas as funções abaixo |
| `pode_ver(pagina)` | coluna `ver_<pagina>` do perfil; políticas **restritivas** de leitura por página |
| `eh_admin()` | `isAdmin`: lançar/editar/excluir dados |
| `eh_dev()` | `isDev`: alterar permissões e metas; trigger em `perfis` impede mexer em outro dev, em `isDev` e em `ver_permissoes` pela API |
| Storage `fotos_reparos` | ler: `pode_ver('reparos')`; enviar/apagar: admin. Bucket privado + URL assinada |

Leituras grandes passam por `listarTodos()` (páginas de 1000, o máximo do Supabase).

## Convenções

- Todo dado vindo do banco que vai para `innerHTML` passa por `esc()`.
- Mensagens ao usuário: `mostrarToast()`; confirmações: `await confirmar()`.
- Mudança no banco = nova migração em `supabase/migrations/` + caso em `tests/sql/rodar.sh`.
- Mudança de comportamento = teste em `tests/e2e/` (Supabase falso em `tests/e2e/supabase-falso.mjs`).

## Pendências conhecidas

- `relatorio-turno.js` (~1.300 linhas) e `auth.js` (~860) ainda precisam ser quebrados.
- Parte dos botões usa `onclick` no HTML com funções em `window.*`.
- Migração para TypeScript: feitos `state`, `types`, `utils`, `toast`, `dialogo`.
- Esquema original do banco ainda fora das migrações; sem ambiente de homologação.
- Filtros das tabelas ainda são feitos no navegador (os dados já vêm completos, sem corte).
