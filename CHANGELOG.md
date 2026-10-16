# Changelog

## 2026-10-16 — Auditoria: segurança, dados e base de testes
### Segurança
- Domínio @ternium e email confirmado exigidos no banco (trigger + `usuario_valido()`).
- Escape de todo texto do usuário em `innerHTML` (fecha XSS armazenado).
- Fotos: políticas de Storage, URL assinada (pronto para bucket privado), compressão, limite de 25 MB e exclusão junto com o reparo.
### Dados
- Leituras paginadas: fim do corte silencioso em 1.000 linhas (reparos, máquinas, perfis, metas, relatório, itens de controle).
- Cache local não derruba mais a carga quando o navegador está sem espaço.
- Índices por data, máquina e bateria.
### Base
- SQL versionado em `supabase/migrations/`; consultas em `supabase/consultas/`.
- Testes: unidade (node:test), navegador (Playwright + Supabase falso) e banco (Postgres); GitHub Actions.
- ESLint; `utils`, `toast` e `dialogo` em TypeScript.
### Interface
- Diálogo de confirmação próprio no lugar do `confirm()` do navegador.
### Limpeza
- Removidos `temperaturas.js`, `pi-api.js` e `pi-config.js` (integração PI descontinuada).

## 2026-10-15
- Itens de Controle (Comporta, Sapata, Truck, Queda de Material) e submenu por bateria.
- Máquina 33 e vínculo altura programada × perfil de carga.

## 2026-10-14 e anteriores
- Relatório de Turno: automáticos de Máquinas editáveis, regra dos 2 dias, cadastro/edição/exclusão de metas, ordem dos cards.
- Permissões por página (`ver_*`), `isDev`, página Permissões.
- Login com código por email, renovação automática do token, permissões ao vivo.
