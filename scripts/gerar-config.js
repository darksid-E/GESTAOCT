// =========================================================
// Gera supabase-config.js a partir das variáveis de ambiente
// SUPABASE_URL e SUPABASE_KEY.
// =========================================================
// Roda automaticamente no build (ver "build" no package.json).
// Em produção (Vercel), configure as duas variáveis em:
//   Project Settings > Environment Variables
// e dê um redeploy — este script escreve o supabase-config.js
// certinho antes dos arquivos irem pro ar.
//
// Localmente: se as variáveis não estiverem definidas no seu
// terminal, o script NÃO apaga um supabase-config.js que você já
// tenha criado na mão (veja supabase-config.example.js) — assim dá
// pra testar localmente sem precisar exportar env vars toda hora.
const fs = require('fs');
const path = require('path');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
const destino = path.join(__dirname, '..', 'supabase-config.js');

if (!url || !key) {
    if (fs.existsSync(destino)) {
        console.log('[gerar-config] SUPABASE_URL/SUPABASE_KEY não definidas nesta execução — mantendo o supabase-config.js que já existe.');
        process.exit(0);
    }
    console.error(
        '[gerar-config] SUPABASE_URL/SUPABASE_KEY não definidas e supabase-config.js não existe.\n' +
        'Configure as duas variáveis de ambiente (na Vercel ou no seu terminal) ' +
        'ou copie supabase-config.example.js para supabase-config.js e preencha na mão pra testar localmente.'
    );
    process.exit(1);
}

const conteudo = `/*
 * Gerado automaticamente no build (scripts/gerar-config.js) a partir
 * das variáveis de ambiente SUPABASE_URL e SUPABASE_KEY.
 *
 * NÃO EDITE ESTE ARQUIVO NA MÃO nem o commite com valores reais —
 * ele é sobrescrito a cada deploy/build. Pra mudar os valores,
 * configure as variáveis no painel da Vercel (Project Settings >
 * Environment Variables).
 *
 * A chave sb_publishable_ não é secreta (foi feita pra uso no
 * cliente); a proteção de verdade é feita pelas políticas RLS do
 * Supabase.
 */
window.SUPABASE_CONFIG = Object.freeze({
    url: '${url}',
    key: '${key}'
});
`;

fs.writeFileSync(destino, conteudo);
console.log('[gerar-config] supabase-config.js gerado a partir das variáveis de ambiente.');
