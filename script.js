document.addEventListener("DOMContentLoaded", () => {
    // =========================================================
    // --- 1. LÓGICA DO MENU E MAPA 2D ---
    // =========================================================
    const menuButton = document.getElementById("menu");
    const sideBar = document.getElementById("side_bar");
    const navButtons = document.querySelectorAll(".nav_btn");
    const pageSections = document.querySelectorAll(".page_section");

    if (window.innerWidth > 768) sideBar.classList.add("active");
    menuButton.addEventListener("click", () => sideBar.classList.toggle("active"));

    // Abas que só podem ser vistas depois de logar. "cadastro" é a tela de
    // login/cadastro em si, então fica sempre acessível.
    const ABAS_LIVRES_SEM_LOGIN = ['cadastro'];

    function irParaAba(targetId) {
        const button = Array.from(navButtons).find(btn => btn.getAttribute('data-target') === targetId);
        navButtons.forEach(btn => btn.classList.remove("active_link"));
        if (button) button.classList.add("active_link");
        pageSections.forEach(section => section.classList.remove("active_section"));
        const targetSection = document.getElementById(targetId);
        if (targetSection) targetSection.classList.add("active_section");

        if (targetId === 'dashboard') { renderizarDashboard(); }
        if (targetId === 'temperaturas') { renderizarGraficoTemperaturaTab(); }
    }
    window.irParaAba = irParaAba;

    navButtons.forEach(button => {
        button.addEventListener("click", (e) => {
            const targetId = button.getAttribute("data-target");
            const logado = !!sessaoAtual;
            if (!logado && !ABAS_LIVRES_SEM_LOGIN.includes(targetId)) {
                alert('Faça login para acessar esta área.');
                irParaAba('cadastro');
                if (window.innerWidth <= 768) sideBar.classList.remove("active");
                return;
            }
            irParaAba(targetId);
            if (window.innerWidth <= 768) sideBar.classList.remove("active");
        });
    });

    const selForno = document.getElementById('sel_forno');
    for(let i=1; i<=18; i++) {
        let f = i.toString().padStart(2, '0');
        selForno.innerHTML += `<option value="${f}">${f}</option>`;
    }

    // =========================================================
    // --- INTEGRAÇÃO COM SUPABASE ---
    // =========================================================
    const SUPABASE_URL = window.SUPABASE_CONFIG?.url || '';
    const SUPABASE_KEY = window.SUPABASE_CONFIG?.key || '';
    // A URL de config aponta para /rest/v1 (usada pelo PostgREST). O Storage
    // vive na raiz do projeto (/storage/v1/...), então removemos o sufixo
    // /rest/v1 para montar a URL correta e evitar o erro PGRST125 (o
    // PostgREST tentava interpretar "storage" como parte da rota REST).
    const SUPABASE_STORAGE_BASE = SUPABASE_URL.replace(/\/rest\/v1\/?$/, '');
    const SUPABASE_TABLE = 'reparos';
    let supabaseAtivo = Boolean(SUPABASE_URL && SUPABASE_KEY);
    let dbReparos = [];

    function headersSupabase(extra = {}) {
        return {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${tokenAtual()}`,
            'Content-Type': 'application/json',
            ...extra
        };
    }

    async function requisicaoSupabase(caminho, options = {}) {
        if (!supabaseAtivo) throw new Error('Supabase não configurado.');
        const resposta = await fetch(`${SUPABASE_URL}/${SUPABASE_TABLE}${caminho}`, {
            ...options,
            headers: headersSupabase(options.headers || {})
        });
        if (!resposta.ok) {
            const detalhe = await resposta.text();
            throw new Error(`Supabase ${resposta.status}: ${detalhe}`);
        }
        if (resposta.status === 204) return null;
        return resposta.json();
    }

    async function listarReparosSupabase() {
        return requisicaoSupabase('?select=*&order=id_reparo.asc');
    }

    async function criarReparoSupabase(dados) {
        const resposta = await requisicaoSupabase('', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify(dados)
        });
        return resposta[0];
    }

    async function atualizarReparoSupabase(idReparo, dados) {
        const resposta = await requisicaoSupabase(`?id_reparo=eq.${encodeURIComponent(idReparo)}`, {
            method: 'PATCH',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify(dados)
        });
        return resposta[0];
    }

    async function excluirReparoSupabase(idReparo) {
        await requisicaoSupabase(`?id_reparo=eq.${encodeURIComponent(idReparo)}`, {
            method: 'DELETE',
            headers: { Prefer: 'return=minimal' }
        });
    }

    // NOVO: Função de Upload para o Supabase
    async function uploadFotoSupabase(file, tipoDaFoto) {
        if (!supabaseAtivo) return null;
        const path = `reparos/${Date.now()}_${tipoDaFoto}_${file.name.replace(/\s+/g, '_')}`;
        
        const resposta = await fetch(`${SUPABASE_STORAGE_BASE}/storage/v1/object/fotos_reparos/${path}`, {
            method: 'POST',
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${tokenAtual()}`,
                'Content-Type': file.type,
                'x-upsert': 'true'
            },
            body: file
        });

        if (!resposta.ok) {
            console.error('Erro ao subir foto:', await resposta.text());
            return null;
        }
        
        return `${SUPABASE_STORAGE_BASE}/storage/v1/object/public/fotos_reparos/${path}`;
    }

    async function importarReparosSupabase(registros) {
        const resposta = await requisicaoSupabase('?on_conflict=id_reparo', {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
            body: JSON.stringify(registros)
        });
        return resposta;
    }

    // =========================================================
    // --- CADASTRO / SUPABASE AUTH (login real com senha) ---
    // =========================================================
    const SUPABASE_AUTH_BASE = `${SUPABASE_STORAGE_BASE}/auth/v1`;
    const SUPABASE_TABLE_PERFIS = 'perfis';
    const CHAVE_SESSAO_LOCAL = 'sessaoAuthCT';

    function carregarSessaoLocal() {
        try {
            return JSON.parse(localStorage.getItem(CHAVE_SESSAO_LOCAL));
        } catch (erro) {
            return null;
        }
    }

    let sessaoAtual = carregarSessaoLocal(); // { access_token, refresh_token, expires_at, user, perfil }

    function salvarSessaoLocal(sessao) {
        sessaoAtual = sessao;
        if (sessao) localStorage.setItem(CHAVE_SESSAO_LOCAL, JSON.stringify(sessao));
        else localStorage.removeItem(CHAVE_SESSAO_LOCAL);
    }

    // Token usado em toda requisição ao Supabase: o do usuário logado (assim
    // as políticas RLS conseguem checar auth.uid()), ou a chave anônima
    // pública para quem só está navegando/consultando sem estar logado.
    function tokenAtual() {
        return sessaoAtual?.access_token || SUPABASE_KEY;
    }

    async function authFetch(caminho, options = {}) {
        const resposta = await fetch(`${SUPABASE_AUTH_BASE}${caminho}`, {
            ...options,
            headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) }
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
        if (sessaoAtual?.access_token) {
            try {
                await fetch(`${SUPABASE_AUTH_BASE}/logout`, {
                    method: 'POST',
                    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${sessaoAtual.access_token}` }
                });
            } catch (erro) { console.warn('Falha ao encerrar sessão no servidor:', erro); }
        }
        salvarSessaoLocal(null);
    }

    async function buscarPerfilProprio(userId, tokenAcesso) {
        const resposta = await fetch(`${SUPABASE_URL}/${SUPABASE_TABLE_PERFIS}?select=*&id=eq.${userId}`, {
            headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${tokenAcesso}` }
        });
        if (!resposta.ok) throw new Error(`Supabase ${resposta.status}: ${await resposta.text()}`);
        const lista = await resposta.json();
        return Array.isArray(lista) && lista.length > 0 ? lista[0] : null;
    }

    async function criarPerfilProprio(userId, tokenAcesso, dados) {
        const resposta = await fetch(`${SUPABASE_URL}/${SUPABASE_TABLE_PERFIS}`, {
            method: 'POST',
            headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${tokenAcesso}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
            body: JSON.stringify({ id: userId, ...dados, isAdmin: false })
        });
        if (!resposta.ok) throw new Error(`Supabase ${resposta.status}: ${await resposta.text()}`);
        const lista = await resposta.json();
        return lista[0];
    }

    function isAdminAtual() {
        return !!(sessaoAtual?.perfil?.isAdmin === true);
    }

    function nomeExibicaoAtual() {
        const p = sessaoAtual?.perfil;
        if (p) return `${p.nome} ${p.sobrenome}`.trim();
        return sessaoAtual?.user?.email || 'Usuário desconhecido';
    }

    function renderizarCadastroUI() {
        const blocoLogado = document.getElementById('cadastro_status_logado');
        const blocoLogin = document.getElementById('cadastro_form_login');
        const blocoNovo = document.getElementById('cadastro_form_novo');
        const infoLogado = document.getElementById('cadastro_info_logado');
        if (!blocoLogado || !blocoLogin || !blocoNovo || !infoLogado) return;

        if (sessaoAtual?.perfil) {
            const p = sessaoAtual.perfil;
            blocoLogado.style.display = 'block';
            blocoLogin.style.display = 'none';
            blocoNovo.style.display = 'none';
            const badge = p.isAdmin
                ? '<span class="badge_admin sim">Administrador</span>'
                : '<span class="badge_admin nao">Somente Navegação</span>';
            infoLogado.innerHTML = `
                <div><strong>Nome:</strong> ${p.nome} ${p.sobrenome}</div>
                <div><strong>Matrícula:</strong> ${p.matricula}</div>
                <div><strong>Email:</strong> ${sessaoAtual.user?.email || ''}</div>
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

    document.getElementById('btn_entrar_cadastro')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn_entrar_cadastro');
        const email = document.getElementById('login_email').value.trim();
        const senha = document.getElementById('login_senha').value;
        if (!email || !senha) return alert('Informe email e senha para entrar.');
        if (!supabaseAtivo) return alert('Supabase não está configurado no momento.');

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
        if (senha.length < 6) return alert('A senha precisa ter pelo menos 6 caracteres.');
        if (senha !== senhaConfirma) return alert('As senhas não conferem.');
        if (!supabaseAtivo) return alert('Supabase não está configurado no momento.');

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

    // Roda no início do app: se havia sessão salva, renova o token se
    // preciso (ou limpa a sessão se o refresh_token não for mais válido).
    async function restaurarSessaoAoIniciar() {
        if (!sessaoAtual) return;
        if (sessaoAtual.expires_at && Date.now() < sessaoAtual.expires_at - 30000) return; // ainda válida

        if (!sessaoAtual.refresh_token) { salvarSessaoLocal(null); return; }
        try {
            const renovado = await renovarSessaoAuth(sessaoAtual.refresh_token);
            await iniciarSessaoAPartirDoToken(renovado);
        } catch (erro) {
            console.warn('Sessão expirada, é necessário entrar novamente.', erro);
            salvarSessaoLocal(null);
        }
    }

    // Mostra/esconde as abas do menu lateral conforme o login. Sem sessão
    // ativa, só a aba "Cadastro" (login/cadastro) fica visível; se a pessoa
    // deslogar estando em outra aba, ela é redirecionada pra lá.
    function aplicarVisibilidadeAbas() {
        const logado = !!sessaoAtual;

        navButtons.forEach(btn => {
            const targetId = btn.getAttribute('data-target');
            btn.style.display = (logado || ABAS_LIVRES_SEM_LOGIN.includes(targetId)) ? '' : 'none';
        });

        if (!logado) {
            const secaoAtiva = Array.from(pageSections).find(s => s.classList.contains('active_section'));
            if (secaoAtiva && !ABAS_LIVRES_SEM_LOGIN.includes(secaoAtiva.id)) {
                irParaAba('cadastro');
            }
        }
    }
    window.aplicarVisibilidadeAbas = aplicarVisibilidadeAbas;

    // Aplica as permissões de admin/navegação em toda a interface
    function aplicarPermissoes() {
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

        if (typeof renderizarTabela === 'function' && document.getElementById('tbody_banco')) renderizarTabela();
    }
    window.aplicarPermissoes = aplicarPermissoes;

    function carregarCacheLocal() {
        try {
            const baseLocal = JSON.parse(localStorage.getItem('dbReparosCoke')) || [];
            return baseLocal.map(r => r.id_reparo ? r : { ...r, id_reparo: Date.now().toString() + Math.floor(Math.random() * 100000).toString() });
        } catch (erro) {
            console.warn('Não foi possível ler o cache local:', erro);
            return [];
        }
    }

    function salvarCacheLocal() {
        localStorage.setItem('dbReparosCoke', JSON.stringify(dbReparos));
    }

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
            const respostaUser = await fetch(`${SUPABASE_AUTH_BASE}/user`, {
                headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${accessToken}` }
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

    async function inicializarApp() {
        const veioDeConfirmacaoEmail = await processarRedirectAuth();
        if (!veioDeConfirmacaoEmail) await restaurarSessaoAoIniciar();

        try {
            dbReparos = await listarReparosSupabase();
            salvarCacheLocal();
        } catch (erro) {
            console.error('Falha ao carregar o Supabase. Usando cache local:', erro);
            supabaseAtivo = false;
            dbReparos = carregarCacheLocal();
            if (SUPABASE_URL && SUPABASE_KEY) {
                alert('Não foi possível carregar os dados do Supabase. O app abriu com o cache local. Verifique o schema e as políticas RLS.');
            }
        }

        window.mapaStatusAtual = {};
        gerarMapaBaterias();
        processarDadosGlobais();
        renderizarCadastroUI();
        aplicarPermissoes();
    }
    
    inicializarApp();

    function gerarMapaBaterias() {
        const container = document.getElementById("baterias_container");
        if (!container) return;
        const baterias = ['A', 'B', 'C'];
        const blocosTop = [1, 2, 3, 4];
        const blocosBottom = [5, 6, 7, 8];

        baterias.forEach(bat => {
            const batDiv = document.createElement('div');
            batDiv.className = 'bateria_wrapper';
            batDiv.innerHTML = `<h3 class="bateria_titulo">Bateria ${bat}</h3>`;
            batDiv.appendChild(criarLinhaBlocos(bat, blocosTop, 'top'));
            
            const quenchLine = document.createElement('div');
            quenchLine.className = 'quenching_car';
            quenchLine.innerText = 'LINHA DO QUENCHING ◄ ►';
            
            batDiv.appendChild(quenchLine);
            batDiv.appendChild(criarLinhaBlocos(bat, blocosBottom, 'bottom'));
            container.appendChild(batDiv);
        });
    }

    function criarLinhaBlocos(bateria, blocos, posicao) {
        const row = document.createElement('div');
        row.className = 'linha_blocos';

        blocos.forEach(numBloco => {
            const blocoDiv = document.createElement('div');
            blocoDiv.className = 'bloco';
            blocoDiv.innerHTML = `<div class="bloco_titulo">Bloco ${numBloco}</div>`;

            let strColTop = posicao === 'top' ? `${bateria}${numBloco} - Coletor LM` : `${bateria}${numBloco} - Coletor LC`;
            let strColBot = posicao === 'top' ? `${bateria}${numBloco} - Coletor LC` : `${bateria}${numBloco} - Coletor LM`;

            const colTop = document.createElement('div'); colTop.className = 'coletor'; colTop.innerText = 'COLETOR'; colTop.dataset.id = strColTop;
            const colBot = document.createElement('div'); colBot.className = 'coletor'; colBot.innerText = 'COLETOR'; colBot.dataset.id = strColBot;
            
            colTop.onclick = () => abrirModalMapClick('Coletor', bateria, numBloco, 'N/A', strColTop.split(' ')[2]);
            colBot.onclick = () => abrirModalMapClick('Coletor', bateria, numBloco, 'N/A', strColBot.split(' ')[2]);

            const gridFornos = document.createElement('div');
            gridFornos.className = 'fornos_grid';

            for (let i = 1; i <= 18; i++) {
                const numForno = i.toString().padStart(2, '0');
                const fornoColuna = document.createElement('div');
                fornoColuna.className = 'forno_coluna';

                let strLM = `${numForno} - ${bateria}${numBloco} - LM`;
                let strLC = `${numForno} - ${bateria}${numBloco} - LC`;

                const numeroDiv = document.createElement('div');
                numeroDiv.className = 'forno_numero';
                numeroDiv.innerText = i;

                let domLM = criarLadoForno(strLM, bateria, numBloco, numForno, 'LM', posicao === 'top');
                let domLC = criarLadoForno(strLC, bateria, numBloco, numForno, 'LC', posicao !== 'top');

                if (posicao === 'top') {
                    fornoColuna.appendChild(domLM);
                    fornoColuna.appendChild(numeroDiv);
                    fornoColuna.appendChild(domLC);
                } else {
                    fornoColuna.appendChild(domLC);
                    fornoColuna.appendChild(numeroDiv);
                    fornoColuna.appendChild(domLM);
                }
                gridFornos.appendChild(fornoColuna);
            }

            blocoDiv.appendChild(colTop);
            blocoDiv.appendChild(gridFornos);
            blocoDiv.appendChild(colBot);
            row.appendChild(blocoDiv);
        });
        return row;
    }

    function criarLadoForno(idString, bat, bloco, forno, lado, isTopSide) {
        const ladoContainer = document.createElement('div');
        ladoContainer.className = 'lado_container';

        const fornoMain = document.createElement('div');
        fornoMain.className = 'forno_main';
        fornoMain.dataset.id = idString;
        fornoMain.onclick = () => abrirModalMapClick('Forno', bat, bloco, forno, lado);

        const rowSF = document.createElement('div');
        rowSF.className = 'sole_flues_row';
        for (let s = 1; s <= 4; s++) {
            const sfDiv = document.createElement('div');
            sfDiv.className = 'sole_flue'; sfDiv.innerText = s;
            sfDiv.dataset.id = `${idString} - SF${s}`;
            sfDiv.onclick = () => abrirModalMapClick(`Sole Flue ${s}`, bat, bloco, forno, lado);
            rowSF.appendChild(sfDiv);
        }

        if (isTopSide) { ladoContainer.appendChild(rowSF); ladoContainer.appendChild(fornoMain); } 
        else { ladoContainer.appendChild(fornoMain); ladoContainer.appendChild(rowSF); }
        return ladoContainer;
    }

    // =========================================================
    // --- 2. TOOLTIP E CARDS DE RESUMO ---
    // =========================================================
    const tooltip = document.getElementById('tooltip_mapa');
    
    function processarDadosGlobais() {
        window.mapaStatusAtual = {};
        let counts = { inspecao: 0, nao_reparado: 0, em_andamento: 0, concluido: 0 };
        
        document.querySelectorAll('.forno_main, .sole_flue, .coletor').forEach(el => {
            el.classList.remove('status_inspecao', 'status_nao_reparado', 'status_em_andamento', 'status_concluido');
        });

        dbReparos.forEach(reg => {
            if (reg.id_referencia.includes('Ambos')) {
                let idLC = reg.id_referencia.replace('Ambos', 'LC');
                let idLM = reg.id_referencia.replace('Ambos', 'LM');
                window.mapaStatusAtual[idLC] = reg;
                window.mapaStatusAtual[idLM] = reg;
            } else {
                window.mapaStatusAtual[reg.id_referencia] = reg;
            }
        });

        for (let id in window.mapaStatusAtual) {
            const reg = window.mapaStatusAtual[id];
            const elDOM = document.querySelector(`[data-id="${id}"]`);
            if (elDOM) {
                elDOM.classList.add(`status_${reg.andamento}`);
            }
            if(counts[reg.andamento] !== undefined) counts[reg.andamento]++;
        }

        document.getElementById('count_inspecao').innerText = counts.inspecao;
        document.getElementById('count_nao_reparado').innerText = counts.nao_reparado;
        document.getElementById('count_em_andamento').innerText = counts.em_andamento;
        document.getElementById('count_concluido').innerText = counts.concluido;
    }

    document.querySelectorAll('.forno_main, .sole_flue, .coletor').forEach(el => {
        el.addEventListener('mousemove', (e) => {
            const id = el.dataset.id;
            const reg = window.mapaStatusAtual[id];
            tooltip.style.left = e.pageX + 15 + 'px';
            tooltip.style.top = e.pageY + 15 + 'px';
            if(reg) {
                tooltip.innerHTML = `<strong>${id}</strong><br><div class="tooltip_status">Status: ${formatarStatus(reg.andamento)}<br>Problema: ${reg.desc_problema || 'N/A'}</div>`;
            } else {
                tooltip.innerHTML = `<strong>${id}</strong><br><div class="tooltip_status">Nenhum registro</div>`;
            }
            tooltip.style.opacity = 1;
        });
        el.addEventListener('mouseleave', () => tooltip.style.opacity = 0 );
    });

    const legendItems = document.querySelectorAll('.leg_item[data-filter]');
    let filtroAtivo = null;
    legendItems.forEach(item => {
        item.addEventListener('click', () => {
            const statusFiltro = item.getAttribute('data-filter');
            const todasPecas = document.querySelectorAll('.forno_main, .sole_flue, .coletor');
            if (filtroAtivo === statusFiltro) {
                filtroAtivo = null;
                todasPecas.forEach(el => { el.style.opacity = '1'; el.style.boxShadow = 'none'; });
                legendItems.forEach(leg => leg.style.opacity = '1');
            } else {
                filtroAtivo = statusFiltro;
                legendItems.forEach(leg => leg.style.opacity = leg.getAttribute('data-filter') === statusFiltro ? '1' : '0.4');
                todasPecas.forEach(el => {
                    if (el.classList.contains(`status_${statusFiltro}`)) {
                        el.style.opacity = '1'; el.style.boxShadow = 'inset 0 0 5px rgba(0,0,0,0.8)';
                    } else {
                        el.style.opacity = '0.1'; el.style.boxShadow = 'none';
                    }
                });
            }
        });
    });

    // =========================================================
    // --- 3. MOTOR DO GÊMEO DIGITAL 3D ---
    // =========================================================
    let scene3D, camera3D, renderer3D, controls3D;
    let fornos3DGroup; 
    const container3D = document.getElementById('container_3d');
    const corBaseHex = 0xa0a0a0; 

    function init3D() {
        if(scene3D) return; 
        scene3D = new THREE.Scene();
        fornos3DGroup = new THREE.Group();
        scene3D.add(fornos3DGroup);

        const width = container3D.clientWidth; const height = container3D.clientHeight;
        camera3D = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
        renderer3D = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer3D.setSize(width, height);
        container3D.appendChild(renderer3D.domElement);

        controls3D = new THREE.OrbitControls(camera3D, renderer3D.domElement);
        controls3D.enableDamping = true; controls3D.dampingFactor = 0.05;
        
        camera3D.position.set(0, 15, 55); 
        controls3D.target.set(0, 5, 0);

        scene3D.add(new THREE.AmbientLight(0xffffff, 0.7));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(15, 30, 20); scene3D.add(dirLight);

        function animate() { requestAnimationFrame(animate); controls3D.update(); renderer3D.render(scene3D, camera3D); }
        animate();
    }

    window.mudarCamera3D = function(visao) {
        if(!camera3D) return;
        if(visao === 'frontal') { camera3D.position.set(0, 15, 55); controls3D.target.set(0, 5, 0); }
        if(visao === 'topo') { camera3D.position.set(0, 55, 0.1); controls3D.target.set(0, 0, 0); }
        if(visao === 'lateral') { camera3D.position.set(45, 10, 0); controls3D.target.set(0, 5, 0); }
    };

    function criarGeometriaForno() {
        const shape = new THREE.Shape();
        shape.moveTo(5, 0);
        shape.lineTo(5, 5.2); shape.lineTo(4.8, 5.2); 
        shape.absellipse(0, 5.2, 4.8, 2.8, 0, Math.PI, false); 
        shape.lineTo(-5, 5.2); shape.lineTo(-5, 0); shape.lineTo(-4, 0); shape.lineTo(-4, 5.2); shape.lineTo(-3.9, 5.2); 
        shape.absellipse(0, 5.2, 3.9, 1.9, Math.PI, 0, true); 
        shape.lineTo(4, 5.2); shape.lineTo(4, 0); shape.lineTo(5, 0); 
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 24, bevelEnabled: false, curveSegments: 10 });
        geo.translate(0, 0, -12); return geo;
    }

    function criarGeometriaSoleFlue() {
        const shape = new THREE.Shape();
        shape.moveTo(1, 0); shape.lineTo(1, 2.9); shape.lineTo(-1, 2.9); shape.lineTo(-1, 0); shape.lineTo(2, 0);
        const hole = new THREE.Path();
        hole.moveTo(-0.7, 0.6); hole.lineTo(-0.7, 2.2); hole.lineTo(-0.55, 2.2); 
        hole.absellipse(0, 2.2, 0.55, 0.4, Math.PI, 0, true); 
        hole.lineTo(0.7, 2.2); hole.lineTo(0.7, 0.6); hole.lineTo(-0.7, 0.6); 
        shape.holes.push(hole); 
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 24, bevelEnabled: false, curveSegments: 32 });
        geo.translate(0, 0, -12); return geo;
    }

    const geoForno = criarGeometriaForno();
    const geoSoleFlue = criarGeometriaSoleFlue();
    const geoDuto = new THREE.CylinderGeometry(2.5, 2.5, 10, 32); 
    geoDuto.rotateZ(Math.PI / 2); 

    function criarSpriteTexto(texto) {
        const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128; const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = 'bold 50px Segoe UI, Arial'; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(texto, canvas.width / 2, canvas.height / 2);
        ctx.strokeStyle = '#E19900'; ctx.lineWidth = 15; ctx.strokeRect(0, 0, canvas.width, canvas.height);
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture }); const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(7, 1.75, 1); return sprite;
    }

    function instanciarConjuntoForno(numF, lado, bat, bloco, offsetX, offsetZ, isFront) {
        const strF = numF.toString().padStart(2, '0');
        const idBase = `${strF} - ${bat}${bloco} - ${lado}`;
        const matPadrao = new THREE.MeshStandardMaterial({ color: corBaseHex, roughness: 0.9, side: THREE.DoubleSide });

        const fornoMesh = new THREE.Mesh(geoForno, matPadrao.clone());
        fornoMesh.position.set(offsetX, 0, offsetZ); 
        fornoMesh.userData = { idRef: idBase }; 
        fornoMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geoForno), new THREE.LineBasicMaterial({ color: 0x222 })));
        fornos3DGroup.add(fornoMesh);

        for(let i=1; i<=4; i++) {
            const sfMesh = new THREE.Mesh(geoSoleFlue, matPadrao.clone());
            sfMesh.position.set(offsetX - 3 + ((i-1) * 2), 0, offsetZ); 
            sfMesh.userData = { idRef: `${idBase} - SF${i}` }; 
            sfMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geoSoleFlue), new THREE.LineBasicMaterial({ color: 0x222 })));
            fornos3DGroup.add(sfMesh);
        }

        const dutoMesh = new THREE.Mesh(geoDuto, matPadrao.clone());
        dutoMesh.position.set(offsetX, 11, offsetZ + (isFront ? 11.3 : -11.3)); 
        dutoMesh.userData = { idRef: `${bat}${bloco} - Coletor ${lado}` }; 
        fornos3DGroup.add(dutoMesh);

        const label = criarSpriteTexto(`F${strF} ${bat}${bloco} ${lado}`); 
        label.position.set(offsetX, 4.6, offsetZ + (isFront ? 12.1 : -12.1));
        fornos3DGroup.add(label);
    }

    function construirCluster3D(bat, bloco, fornoStr, ladoStr) {
        while(fornos3DGroup.children.length > 0){ fornos3DGroup.remove(fornos3DGroup.children[0]); }
        let fornoCentro = parseInt(fornoStr) || 1; 
        let ladoFrontal = (ladoStr === 'Ambos') ? 'LC' : ladoStr;
        let ladoTraseiro = (ladoFrontal === 'LC') ? 'LM' : 'LC';

        for (let i = -2; i <= 2; i++) {
            let fNum = fornoCentro + i;
            if (fNum >= 1 && fNum <= 18) {
                let offsetX = i * 10; 
                instanciarConjuntoForno(fNum, ladoFrontal, bat, bloco, offsetX, 12, true);
                instanciarConjuntoForno(fNum, ladoTraseiro, bat, bloco, offsetX, -12, false);
            }
        }
    }

    function atualizarCores3D() {
        const coresStatus = { 'inspecao': 0xFFD700, 'nao_reparado': 0xFF4C4C, 'em_andamento': 0x1E90FF, 'concluido': 0x32CD32 };

        fornos3DGroup.children.forEach(child => {
            if (child.type === "Mesh" && child.userData && child.userData.idRef) {
                const idOriginal = child.userData.idRef; 
                child.material.color.setHex(corBaseHex); 

                let idBuscaAmbos = idOriginal.replace('LC', 'Ambos').replace('LM', 'Ambos');

                const reparosPeca = dbReparos.filter(r => 
                    r.id_referencia === idOriginal || 
                    r.id_referencia === idBuscaAmbos
                );
                
                if (reparosPeca.length > 0) {
                    const ultimoReparo = reparosPeca[reparosPeca.length - 1];
                    const corHex = coresStatus[ultimoReparo.andamento] || corBaseHex;
                    child.material.color.setHex(corHex);
                }
            }
        });
    }

    // =========================================================
    // --- 4. LÓGICA DO MODAL (FORMULÁRIO E AÇÕES) ---
    // =========================================================
    const modal = document.getElementById("modal_reparo");
    const tituloFornoModal = document.getElementById("forno_alvo");
    const listaHistorico = document.getElementById("lista_historico");
    const selectElements = document.querySelectorAll('.select_alvo');

    const selTipoPrincipal = document.getElementById('sel_tipo');
    const selLadoPrincipal = document.getElementById('sel_lado');

    // Define o valor de um <select> tentando primeiro a correspondência
    // exata e, se não achar, ignorando maiúsculas/minúsculas — protege
    // contra registros antigos que foram salvos em CAIXA ALTA e não batem
    // mais com o texto exato das opções (ex: "SOLE FLUE 1" x "Sole Flue 1").
    function definirValorSelect(selectEl, valor) {
        if (!selectEl || valor === undefined || valor === null) return;
        const opcaoExata = Array.from(selectEl.options).find(o => o.value === valor);
        if (opcaoExata) { selectEl.value = opcaoExata.value; return; }
        const opcaoIgnorandoCase = Array.from(selectEl.options).find(o => o.value.toLowerCase() === String(valor).toLowerCase());
        selectEl.value = opcaoIgnorandoCase ? opcaoIgnorandoCase.value : valor;
    }
    
    selTipoPrincipal.addEventListener('change', () => {
        const optionAmbos = Array.from(selLadoPrincipal.options).find(opt => opt.value === 'Ambos');
        if (selTipoPrincipal.value.startsWith('Sole Flue')) {
            if (optionAmbos) optionAmbos.disabled = true;
            if (selLadoPrincipal.value === 'Ambos') selLadoPrincipal.value = 'LC'; 
        } else {
            if (optionAmbos) optionAmbos.disabled = false; 
        }
        atualizarAlvoVisual();
    });

    selectElements.forEach(select => select.addEventListener('change', atualizarAlvoVisual));

    function atualizarAlvoVisual() {
        const bat = document.getElementById('sel_bat').value;
        const bloco = document.getElementById('sel_bloco').value;
        let forno = document.getElementById('sel_forno').value;
        const lado = document.getElementById('sel_lado').value;
        const tipo = document.getElementById('sel_tipo').value;

        if(tipo === 'Coletor') { document.getElementById('sel_forno').value = 'N/A'; forno = 'N/A'; } 
        else if (forno === 'N/A') { document.getElementById('sel_forno').value = '01'; forno = '01'; }

        let idGerado = "";
        if (tipo === 'Coletor') idGerado = `${bat}${bloco} - Coletor ${lado}`;
        else if (tipo.startsWith('Sole Flue')) idGerado = `${forno} - ${bat}${bloco} - ${lado} - SF${tipo.split(' ')[2]}`;
        else idGerado = `${forno} - ${bat}${bloco} - ${lado}`;

        tituloFornoModal.innerText = idGerado;
        carregarHistorico(idGerado);
        construirCluster3D(bat, bloco, forno, lado);
        atualizarCores3D();
        if (typeof aplicarPermissoes === 'function') aplicarPermissoes();
        if (typeof renderizarGraficoTemperaturaModal === 'function') renderizarGraficoTemperaturaModal();
    }

    function abrirModalMapClick(tipoItem, bat, bloco, forno, lado) {
        document.getElementById('sel_bat').value = bat; document.getElementById('sel_bloco').value = bloco;
        document.getElementById('sel_forno').value = forno; 
        
        if (lado === 'Ambos' && tipoItem.startsWith('Sole Flue')) {
            document.getElementById('sel_lado').value = 'LC';
        } else {
            document.getElementById('sel_lado').value = lado;
        }

        document.getElementById('sel_tipo').value = tipoItem.startsWith('Sole Flue') ? tipoItem : tipoItem;
        selTipoPrincipal.dispatchEvent(new Event('change'));

        limparFormulario(); modal.classList.add("active");
        setTimeout(() => { init3D(); atualizarAlvoVisual(); }, 100); 
    }

    document.getElementById("btn_abrir_manual").addEventListener('click', () => {
        if (!isAdminAtual()) { alert('Apenas usuários administradores podem lançar novos reparos.'); return; }
        document.getElementById('sel_bat').value = 'A'; document.getElementById('sel_bloco').value = '1';
        document.getElementById('sel_forno').value = '01'; document.getElementById('sel_lado').value = 'LC'; document.getElementById('sel_tipo').value = 'Forno';
        
        selTipoPrincipal.dispatchEvent(new Event('change'));

        limparFormulario(); modal.classList.add("active");
        setTimeout(() => { init3D(); atualizarAlvoVisual(); }, 100);
    });

    function limparFormulario() {
        document.getElementById("id_reparo_edit").value = ''; document.getElementById("desc_problema").value = ''; document.getElementById("desc_solucao").value = '';
        document.getElementById("status_reparo").value = 'inspecao'; document.getElementById("aval_ct").value = ''; document.getElementById("prazo_reparo").value = '';
        document.getElementById("data_fim").value = ''; document.getElementById("obs_reparo").value = '';
        document.getElementById("btn_salvar").innerText = "Adicionar Registro"; document.getElementById("btn_cancelar_edicao").style.display = "none";
        
        // Limpar fotos ao fechar ou salvar
        document.getElementById("foto_antes").value = '';
        document.getElementById("foto_depois").value = '';
        document.getElementById("preview_fotos").style.display = 'none';
        document.getElementById("img_preview_antes").style.display = 'none';
        document.getElementById("img_preview_depois").style.display = 'none';
        document.getElementById("img_preview_antes").src = '';
        document.getElementById("img_preview_depois").src = '';
        document.getElementById("foto_antes_texto").innerText = 'Escolher foto...';
        document.getElementById("foto_depois_texto").innerText = 'Escolher foto...';
        document.querySelectorAll('#modal_reparo .file_upload_label').forEach(lbl => lbl.classList.remove('has_file'));
    }

    window.editarRegistro = function(idReparo) {
        if (!isAdminAtual()) { alert('Apenas usuários administradores podem editar reparos.'); return; }
        const reg = dbReparos.find(r => r.id_reparo == idReparo);
        if (reg) {
            document.getElementById('sel_bat').value = reg.bateria; document.getElementById('sel_bloco').value = reg.bloco;
            document.getElementById('sel_forno').value = reg.forno;
            definirValorSelect(document.getElementById('sel_lado'), reg.lado);
            definirValorSelect(document.getElementById('sel_tipo'), reg.reparo_no);
            
            selTipoPrincipal.dispatchEvent(new Event('change'));
            atualizarAlvoVisual(); 
            
            document.getElementById("id_reparo_edit").value = reg.id_reparo; 
            document.getElementById("desc_problema").value = reg.desc_problema || '';
            document.getElementById("desc_solucao").value = reg.desc_solucao || ''; 
            document.getElementById("status_reparo").value = reg.andamento || 'inspecao';
            document.getElementById("aval_ct").value = reg.avaliacao_ct || ''; 
            document.getElementById("prazo_reparo").value = reg.prazo || '';
            document.getElementById("data_fim").value = reg.data_fim || ''; 
            document.getElementById("obs_reparo").value = reg.observacao || '';
            document.getElementById("btn_salvar").innerText = "Atualizar Registro"; document.getElementById("btn_cancelar_edicao").style.display = "block";
            
            // Exibir as imagens caso existam
            if (reg.foto_antes || reg.foto_depois) {
                document.getElementById("preview_fotos").style.display = 'flex';
                if (reg.foto_antes) {
                    document.getElementById("img_preview_antes").src = reg.foto_antes;
                    document.getElementById("img_preview_antes").style.display = 'block';
                    document.getElementById("foto_antes_texto").innerText = 'Foto atual (clique para trocar)';
                    document.querySelector('label[for="foto_antes"]')?.classList.add('has_file');
                }
                if (reg.foto_depois) {
                    document.getElementById("img_preview_depois").src = reg.foto_depois;
                    document.getElementById("img_preview_depois").style.display = 'block';
                    document.getElementById("foto_depois_texto").innerText = 'Foto atual (clique para trocar)';
                    document.querySelector('label[for="foto_depois"]')?.classList.add('has_file');
                }
            }
        }
    };

    function configurarInputFoto(inputId, textoId, previewId) {
        const input = document.getElementById(inputId);
        const texto = document.getElementById(textoId);
        const label = input?.closest('.half_width')?.querySelector('.file_upload_label');
        input?.addEventListener('change', () => {
            const file = input.files[0];
            if (!file) return;
            texto.innerText = file.name;
            label?.classList.add('has_file');
            const reader = new FileReader();
            reader.onload = (e) => {
                document.getElementById("preview_fotos").style.display = 'flex';
                const img = document.getElementById(previewId);
                img.src = e.target.result;
                img.style.display = 'block';
            };
            reader.readAsDataURL(file);
        });
    }
    configurarInputFoto('foto_antes', 'foto_antes_texto', 'img_preview_antes');
    configurarInputFoto('foto_depois', 'foto_depois_texto', 'img_preview_depois');

    document.getElementById("btn_cancelar_edicao").addEventListener("click", () => limparFormulario());
    document.getElementById("fechar_modal").addEventListener("click", () => modal.classList.remove("active"));
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("active"); });

    document.getElementById("btn_salvar").addEventListener("click", async () => {
        if (!isAdminAtual()) { alert('Apenas usuários administradores podem lançar ou editar reparos.'); return; }
        const botaoSalvar = document.getElementById("btn_salvar");
        const idEdit = document.getElementById("id_reparo_edit").value;
        
        botaoSalvar.disabled = true;
        botaoSalvar.innerText = 'Salvando e enviando fotos...';

        try {
            let urlAntes = document.getElementById("img_preview_antes").src || null;
            let urlDepois = document.getElementById("img_preview_depois").src || null;
            
            const inputAntes = document.getElementById("foto_antes").files[0];
            const inputDepois = document.getElementById("foto_depois").files[0];

            if (inputAntes) urlAntes = await uploadFotoSupabase(inputAntes, 'antes');
            if (inputDepois) urlDepois = await uploadFotoSupabase(inputDepois, 'depois');

            const dadosForm = {
                bateria: document.getElementById('sel_bat').value.toUpperCase(), 
                bloco: document.getElementById('sel_bloco').value.toUpperCase(),
                forno: document.getElementById('sel_forno').value.toUpperCase(), 
                lado: document.getElementById('sel_lado').value, 
                reparo_no: document.getElementById('sel_tipo').value,
                id_referencia: document.getElementById("forno_alvo").innerText, 
                desc_problema: document.getElementById("desc_problema").value.toUpperCase(),
                desc_solucao: document.getElementById("desc_solucao").value.toUpperCase(), 
                andamento: document.getElementById("status_reparo").value,
                prazo: document.getElementById("prazo_reparo").value || null, 
                data_fim: document.getElementById("data_fim").value || null,
                avaliacao_ct: document.getElementById("aval_ct").value.toUpperCase(), 
                observacao: document.getElementById("obs_reparo").value.toUpperCase(),
                foto_antes: urlAntes !== window.location.href ? urlAntes : null,
                foto_depois: urlDepois !== window.location.href ? urlDepois : null,
            };

            if (supabaseAtivo) {
                if (idEdit) {
                    const atualizado = await atualizarReparoSupabase(idEdit, dadosForm);
                    const index = dbReparos.findIndex(r => r.id_reparo == idEdit);
                    if (index !== -1) dbReparos[index] = atualizado || { ...dbReparos[index], ...dadosForm };
                } else {
                    const novoRegistro = {
                        id_reparo: Date.now().toString(), 
                        data_registro: new Date().toLocaleDateString('pt-BR'),
                        criado_por: nomeExibicaoAtual(),
                        ...dadosForm
                    };
                    const salvo = await criarReparoSupabase(novoRegistro);
                    dbReparos.push(salvo || novoRegistro);
                }
            } else {
                if (idEdit) {
                    const index = dbReparos.findIndex(r => r.id_reparo == idEdit);
                    if (index !== -1) dbReparos[index] = { ...dbReparos[index], ...dadosForm };
                } else {
                    dbReparos.push({ id_reparo: Date.now().toString(), data_registro: new Date().toLocaleDateString('pt-BR'), criado_por: nomeExibicaoAtual(), ...dadosForm });
                }
            }

            salvarCacheLocal();
            limparFormulario();

            try {
                processarDadosGlobais();
                atualizarAlvoVisual();
                renderizarTabela();
            } catch (erroInterface) {
                // O registro JÁ foi salvo no banco nesse ponto — um erro aqui
                // é só de atualização visual, não deve parecer que o salvamento falhou.
                console.error('Registro salvo, mas houve um erro ao atualizar a tela:', erroInterface);
            }
        } catch (erro) {
            console.error('Erro ao salvar reparo:', erro);
            alert(`Não foi possível salvar no Supabase.\n${erro.message}`);
            // Deu erro: o registro NÃO foi salvo, então mantém o modo em que
            // o usuário estava (edição ou novo registro) pra ele poder tentar de novo.
            botaoSalvar.innerText = idEdit ? 'Atualizar Registro' : 'Adicionar Registro';
        } finally {
            botaoSalvar.disabled = false;
        }
    });

    window.deletarRegistro = async function(idReparo) {
        if (!isAdminAtual()) { alert('Apenas usuários administradores podem excluir reparos.'); return; }
        if (!confirm("Deseja excluir este registro?")) return;

        try {
            if (supabaseAtivo) await excluirReparoSupabase(idReparo);
            dbReparos = dbReparos.filter(r => r.id_reparo != idReparo);
            salvarCacheLocal();
            processarDadosGlobais();
            // Só atualiza a vista 3D/histórico do modal de reparo se ele
            // estiver realmente aberto (a cena 3D só existe depois que
            // init3D() roda pelo menos uma vez); excluir direto pela
            // tabela não abre esse modal.
            if (modal.classList.contains('active') && typeof scene3D !== 'undefined' && scene3D) {
                atualizarAlvoVisual();
            }
            renderizarTabela();
        } catch (erro) {
            console.error('Erro ao excluir reparo:', erro);
            alert(`Não foi possível excluir no Supabase.\n${erro.message}`);
        }
    };

    function obterRegistrosDoAlvo(idBuscado) {
        const isAmbos = idBuscado.includes('Ambos');
        const isLC = idBuscado.includes('- LC');
        const isLM = idBuscado.includes('- LM');

        return dbReparos.filter(item => {
            if (item.id_referencia === idBuscado) return true;
            if (!isAmbos && isLC && item.id_referencia === idBuscado.replace('- LC', '- Ambos')) return true;
            if (!isAmbos && isLM && item.id_referencia === idBuscado.replace('- LM', '- Ambos')) return true;
            return false;
        });
    }

    function carregarHistorico(idBuscado) {
        listaHistorico.innerHTML = '';
        const filtrados = obterRegistrosDoAlvo(idBuscado);
        
        if (filtrados.length === 0) { listaHistorico.innerHTML = '<p style="color:#888;">Nenhum reparo.</p>'; return; }

        filtrados.slice().reverse().forEach(reg => {
            let dataAtraso = new Date().toISOString().split('T')[0];
            let badge = (!reg.prazo) ? `<span class="badge_prazo prazo_neutro">Sem Prazo</span>` : 
                (reg.andamento === 'concluido' ? (reg.data_fim > reg.prazo ? `<span class="badge_prazo prazo_atrasado">Atraso</span>` : `<span class="badge_prazo prazo_ok">No Prazo</span>`) : 
                (dataAtraso > reg.prazo ? `<span class="badge_prazo prazo_atrasado">Atrasado</span>` : `<span class="badge_prazo prazo_ok">No Prazo</span>`));
            
            const acoesHist = isAdminAtual()
                ? `<button class="btn_editar_hist" onclick="editarRegistro('${reg.id_reparo}')">✏️</button><button class="btn_deletar_hist" onclick="deletarRegistro('${reg.id_reparo}')">🗑️</button><button class="btn_imprimir_hist" onclick="imprimirRegistroUnico('${reg.id_reparo}')" title="Imprimir este registro">🖨️</button>`
                : `<button class="btn_imprimir_hist" onclick="imprimirRegistroUnico('${reg.id_reparo}')" title="Imprimir este registro">🖨️</button>`;

            let fotosHtml = '';
            if (reg.foto_antes || reg.foto_depois) {
                fotosHtml = `<div class="hist_fotos">
                    ${reg.foto_antes ? `
                    <div class="hist_foto_item">
                        <img src="${reg.foto_antes}" class="hist_foto_thumb" data-full="${reg.foto_antes}" alt="Foto antes do reparo">
                        <span class="hist_foto_label">Antes</span>
                    </div>` : ''}
                    ${reg.foto_depois ? `
                    <div class="hist_foto_item">
                        <img src="${reg.foto_depois}" class="hist_foto_thumb" data-full="${reg.foto_depois}" alt="Foto depois do reparo">
                        <span class="hist_foto_label">Depois</span>
                    </div>` : ''}
                </div>`;
            }

            const card = document.createElement('div'); card.className = `hist_card ${reg.andamento}`;
            card.innerHTML = `
                <div class="hist_card_header"><div class="hist_data">${reg.data_registro} <br> ${badge}</div>
                <div>${acoesHist}</div></div>
                <strong>Alvo:</strong> ${reg.id_referencia}<br><strong>Status:</strong> ${formatarStatus(reg.andamento)}<br>
                <strong>Problema:</strong> ${reg.desc_problema || '-'}<br> <strong>Observação:</strong> ${reg.observacao || '-'} <br><strong>Prazo:</strong> ${formatarDataBR(reg.prazo)}<br>
                <strong>Registrado por:</strong> ${reg.criado_por || '-'}
                ${fotosHtml}
            `;
            listaHistorico.appendChild(card);
        });
    }

    // --- LIGHTBOX DE FOTOS (clique na miniatura para expandir) ---
    const lightboxFoto = document.getElementById('lightbox_foto');
    const lightboxImg = document.getElementById('lightbox_img');

    listaHistorico.addEventListener('click', (e) => {
        const thumb = e.target.closest('.hist_foto_thumb');
        if (!thumb || !lightboxFoto || !lightboxImg) return;
        lightboxImg.src = thumb.dataset.full;
        lightboxFoto.classList.add('active');
    });

    function fecharLightbox() { if (lightboxFoto) { lightboxFoto.classList.remove('active'); lightboxImg.src = ''; } }
    document.getElementById('lightbox_fechar')?.addEventListener('click', fecharLightbox);
    lightboxFoto?.addEventListener('click', (e) => { if (e.target === lightboxFoto) fecharLightbox(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharLightbox(); });

    function formatarStatus(s) { const m = { 'inspecao': 'Inspeção', 'nao_reparado': 'Não Reparado', 'em_andamento': 'Andamento', 'concluido': 'Concluído' }; return m[s] || s; }
    function formatarDataBR(d) { if(!d) return '-'; const p = d.split('-'); return `${p[2]}/${p[1]}/${p[0]}`; }

    // =========================================================
    // --- IMPRESSÃO (prontuário do forno / registro único / tabela geral) ---
    // =========================================================
    const CSS_IMPRESSAO = `
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 0; padding: 24px 32px; }
        .cabecalho_impresso { border-bottom: 3px solid #e13300; padding-bottom: 12px; margin-bottom: 20px; }
        .cabecalho_impresso h1 { margin: 0 0 4px; font-size: 1.3rem; color: #e13300; }
        .cabecalho_impresso h2 { margin: 0 0 4px; font-size: 1.05rem; }
        .cabecalho_impresso p { margin: 0; font-size: 0.8rem; color: #555; }
        .reg_impresso { break-inside: avoid; page-break-inside: avoid; margin-bottom: 18px; }
        .reg_impresso_cabecalho { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .reg_impresso_cabecalho span:first-child { font-weight: bold; }
        .status_impresso { padding: 2px 10px; border-radius: 10px; font-size: 0.75rem; font-weight: bold; color: white; }
        .status_impresso.inspecao { background: #e1a100; }
        .status_impresso.nao_reparado { background: #d32f2f; }
        .status_impresso.em_andamento { background: #1565c0; }
        .status_impresso.concluido { background: #2e7d32; }
        table.tabela_impressa { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-bottom: 8px; }
        table.tabela_impressa td { padding: 4px 6px; border: 1px solid #ddd; vertical-align: top; }
        table.tabela_impressa td:first-child { width: 150px; background: #f7f7f7; }
        .fotos_impressas { display: flex; gap: 14px; margin-top: 6px; }
        .fotos_impressas div { text-align: center; }
        .fotos_impressas span { display: block; font-size: 0.72rem; font-weight: bold; text-transform: uppercase; color: #555; margin-bottom: 3px; }
        .fotos_impressas img { width: 220px; max-width: 100%; border: 1px solid #ccc; border-radius: 4px; }
        .separador_impresso { border: none; border-top: 1px dashed #ccc; margin: 16px 0; }
        table.tabela_geral_impressa { width: 100%; border-collapse: collapse; font-size: 0.72rem; }
        table.tabela_geral_impressa th, table.tabela_geral_impressa td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
        table.tabela_geral_impressa th { background: #f0f0f0; }
        @media print {
            @page { margin: 14mm; }
            .fotos_impressas img { width: 180px; }
        }
    `;

    function gerarHtmlProntuario(idReferencia, registros) {
        const dataGeracao = new Date().toLocaleString('pt-BR');
        const linhas = registros.map(reg => `
            <div class="reg_impresso">
                <div class="reg_impresso_cabecalho">
                    <span>${reg.data_registro}</span>
                    <span class="status_impresso ${reg.andamento}">${formatarStatus(reg.andamento)}</span>
                </div>
                <table class="tabela_impressa">
                    <tr><td>Alvo</td><td>${reg.id_referencia}</td></tr>
                    <tr><td>Problema</td><td>${reg.desc_problema || '-'}</td></tr>
                    <tr><td>Solução</td><td>${reg.desc_solucao || '-'}</td></tr>
                    <tr><td>Avaliação CT</td><td>${reg.avaliacao_ct || '-'}</td></tr>
                    <tr><td>Observação</td><td>${reg.observacao || '-'}</td></tr>
                    <tr><td>Prazo</td><td>${formatarDataBR(reg.prazo)}</td></tr>
                    <tr><td>Data Fim</td><td>${formatarDataBR(reg.data_fim)}</td></tr>
                    <tr><td>Registrado por</td><td>${reg.criado_por || '-'}</td></tr>
                </table>
                ${(reg.foto_antes || reg.foto_depois) ? `
                <div class="fotos_impressas">
                    ${reg.foto_antes ? `<div><span>Antes</span><img src="${reg.foto_antes}"></div>` : ''}
                    ${reg.foto_depois ? `<div><span>Depois</span><img src="${reg.foto_depois}"></div>` : ''}
                </div>` : ''}
            </div>
        `).join('<hr class="separador_impresso">');

        return `<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8">
            <title>Prontuário ${idReferencia}</title><style>${CSS_IMPRESSAO}</style></head><body>
            <header class="cabecalho_impresso">
                <h1>Central de Dados Controle Térmico</h1>
                <h2>Prontuário de Reparos — ${idReferencia}</h2>
                <p>Gerado em ${dataGeracao} • ${registros.length} registro(s)</p>
            </header>
            ${linhas || '<p>Nenhum registro encontrado para este alvo.</p>'}
        </body></html>`;
    }

    function gerarHtmlTabelaGeral(registros) {
        const dataGeracao = new Date().toLocaleString('pt-BR');
        const linhas = registros.map(reg => `
            <tr>
                <td>${reg.data_registro}</td>
                <td>${reg.id_referencia}</td>
                <td>${formatarStatus(reg.andamento)}</td>
                <td>${reg.bateria}</td><td>${reg.bloco}</td><td>${reg.forno}</td><td>${reg.lado}</td>
                <td>${reg.desc_problema || '-'}</td>
                <td>${reg.observacao || '-'}</td>
                <td>${formatarDataBR(reg.prazo)}</td>
                <td>${formatarDataBR(reg.data_fim)}</td>
                <td>${reg.criado_por || '-'}</td>
            </tr>
        `).join('');

        return `<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8">
            <title>Histórico Geral de Reparos</title><style>${CSS_IMPRESSAO}</style></head><body>
            <header class="cabecalho_impresso">
                <h1>Central de Dados Controle Térmico</h1>
                <h2>Histórico Geral de Reparos</h2>
                <p>Gerado em ${dataGeracao} • ${registros.length} registro(s)</p>
            </header>
            <table class="tabela_geral_impressa">
                <thead><tr>
                    <th>Data</th><th>ID Alvo</th><th>Status</th><th>Bat.</th><th>Bloco</th><th>Forno</th><th>Lado</th>
                    <th>Problema</th><th>Observação</th><th>Prazo</th><th>Fim</th><th>Registrado por</th>
                </tr></thead>
                <tbody>${linhas || '<tr><td colspan="12">Nenhum registro encontrado.</td></tr>'}</tbody>
            </table>
        </body></html>`;
    }

    function imprimirHtml(html) {
        const janela = window.open('', '_blank', 'width=900,height=700');
        if (!janela) { alert('Não foi possível abrir a janela de impressão. Verifique se o navegador bloqueou o pop-up.'); return; }
        janela.document.open();
        janela.document.write(html);
        janela.document.close();
        const dispararImpressao = () => { try { janela.focus(); janela.print(); } catch (e) { /* ignora */ } };
        janela.onload = dispararImpressao;
        setTimeout(dispararImpressao, 400); // reforço para navegadores que não disparam onload aqui
    }

    document.getElementById('btn_imprimir_prontuario')?.addEventListener('click', () => {
        const idAtual = tituloFornoModal.innerText;
        const registros = obterRegistrosDoAlvo(idAtual).slice().reverse();
        imprimirHtml(gerarHtmlProntuario(idAtual, registros));
    });

    window.imprimirRegistroUnico = function(idReparo) {
        const reg = dbReparos.find(r => r.id_reparo == idReparo);
        if (!reg) return;
        imprimirHtml(gerarHtmlProntuario(reg.id_referencia, [reg]));
    };

    document.getElementById('btn_imprimir_tabela')?.addEventListener('click', () => {
        imprimirHtml(gerarHtmlTabelaGeral(obterRegistrosFiltradosTabela()));
    });

    // =========================================================
    // --- 5. TABELA DE DADOS & FILTROS ---
    // =========================================================
    const modalTabela = document.getElementById('modal_tabela');
    const tbodyBanco = document.getElementById('tbody_banco');
    const fBatTab = document.getElementById('filtro_tab_bat');
    const fStatTab = document.getElementById('filtro_tab_status');

    document.getElementById('btn_abrir_tabela').addEventListener('click', () => { renderizarTabela(); modalTabela.classList.add('active'); });
    document.getElementById('fechar_modal_tabela').addEventListener('click', () => modalTabela.classList.remove('active'));
    
    document.getElementById('btn_novo_tabela').addEventListener('click', () => {
        modalTabela.classList.remove('active');
        document.getElementById('btn_abrir_manual').click(); 
    });

    fBatTab.addEventListener('change', renderizarTabela);
    fStatTab.addEventListener('change', renderizarTabela);

    function obterRegistrosFiltradosTabela() {
        let filtrados = dbReparos.slice().reverse();
        if (fBatTab.value !== 'Todas') filtrados = filtrados.filter(r => r.bateria === fBatTab.value);
        if (fStatTab.value !== 'Todos') filtrados = filtrados.filter(r => r.andamento === fStatTab.value);
        return filtrados;
    }

    function renderizarTabela() {
        tbodyBanco.innerHTML = ''; 
        const filtrados = obterRegistrosFiltradosTabela();

        filtrados.forEach(reg => {
            const tr = document.createElement('tr');
           
            let situacaoPrazo = "Sem Prazo";
            if (reg.prazo) {
                const dataHoje = new Date().toISOString().split('T')[0]; 
                if (reg.andamento === 'concluido') {
                    situacaoPrazo = (reg.data_fim && reg.data_fim > reg.prazo) ? "Concluído Atrasado" : "Concluído no Prazo";
                } else {
                    situacaoPrazo = (dataHoje > reg.prazo) ? "Atrasado" : "No Prazo";
                }
            }

            tr.innerHTML = `
                <td><strong>${reg.data_registro}</strong></td>
                <td style="color: rgb(225, 51, 0); font-weight: bold;">${reg.id_referencia}</td>
                <td>${formatarStatus(reg.andamento)}</td>
                <td>${reg.bateria}</td>
                <td>${reg.bloco}</td>
                <td>${reg.forno}</td>
                <td>${reg.lado}</td>
                <td>${reg.desc_problema || '-'}</td>
                <td>${reg.observacao || '-'}</td>
                <td>${formatarDataBR(reg.prazo)}</td>
                <td>${formatarDataBR(reg.data_fim)}</td>
                <td>${situacaoPrazo}</td>
                <td>${reg.criado_por || '-'}</td>
                <td>
                    ${isAdminAtual() ? `
                    <button onclick="abrirEdicaoPelaTabela('${reg.id_reparo}')" title="Editar">✏️</button>
                    <button onclick="deletarRegistro('${reg.id_reparo}')" title="Excluir">🗑️</button>
                    ` : '<span style="color:#aaa;">🔒</span>'}
                </td>
            `;
            tbodyBanco.appendChild(tr);
        });
    }

    window.abrirEdicaoPelaTabela = function(idReparo) {
        if (!isAdminAtual()) { alert('Apenas usuários administradores podem editar reparos.'); return; }
        modalTabela.classList.remove('active'); 
        const reg = dbReparos.find(r => r.id_reparo == idReparo);
        if(reg) {
            document.getElementById('sel_bat').value = reg.bateria; document.getElementById('sel_bloco').value = reg.bloco;
            document.getElementById('sel_forno').value = reg.forno;
            definirValorSelect(document.getElementById('sel_lado'), reg.lado);
            definirValorSelect(document.getElementById('sel_tipo'), reg.reparo_no);
            
            selTipoPrincipal.dispatchEvent(new Event('change'));

            // Abre o modal ANTES de inicializar o 3D/carregar o registro: init3D()
            // precisa do container já visível, e atualizarAlvoVisual() (chamado
            // dentro de editarRegistro) depende da cena 3D já existir. Fazer isso
            // fora de ordem lançava um erro e o modal nunca chegava a abrir.
            document.getElementById("modal_reparo").classList.add("active");
            setTimeout(() => {
                init3D();
                editarRegistro(idReparo);
            }, 100);
        }
    };

    // =========================================================
    // --- GRÁFICO DE TEMPERATURAS (CSV importado, só na sessão) ---
    // =========================================================
    // Guardado só em memória (variável JS) — nunca vai pro Supabase, e some
    // se a página for recarregada (é preciso importar de novo).
    let dadosTemperaturaCSV = [];
    let chartTemperaturaGeral = null;
    let chartTemperaturaModal = null;
    let chartTemperaturaExpandido = null;
    let periodoTempInicio = null; // epoch ms
    let periodoTempFim = null;    // epoch ms

    function paraInputData(ms) {
        const d = new Date(ms);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    // Assim que um CSV é importado, mostra por padrão os últimos 9 dias
    // (contados a partir da data mais recente do arquivo inteiro).
    function definirPeriodoPadrao() {
        if (dadosTemperaturaCSV.length === 0) return;
        const maxData = dadosTemperaturaCSV.reduce((max, r) => r.data > max ? r.data : max, dadosTemperaturaCSV[0].data);
        const NOVE_DIAS_MS = 9 * 24 * 60 * 60 * 1000;
        periodoTempFim = maxData;
        periodoTempInicio = maxData - NOVE_DIAS_MS;
        sincronizarInputsPeriodo();
    }

    // Mantém os 3 pares de campo De/Até (aba, modal, expandido) todos iguais
    function sincronizarInputsPeriodo() {
        if (periodoTempInicio === null || periodoTempFim === null) return;
        const valorIni = paraInputData(periodoTempInicio);
        const valorFim = paraInputData(periodoTempFim);
        ['temp_periodo_inicio', 'temp_periodo_inicio_modal', 'temp_periodo_inicio_expandido'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = valorIni;
        });
        ['temp_periodo_fim', 'temp_periodo_fim_modal', 'temp_periodo_fim_expandido'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = valorFim;
        });
    }

    function aoMudarPeriodo(idIni, idFim) {
        const ini = document.getElementById(idIni)?.value;
        const fim = document.getElementById(idFim)?.value;
        if (ini) periodoTempInicio = new Date(`${ini}T00:00:00`).getTime();
        if (fim) periodoTempFim = new Date(`${fim}T23:59:59`).getTime();
        sincronizarInputsPeriodo();
        renderizarGraficoTemperaturaTab();
        if (modal.classList.contains('active')) renderizarGraficoTemperaturaModal();
        if (document.getElementById('grafico_expandido_overlay')?.classList.contains('active')) renderizarGraficoExpandido();
    }

    [['temp_periodo_inicio', 'temp_periodo_fim'], ['temp_periodo_inicio_modal', 'temp_periodo_fim_modal'], ['temp_periodo_inicio_expandido', 'temp_periodo_fim_expandido']]
        .forEach(([idIni, idFim]) => {
            document.getElementById(idIni)?.addEventListener('change', () => aoMudarPeriodo(idIni, idFim));
            document.getElementById(idFim)?.addEventListener('change', () => aoMudarPeriodo(idIni, idFim));
        });

    function parseNumeroBr(valor) {
        if (valor === undefined || valor === null) return null;
        const limpo = String(valor).trim().replace(',', '.');
        if (limpo === '') return null;
        const num = parseFloat(limpo);
        return isNaN(num) ? null : num; // valores como "Bad" viram null
    }

    function parseDataBrHora(str) {
        // Formato esperado: "DD/MM/AAAA HH:mm"
        const m = String(str).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
        if (!m) return null;
        const [, dd, mm, yyyy, hh, min] = m;
        const data = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
        return isNaN(data.getTime()) ? null : data.getTime();
    }

    function formatarDataHoraCurta(ms) {
        const d = new Date(ms);
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${dd}/${mm} ${hh}:${min}`;
    }

    // Lê o CSV exportado do histórico de temperaturas (separado por ";",
    // números em vírgula). Aceita as colunas nesta ordem ou em qualquer
    // outra, desde que os cabeçalhos tenham esses nomes exatos.
    function parseCsvTemperaturas(texto) {
        const linhas = texto.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n').filter(l => l.trim().length > 0);
        if (linhas.length < 2) return [];

        const header = linhas[0].split(';').map(h => h.trim());
        const idx = {
            bateria: header.indexOf('BATERIA'),
            bloco: header.indexOf('BLOCO'),
            forno: header.indexOf('FORNO'),
            data: header.indexOf('DATA'),
            topo: header.indexOf('TOPO TEMP.'),
            lc: header.indexOf('LC TEMP.'),
            lm: header.indexOf('LM TEMP.'),
            ck: header.indexOf('CK TIME'),
        };
        const faltando = Object.entries(idx).filter(([, v]) => v === -1).map(([k]) => k);
        if (faltando.length > 0) {
            throw new Error(`Colunas não encontradas no CSV: ${faltando.join(', ')}. Confira o cabeçalho do arquivo.`);
        }

        const registros = [];
        for (let i = 1; i < linhas.length; i++) {
            const campos = linhas[i].split(';');
            if (campos.length < header.length) continue;

            const timestamp = parseDataBrHora(campos[idx.data]);
            if (timestamp === null) continue;

            registros.push({
                bateria: (campos[idx.bateria] || '').trim(),
                bloco: (campos[idx.bloco] || '').trim(),
                forno: (campos[idx.forno] || '').trim().padStart(2, '0'), // alinha com o padrão "01".."18" usado no resto do app
                data: timestamp,
                topo: parseNumeroBr(campos[idx.topo]),
                lc: parseNumeroBr(campos[idx.lc]),
                lm: parseNumeroBr(campos[idx.lm]),
                ck: parseNumeroBr(campos[idx.ck]),
            });
        }
        return registros;
    }

    function atualizarStatusCsvTemperatura() {
        const el = document.getElementById('status_csv_temp');
        if (!el) return;
        if (dadosTemperaturaCSV.length === 0) {
            el.innerText = 'Nenhum arquivo importado nesta sessão.';
            return;
        }
        let minVal = dadosTemperaturaCSV[0].data, maxVal = dadosTemperaturaCSV[0].data;
        for (const r of dadosTemperaturaCSV) {
            if (r.data < minVal) minVal = r.data;
            if (r.data > maxVal) maxVal = r.data;
        }
        const min = new Date(minVal);
        const max = new Date(maxVal);
        el.innerText = `${dadosTemperaturaCSV.length.toLocaleString('pt-BR')} registros carregados (${min.toLocaleDateString('pt-BR')} a ${max.toLocaleDateString('pt-BR')})`;
    }

    document.getElementById('btn_importar_csv_temp')?.addEventListener('click', () => {
        document.getElementById('input_csv_temperatura').click();
    });

    document.getElementById('input_csv_temperatura')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const btn = document.getElementById('btn_importar_csv_temp');
        const textoOriginal = btn.innerText;
        btn.disabled = true; btn.innerText = 'Importando...';

        const reader = new FileReader();
        reader.onload = (evt) => {
            // setTimeout(0) dá um respiro pra tela mostrar "Importando..."
            // antes de processar um arquivo grande (dezenas de milhares de linhas)
            setTimeout(() => {
                try {
                    const registros = parseCsvTemperaturas(evt.target.result);
                    if (registros.length === 0) throw new Error('Nenhum registro válido encontrado no arquivo.');
                    dadosTemperaturaCSV = registros;
                    atualizarStatusCsvTemperatura();
                    definirPeriodoPadrao();
                    renderizarGraficoTemperaturaTab();
                    if (modal.classList.contains('active')) renderizarGraficoTemperaturaModal();
                    alert(`Importado! ${registros.length.toLocaleString('pt-BR')} registros de temperatura carregados.\n\nEsses dados ficam só nesta aba do navegador — não são enviados ao Supabase.`);
                } catch (erro) {
                    console.error('Erro ao importar CSV de temperaturas:', erro);
                    alert(`Não foi possível importar o CSV.\n${erro.message}`);
                } finally {
                    btn.disabled = false; btn.innerText = textoOriginal;
                    e.target.value = '';
                }
            }, 0);
        };
        reader.onerror = () => {
            alert('Não foi possível ler o arquivo.');
            btn.disabled = false; btn.innerText = textoOriginal;
        };
        reader.readAsText(file, 'ISO-8859-1');
    });

    // Preenche o select de forno da aba (mesmo padrão "01".."18" do modal)
    (function preencherSelectFornoTemp() {
        const sel = document.getElementById('temp_filtro_forno');
        if (!sel) return;
        for (let i = 1; i <= 18; i++) {
            const f = i.toString().padStart(2, '0');
            sel.innerHTML += `<option value="${f}">${f}</option>`;
        }
    })();

    ['temp_filtro_bat', 'temp_filtro_bloco', 'temp_filtro_forno'].forEach(id => {
        document.getElementById(id)?.addEventListener('change', renderizarGraficoTemperaturaTab);
    });

    // Plugin do Chart.js que desenha uma linha vertical tracejada em cada
    // data de conclusão de reparo daquele forno, com um rótulo ao lado.
    const pluginLinhasReparo = {
        id: 'linhasReparo',
        afterDraw(chart, args, opts) {
            const indices = opts?.indices || [];
            if (!indices.length) return;
            const { ctx, chartArea, scales } = chart;
            if (!chartArea || !scales.x) return;
            ctx.save();
            indices.forEach(({ index, label }) => {
                const xPos = scales.x.getPixelForValue(index);
                if (xPos < chartArea.left || xPos > chartArea.right) return;
                ctx.strokeStyle = 'rgba(142, 36, 170, 0.85)';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 4]);
                ctx.beginPath();
                ctx.moveTo(xPos, chartArea.top);
                ctx.lineTo(xPos, chartArea.bottom);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = '#8e24aa';
                ctx.font = 'bold 9px Arial';
                ctx.save();
                ctx.translate(xPos - 4, chartArea.top + 4);
                ctx.rotate(Math.PI / 2);
                ctx.textBaseline = 'bottom';
                ctx.fillText(label, 0, 0);
                ctx.restore();
            });
            ctx.restore();
        }
    };
    if (typeof Chart !== 'undefined' && typeof Chart.register === 'function') Chart.register(pluginLinhasReparo);

    function construirDatasetTemperatura(bateria, bloco, forno) {
        let registros = dadosTemperaturaCSV.filter(r => r.bateria === bateria && r.bloco === bloco && r.forno === forno);
        if (periodoTempInicio !== null) registros = registros.filter(r => r.data >= periodoTempInicio);
        if (periodoTempFim !== null) registros = registros.filter(r => r.data <= periodoTempFim);
        return registros.sort((a, b) => a.data - b.data);
    }

    function montarConfigGraficoTemperatura(registros, bateria, bloco, forno) {
        const labels = registros.map(r => formatarDataHoraCurta(r.data));

        // Localiza, pra cada reparo CONCLUÍDO desse forno, o ponto do
        // gráfico mais próximo da data de conclusão, pra desenhar a linha
        // vertical de referência ali.
        const reparosConcluidos = dbReparos.filter(r =>
            r.bateria === bateria && r.bloco === bloco && r.forno === forno &&
            r.andamento === 'concluido' && r.data_fim
        );
        const indicesConclusao = [];
        reparosConcluidos.forEach(rep => {
            const alvoMs = new Date(`${rep.data_fim}T12:00:00`).getTime();
            if (isNaN(alvoMs)) return;
            let melhorIndex = -1, melhorDist = Infinity;
            registros.forEach((r, i) => {
                const dist = Math.abs(r.data - alvoMs);
                if (dist < melhorDist) { melhorDist = dist; melhorIndex = i; }
            });
            // só marca se o ponto mais próximo estiver a até 2 dias da conclusão
            if (melhorIndex !== -1 && melhorDist <= 2 * 24 * 60 * 60 * 1000) {
                indicesConclusao.push({ index: melhorIndex, label: `Reparo concluído: ${formatarDataBR(rep.data_fim)}` });
            }
        });

        return {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'TOPO TEMP.', data: registros.map(r => r.topo), borderColor: 'black', backgroundColor: 'black', yAxisID: 'yTemp', tension: 0.15, pointRadius: 0, borderWidth: 1.6, spanGaps: true },
                    { label: 'LC TEMP.', data: registros.map(r => r.lc), borderColor: 'darkblue', backgroundColor: 'darkblue', yAxisID: 'yTemp', tension: 0.15, pointRadius: 0, borderWidth: 1.6, spanGaps: true },
                    { label: 'LM TEMP.', data: registros.map(r => r.lm), borderColor: 'red', backgroundColor: 'red', yAxisID: 'yTemp', tension: 0.15, pointRadius: 0, borderWidth: 1.6, spanGaps: true },
                    { label: 'CK TIME', data: registros.map(r => r.ck), borderColor: 'green', backgroundColor: 'green', yAxisID: 'yTemp', tension: 0.15, pointRadius: 0, borderWidth: 1.6, borderDash: [4, 3], spanGaps: true },
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 14, font: { size: 10 } } },
                    linhasReparo: { indices: indicesConclusao },
                    zoom: {
                        zoom: {
                            drag: { enabled: true, backgroundColor: 'rgba(225,51,0,0.15)', borderColor: 'rgba(225,51,0,0.6)', borderWidth: 1 },
                            mode: 'x',
                        },
                        limits: { x: { minRange: 5 } }
                    }
                },
                scales: {
                    x: { ticks: { maxTicksLimit: 10, autoSkip: true, font: { size: 9 } } },
                    yTemp: { type: 'linear', position: 'left', title: { display: true, text: 'Temperatura (°C) / CK TIME', font: { size: 10 } } }
                }
            }
        };
    }

    function renderizarGraficoEm(canvasId, semDadosId, bateria, bloco, forno, setChart, getChart) {
        const canvas = document.getElementById(canvasId);
        const semDados = document.getElementById(semDadosId);
        if (!canvas) return;

        const chartAtual = getChart();
        if (chartAtual) { chartAtual.destroy(); setChart(null); }

        const registros = construirDatasetTemperatura(bateria, bloco, forno);
        if (registros.length === 0) {
            canvas.style.display = 'none';
            if (semDados) semDados.style.display = 'block';
            return;
        }
        canvas.style.display = 'block';
        if (semDados) semDados.style.display = 'none';

        const config = montarConfigGraficoTemperatura(registros, bateria, bloco, forno);
        setChart(new Chart(canvas, config));
    }

    function renderizarGraficoTemperaturaTab() {
        const bat = document.getElementById('temp_filtro_bat')?.value;
        const bloco = document.getElementById('temp_filtro_bloco')?.value;
        const forno = document.getElementById('temp_filtro_forno')?.value;
        if (!bat || !bloco || !forno) return;
        renderizarGraficoEm('grafico_temperatura_geral', 'temp_sem_dados_geral', bat, bloco, forno,
            (c) => { chartTemperaturaGeral = c; }, () => chartTemperaturaGeral);
    }

    function renderizarGraficoTemperaturaModal() {
        const canvas = document.getElementById('grafico_temperatura_modal');
        const semDados = document.getElementById('temp_sem_dados_modal');
        if (!canvas) return;

        const bat = document.getElementById('sel_bat')?.value;
        const bloco = document.getElementById('sel_bloco')?.value;
        const forno = document.getElementById('sel_forno')?.value;

        if (!bat || !bloco || !forno || forno === 'N/A') {
            if (chartTemperaturaModal) { chartTemperaturaModal.destroy(); chartTemperaturaModal = null; }
            canvas.style.display = 'none';
            if (semDados) { semDados.style.display = 'block'; semDados.innerText = 'Este alvo (Coletor) não tem dados de temperatura por forno.'; }
            return;
        }
        if (semDados) semDados.innerText = 'Nenhum dado de temperatura importado para este forno. Importe um CSV na aba "Gráfico de Temperaturas".';

        renderizarGraficoEm('grafico_temperatura_modal', 'temp_sem_dados_modal', bat, bloco, forno,
            (c) => { chartTemperaturaModal = c; }, () => chartTemperaturaModal);
    }

    // --- Gráfico expandido (mesmo alvo do modal, em tela maior) ---
    const overlayGraficoExpandido = document.getElementById('grafico_expandido_overlay');

    function renderizarGraficoExpandido() {
        const bat = document.getElementById('sel_bat')?.value;
        const bloco = document.getElementById('sel_bloco')?.value;
        const forno = document.getElementById('sel_forno')?.value;
        if (!bat || !bloco || !forno || forno === 'N/A') return;

        const titulo = document.getElementById('grafico_expandido_titulo');
        if (titulo) titulo.innerText = `Gráfico de Temperaturas — ${tituloFornoModal.innerText}`;

        if (chartTemperaturaExpandido) { chartTemperaturaExpandido.destroy(); chartTemperaturaExpandido = null; }
        const registros = construirDatasetTemperatura(bat, bloco, forno);
        if (registros.length === 0) return;

        const config = montarConfigGraficoTemperatura(registros, bat, bloco, forno);
        chartTemperaturaExpandido = new Chart(document.getElementById('grafico_temperatura_expandido'), config);
    }

    document.getElementById('btn_expandir_grafico_modal')?.addEventListener('click', () => {
        sincronizarInputsPeriodo();
        overlayGraficoExpandido?.classList.add('active');
        renderizarGraficoExpandido();
    });

    function fecharGraficoExpandido() {
        overlayGraficoExpandido?.classList.remove('active');
        if (chartTemperaturaExpandido) { chartTemperaturaExpandido.destroy(); chartTemperaturaExpandido = null; }
    }
    document.getElementById('grafico_expandido_fechar')?.addEventListener('click', fecharGraficoExpandido);
    overlayGraficoExpandido?.addEventListener('click', (e) => { if (e.target === overlayGraficoExpandido) fecharGraficoExpandido(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlayGraficoExpandido?.classList.contains('active')) fecharGraficoExpandido(); });

    document.getElementById('btn_resetar_zoom_geral')?.addEventListener('click', () => chartTemperaturaGeral?.resetZoom());
    document.getElementById('btn_resetar_zoom_modal')?.addEventListener('click', () => chartTemperaturaModal?.resetZoom());
    document.getElementById('btn_resetar_zoom_expandido')?.addEventListener('click', () => chartTemperaturaExpandido?.resetZoom());

    // =========================================================
    // --- 6. DASHBOARD GRÁFICOS (CHART.JS) ---
    // =========================================================
    let gStatus = null;
    let gRetro = null;

    document.getElementById('dash_filtro_bat').addEventListener('change', renderizarDashboard);

    function renderizarDashboard() {
        const batFilter = document.getElementById('dash_filtro_bat').value;
        let baseReparos = batFilter === 'Todas' ? dbReparos : dbReparos.filter(r => r.bateria === batFilter);

        let ultimosStatus = {};
        baseReparos.forEach(r => { ultimosStatus[r.id_referencia] = r.andamento; }); 
        
        let cStatus = { inspecao: 0, nao_reparado: 0, em_andamento: 0, concluido: 0 };
        for (let id in ultimosStatus) { if(cStatus[ultimosStatus[id]] !== undefined) cStatus[ultimosStatus[id]]++; }

        if (gStatus) gStatus.destroy();
        gStatus = new Chart(document.getElementById('graficoStatus'), {
            type: 'doughnut',
            data: {
                labels: ['Inspeção', 'Não Reparado', 'Em Andamento', 'Concluído'],
                datasets: [{ data: [cStatus.inspecao, cStatus.nao_reparado, cStatus.em_andamento, cStatus.concluido], backgroundColor: ['#FFD700', '#FF4C4C', '#1E90FF', '#32CD32'] }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });

        let contagemPecas = {};
        baseReparos.forEach(r => {
            contagemPecas[r.id_referencia] = (contagemPecas[r.id_referencia] || 0) + 1;
        });

        let retroativos = 0;
        let registrosUnicos = 0;
        for (let id in contagemPecas) {
            if (contagemPecas[id] > 1) retroativos++;
            else registrosUnicos++;
        }

        if (gRetro) gRetro.destroy();
        gRetro = new Chart(document.getElementById('graficoRetroativos'), {
            type: 'doughnut',
            data: {
                labels: ['Lançamento Único (OK)', 'Retroativo (>1 Lançamento)'],
                datasets: [{ data: [registrosUnicos, retroativos], backgroundColor: ['#A0A0A0', '#E13300'] }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });
    }

    document.getElementById("btn_exportar_json").addEventListener("click", () => {
        if (dbReparos.length === 0) return alert("Banco vazio!");
        const a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dbReparos, null, 4));
        a.download = `db_reparos_${new Date().getTime()}.json`; a.click();
    });
    document.getElementById("btn_trigger_import").addEventListener("click", () => document.getElementById("btn_importar_json").click());
    document.getElementById("btn_importar_json").addEventListener("change", (e) => {
        if (!isAdminAtual()) { alert('Apenas usuários administradores podem carregar um banco de dados.'); e.target.value = ''; return; }
        const file = e.target.files[0]; if (!file) return; const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const registros = JSON.parse(evt.target.result);
                if (!Array.isArray(registros)) throw new Error('O JSON precisa conter uma lista de registros.');

                if (supabaseAtivo) {
                    dbReparos = await importarReparosSupabase(registros);
                } else {
                    dbReparos = registros;
                }

                salvarCacheLocal();
                processarDadosGlobais();
                renderizarTabela();
                alert(`${dbReparos.length} registro(s) carregado(s)!`);
            } catch(err) {
                console.error('Erro ao importar JSON:', err);
                alert(`Erro no JSON ou no Supabase.\n${err.message}`);
            } finally {
                e.target.value = '';
            }
        }; reader.readAsText(file);
    });
});
