// =========================================================
// --- CADASTRO / SUPABASE AUTH (login real com senha) ---
// =========================================================
import { state, config, salvarSessaoLocal, isAdminAtual, nomeExibicaoAtual, carregarCacheLocal, salvarCacheLocal } from './state.js';
import { listarReparosSupabase } from './supabase-api.js';
import { irParaAba, getNavElements } from './navigation.js';
import { gerarMapaBaterias } from './mapa2d.js';
import { processarDadosGlobais } from './mapa2d.js';
import { renderizarTabela } from './tabela.js';

// Cadastro liberado só para emails corporativos @ternium.com — aceita
// qualquer variação de país (ternium.com, ternium.com.br, ternium.com.us,
// ternium.com.ar, ternium.com.mx etc).
function emailEhDominioTernium(email) {
    return /^[^\s@]+@ternium\.com(\.[a-z]{2,3})?$/i.test(email.trim());
}

async function authFetch(caminho, options = {}) {
    const resposta = await fetch(`${config.SUPABASE_AUTH_BASE}${caminho}`, {
        ...options,
        headers: { apikey: config.SUPABASE_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) {
        const msg = dados?.error_description || dados?.msg || dados?.error_code || dados?.error || `Erro ${resposta.status}`;
        throw new Error(msg);
    }
    return dados;
}

async function cadastrarComEmailSenha(email, senha, dadosPerfil) {
    // Diz ao Supabase pra onde mandar o link de confirmação: a própria
    // URL onde o app está rodando agora. Essa URL também precisa estar
    // cadastrada em Authentication > URL Configuration > Redirect URLs
    // no painel do Supabase, senão ele ignora e usa o valor padrão.
    //
    // nome/sobrenome/matrícula vão como "user_metadata": o Supabase
    // guarda isso no próprio auth.users, no servidor. Diferente do
    // sessionStorage (que só existe na aba atual), esses dados chegam
    // intactos mesmo se a confirmação do email abrir em outra aba,
    // outro navegador ou até outro celular.
    const urlAtual = window.location.href.split('#')[0].split('?')[0];
    return authFetch('/signup', {
        method: 'POST',
        body: JSON.stringify({
            email,
            password: senha,
            options: { emailRedirectTo: urlAtual, data: dadosPerfil }
        })
    });
}

async function entrarComEmailSenha(email, senha) {
    return authFetch('/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password: senha }) });
}

async function renovarSessaoAuth(refreshToken) {
    return authFetch('/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) });
}

async function sairAuth() {
    if (state.sessaoAtual?.access_token) {
        try {
            await fetch(`${config.SUPABASE_AUTH_BASE}/logout`, {
                method: 'POST',
                headers: { apikey: config.SUPABASE_KEY, Authorization: `Bearer ${state.sessaoAtual.access_token}` }
            });
        } catch (erro) { console.warn('Falha ao encerrar sessão no servidor:', erro); }
    }
    salvarSessaoLocal(null);
}

async function buscarPerfilProprio(userId, tokenAcesso) {
    const resposta = await fetch(`${config.SUPABASE_URL}/${config.SUPABASE_TABLE_PERFIS}?select=*&id=eq.${userId}`, {
        headers: { apikey: config.SUPABASE_KEY, Authorization: `Bearer ${tokenAcesso}` }
    });
    if (!resposta.ok) throw new Error(`Supabase ${resposta.status}: ${await resposta.text()}`);
    const lista = await resposta.json();
    return Array.isArray(lista) && lista.length > 0 ? lista[0] : null;
}

async function criarPerfilProprio(userId, tokenAcesso, dados) {
    const resposta = await fetch(`${config.SUPABASE_URL}/${config.SUPABASE_TABLE_PERFIS}`, {
        method: 'POST',
        headers: { apikey: config.SUPABASE_KEY, Authorization: `Bearer ${tokenAcesso}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ id: userId, ...dados, isAdmin: false })
    });
    if (!resposta.ok) throw new Error(`Supabase ${resposta.status}: ${await resposta.text()}`);
    const lista = await resposta.json();
    return lista[0];
}

function renderizarCadastroUI() {
    const blocoLogado = document.getElementById('cadastro_status_logado');
    const blocoLogin = document.getElementById('cadastro_form_login');
    const blocoNovo = document.getElementById('cadastro_form_novo');
    const infoLogado = document.getElementById('cadastro_info_logado');
    if (!blocoLogado || !blocoLogin || !blocoNovo || !infoLogado) return;

    if (state.sessaoAtual?.perfil) {
        const p = state.sessaoAtual.perfil;
        blocoLogado.style.display = 'block';
        blocoLogin.style.display = 'none';
        blocoNovo.style.display = 'none';
        const badge = p.isAdmin
            ? '<span class="badge_admin sim">Administrador</span>'
            : '<span class="badge_admin nao">Somente Navegação</span>';
        infoLogado.innerHTML = `
            <div><strong>Nome:</strong> ${p.nome} ${p.sobrenome}</div>
            <div><strong>Matrícula:</strong> ${p.matricula}</div>
            <div><strong>Email:</strong> ${state.sessaoAtual.user?.email || ''}</div>
            <div><strong>Permissão:</strong> ${badge}</div>
        `;
    } else {
        blocoLogado.style.display = 'none';
        blocoLogin.style.display = 'block';
        blocoNovo.style.display = 'block';
    }
}

// Monta a sessão local a partir de uma resposta do /token ou /signup
// (quando a confirmação de email está desligada no projeto, o signup já
// retorna os tokens, como se fosse um login).
// Retorna { perfil, erroPerfil } pra quem chamou poder avisar o usuário
// caso o perfil não tenha sido salvo (em vez de falhar em silêncio).
async function iniciarSessaoAPartirDoToken(tokenResposta) {
    const expiresAt = Date.now() + (tokenResposta.expires_in || 3600) * 1000;
    let perfil = null;
    let erroPerfil = null;
    try {
        perfil = await buscarPerfilProprio(tokenResposta.user.id, tokenResposta.access_token);
        if (!perfil) {
            // Primeiro acesso depois do cadastro: cria a linha de perfil
            // usando os dados que vieram salvos no user_metadata do
            // Supabase Auth (nome/sobrenome/matrícula preenchidos na
            // hora do cadastro). isAdmin sempre nasce false.
            const meta = tokenResposta.user?.user_metadata || {};
            perfil = await criarPerfilProprio(tokenResposta.user.id, tokenResposta.access_token, {
                nome: meta.nome || '',
                sobrenome: meta.sobrenome || '',
                matricula: meta.matricula || ''
            });
        }
    } catch (erro) {
        console.error('Erro ao carregar/criar perfil:', erro);
        erroPerfil = erro.message;
    }

    salvarSessaoLocal({
        access_token: tokenResposta.access_token,
        refresh_token: tokenResposta.refresh_token,
        expires_at: expiresAt,
        user: tokenResposta.user,
        perfil
    });

    return { perfil, erroPerfil };
}

// Roda no início do app: se havia sessão salva, renova o token se
// preciso (ou limpa a sessão se o refresh_token não for mais válido).
async function restaurarSessaoAoIniciar() {
    if (!state.sessaoAtual) return;
    if (state.sessaoAtual.expires_at && Date.now() < state.sessaoAtual.expires_at - 30000) return; // ainda válida

    if (!state.sessaoAtual.refresh_token) { salvarSessaoLocal(null); return; }
    try {
        const renovado = await renovarSessaoAuth(state.sessaoAtual.refresh_token);
        await iniciarSessaoAPartirDoToken(renovado);
    } catch (erro) {
        console.warn('Sessão expirada, é necessário entrar novamente.', erro);
        salvarSessaoLocal(null);
    }
}

// Mostra/esconde as abas do menu lateral conforme o login. Sem sessão
// ativa, só a aba "Cadastro" (login/cadastro) fica visível; se a pessoa
// deslogar estando em outra aba, ela é redirecionada pra lá.
export function aplicarVisibilidadeAbas() {
    const logado = !!state.sessaoAtual;
    const { navButtons, pageSections } = getNavElements();

    navButtons.forEach(btn => {
        const targetId = btn.getAttribute('data-target');
        btn.style.display = (logado || config.ABAS_LIVRES_SEM_LOGIN.includes(targetId)) ? '' : 'none';
    });

    if (!logado) {
        const secaoAtiva = Array.from(pageSections).find(s => s.classList.contains('active_section'));
        if (secaoAtiva && !config.ABAS_LIVRES_SEM_LOGIN.includes(secaoAtiva.id)) {
            irParaAba('cadastro');
        }
    }
}
window.aplicarVisibilidadeAbas = aplicarVisibilidadeAbas;

// Aplica as permissões de admin/navegação em toda a interface
export function aplicarPermissoes() {
    aplicarVisibilidadeAbas();
    const admin = isAdminAtual();

    const btnNovoReparo = document.getElementById('btn_abrir_manual');
    if (btnNovoReparo) btnNovoReparo.style.display = admin ? '' : 'none';

    const btnNovoTabela = document.getElementById('btn_novo_tabela');
    if (btnNovoTabela) btnNovoTabela.style.display = admin ? '' : 'none';

    const btnImportar = document.getElementById('btn_trigger_import');
    if (btnImportar) btnImportar.style.display = admin ? '' : 'none';

    const avisoReadonly = document.getElementById('aviso_readonly_modal');
    if (avisoReadonly) avisoReadonly.style.display = admin ? 'none' : 'block';

    const camposModal = document.querySelectorAll(
        '#modal_reparo .col_form select, #modal_reparo .col_form textarea, ' +
        '#modal_reparo .col_form input, #modal_reparo .col_form button'
    );
    camposModal.forEach(el => { el.disabled = !admin; });

    document.querySelectorAll('#modal_reparo .file_upload_label').forEach(lbl => {
        lbl.classList.toggle('disabled', !admin);
    });

    if (document.getElementById('tbody_banco')) renderizarTabela();
}
window.aplicarPermissoes = aplicarPermissoes;

// Depois que a pessoa confirma o email, o Supabase redireciona de volta
// pra cá com os tokens grudados no #hash da URL. Detecta isso e já loga
// automaticamente, sem precisar digitar a senha de novo.
async function processarRedirectAuth() {
    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token')) return false;

    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const expiresIn = params.get('expires_in');
    if (!accessToken) return false;

    try {
        const respostaUser = await fetch(`${config.SUPABASE_AUTH_BASE}/user`, {
            headers: { apikey: config.SUPABASE_KEY, Authorization: `Bearer ${accessToken}` }
        });
        if (!respostaUser.ok) throw new Error(`Supabase ${respostaUser.status}`);
        const user = await respostaUser.json();

        const { erroPerfil } = await iniciarSessaoAPartirDoToken({
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: Number(expiresIn) || 3600,
            user
        });

        // Limpa o #hash da URL sem recarregar a página
        history.replaceState(null, '', window.location.pathname + window.location.search);

        if (erroPerfil) {
            alert(`Email confirmado, mas houve um problema ao salvar seu perfil no Supabase:\n${erroPerfil}\n\nVerifique se a tabela "perfis" e as políticas RLS foram criadas corretamente.`);
        } else {
            alert(`Email confirmado! Bem-vindo(a), ${nomeExibicaoAtual()}.`);
        }
        return true;
    } catch (erro) {
        console.error('Erro ao processar confirmação de email:', erro);
        return false;
    }
}

export function initAuth() {
    document.getElementById('btn_entrar_cadastro')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn_entrar_cadastro');
        const email = document.getElementById('login_email').value.trim();
        const senha = document.getElementById('login_senha').value;
        if (!email || !senha) return alert('Informe email e senha para entrar.');
        if (!state.supabaseAtivo) return alert('Supabase não está configurado no momento.');

        btn.disabled = true; const textoOriginal = btn.innerText; btn.innerText = 'Entrando...';
        try {
            const resultado = await entrarComEmailSenha(email, senha);
            const { erroPerfil } = await iniciarSessaoAPartirDoToken(resultado);
            document.getElementById('login_senha').value = '';
            renderizarCadastroUI();
            aplicarPermissoes();
            if (erroPerfil) {
                alert(`Login feito, mas houve um problema ao carregar seu perfil no Supabase:\n${erroPerfil}\n\nVerifique se a tabela "perfis" e as políticas RLS foram criadas corretamente.`);
            } else {
                alert(`Bem-vindo(a), ${nomeExibicaoAtual()}!`);
            }
        } catch (erro) {
            console.error('Erro ao entrar:', erro);
            alert(`Não foi possível entrar.\n${erro.message}`);
        } finally {
            btn.disabled = false; btn.innerText = textoOriginal;
        }
    });

    document.getElementById('btn_cadastrar')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn_cadastrar');
        const nome = document.getElementById('cad_nome').value.trim();
        const sobrenome = document.getElementById('cad_sobrenome').value.trim();
        const matricula = document.getElementById('cad_matricula').value.trim();
        const email = document.getElementById('cad_email').value.trim();
        const senha = document.getElementById('cad_senha').value;
        const senhaConfirma = document.getElementById('cad_senha_confirma').value;

        if (!nome || !sobrenome || !matricula || !email || !senha) return alert('Preencha todos os campos do cadastro.');
        if (!emailEhDominioTernium(email)) return alert('O cadastro é permitido apenas com email corporativo @ternium.com.');
        if (senha.length < 6) return alert('A senha precisa ter pelo menos 6 caracteres.');
        if (senha !== senhaConfirma) return alert('As senhas não conferem.');
        if (!state.supabaseAtivo) return alert('Supabase não está configurado no momento.');

        btn.disabled = true; const textoOriginal = btn.innerText; btn.innerText = 'Cadastrando...';
        try {
            const resultado = await cadastrarComEmailSenha(email, senha, { nome, sobrenome, matricula });

            if (resultado.access_token) {
                // Confirmação de email desligada no projeto: já vem logado
                const { erroPerfil } = await iniciarSessaoAPartirDoToken(resultado);
                renderizarCadastroUI();
                aplicarPermissoes();
                if (erroPerfil) {
                    alert(`Sua conta foi criada, mas houve um problema ao salvar o perfil no Supabase:\n${erroPerfil}\n\nVerifique se a tabela "perfis" e as políticas RLS foram criadas corretamente.`);
                } else {
                    alert(`Cadastro realizado com sucesso, ${nome}! Você está navegando como usuário de leitura até que um administrador libere sua permissão.`);
                }
            } else {
                alert(`Cadastro realizado! Verifique o email ${email} para confirmar a conta e depois faça login.`);
            }

            document.getElementById('cad_nome').value = '';
            document.getElementById('cad_sobrenome').value = '';
            document.getElementById('cad_matricula').value = '';
            document.getElementById('cad_email').value = '';
            document.getElementById('cad_senha').value = '';
            document.getElementById('cad_senha_confirma').value = '';
        } catch (erro) {
            console.error('Erro ao cadastrar usuário:', erro);
            alert(`Não foi possível concluir o cadastro.\n${erro.message}`);
        } finally {
            btn.disabled = false; btn.innerText = textoOriginal;
        }
    });

    document.getElementById('btn_sair_cadastro')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn_sair_cadastro');
        btn.disabled = true;
        await sairAuth();
        renderizarCadastroUI();
        aplicarPermissoes();
        btn.disabled = false;
    });
}

export async function inicializarApp() {
    const veioDeConfirmacaoEmail = await processarRedirectAuth();
    if (!veioDeConfirmacaoEmail) await restaurarSessaoAoIniciar();

    try {
        state.dbReparos = await listarReparosSupabase();
        salvarCacheLocal();
    } catch (erro) {
        console.error('Falha ao carregar o Supabase. Usando cache local:', erro);
        state.supabaseAtivo = false;
        state.dbReparos = carregarCacheLocal();
        if (config.SUPABASE_URL && config.SUPABASE_KEY) {
            alert('Não foi possível carregar os dados do Supabase. O app abriu com o cache local. Verifique o schema e as políticas RLS.');
        }
    }

    window.mapaStatusAtual = {};
    gerarMapaBaterias();
    processarDadosGlobais();
    renderizarCadastroUI();
    aplicarPermissoes();
}