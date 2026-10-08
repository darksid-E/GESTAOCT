// =========================================================
// --- 4. LÓGICA DO MODAL (FORMULÁRIO E AÇÕES) ---
// =========================================================
import { state, isAdminAtual, nomeExibicaoAtual, salvarCacheLocal } from './state.js';
import { formatarStatus, formatarDataBR, definirValorSelect } from './utils.js';
import { criarReparoSupabase, atualizarReparoSupabase, excluirReparoSupabase, uploadFotoSupabase } from './supabase-api.js';
import { init3D, construirCluster3D, atualizarCores3D, renderizarFrame3D } from './twin3d.js';
import { processarDadosGlobais } from './mapa2d.js';
import { renderizarTabela } from './tabela.js';
import { aplicarPermissoes } from './auth.js';

import { mostrarToast } from './toast.js';
let modal, tituloFornoModal, listaHistorico, selectElements, selTipoPrincipal, selLadoPrincipal;
let lightboxFoto, lightboxImg;

export function atualizarAlvoVisual() {
    const bat = document.getElementById('sel_bat').value;
    const bloco = document.getElementById('sel_bloco').value;
    let forno = document.getElementById('sel_forno').value;
    const lado = document.getElementById('sel_lado').value;
    const tipo = document.getElementById('sel_tipo').value;

    if (forno === 'N/A') { document.getElementById('sel_forno').value = '01'; forno = '01'; }

    let idGerado = "";
    if (tipo === 'Coletor') idGerado = `${forno} - ${bat}${bloco} - Coletor ${lado}`;
    else if (tipo.startsWith('Sole Flue')) idGerado = `${forno} - ${bat}${bloco} - ${lado} - SF${tipo.split(' ')[2]}`;
    else idGerado = `${forno} - ${bat}${bloco} - ${lado}`;

    tituloFornoModal.innerText = idGerado;
    carregarHistorico(idGerado);
    construirCluster3D(bat, bloco, forno, lado);
    atualizarCores3D();
    renderizarFrame3D();
    aplicarPermissoes();
}

export function abrirModalMapClick(tipoItem, bat, bloco, forno, lado) {
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

function dataHojeISO() {
    // Data local (não UTC) no formato yyyy-mm-dd, como o input type="date"
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Avaliação CT agora é OK/NOK. Registros antigos foram digitados em texto
// livre: se o valor não for OK/NOK, ele é mantido como opção extra para
// não ser apagado sem querer quando o registro for editado.
function definirAvaliacaoCT(valor) {
    const sel = document.getElementById("aval_ct");
    sel.querySelectorAll('option[data-legado]').forEach(o => o.remove());
    const v = (valor || '').trim();
    if (v && !['OK', 'NOK'].includes(v.toUpperCase())) {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = v; opt.dataset.legado = '1';
        sel.appendChild(opt);
        sel.value = v;
    } else {
        sel.value = v.toUpperCase();
    }
}

function limparFormulario() {
    document.getElementById("id_reparo_edit").value = ''; document.getElementById("desc_problema").value = ''; document.getElementById("desc_solucao").value = '';
    document.getElementById("status_reparo").value = 'inspecao'; definirAvaliacaoCT(''); document.getElementById("prazo_reparo").value = '';
    document.getElementById("avaliador_ct").value = ''; document.getElementById("ranking_problema").value = '';
    // Ocorrência: sugere hoje (editável) e não aceita data futura
    const inputOcorrencia = document.getElementById("data_ocorrencia");
    inputOcorrencia.max = dataHojeISO(); inputOcorrencia.value = dataHojeISO();
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

window.editarRegistro = function (idReparo) {
    if (!isAdminAtual()) { mostrarToast('Apenas usuários administradores podem editar reparos.', 'info', 6000); return; }
    const reg = state.dbReparos.find(r => r.id_reparo == idReparo);
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
        definirAvaliacaoCT(reg.avaliacao_ct);
        document.getElementById("avaliador_ct").value = reg.avaliador_ct || '';
        document.getElementById("ranking_problema").value = reg.ranking_problema ? String(reg.ranking_problema) : '';
        document.getElementById("data_ocorrencia").value = reg.data_ocorrencia || '';
        document.getElementById("prazo_reparo").value = reg.prazo || '';
        document.getElementById("data_fim").value = reg.data_fim || '';
        document.getElementById("obs_reparo").value = reg.observacao || '';
        document.getElementById("btn_salvar").innerText = "Atualizar Registro"; document.getElementById("btn_cancelar_edicao").style.display = "";

        // Exibir as imagens caso existam
        if (reg.foto_antes || reg.foto_depois) {
            document.getElementById("preview_fotos").style.display = 'flex';
            if (reg.foto_antes) {
                document.getElementById("img_preview_antes").src = reg.foto_antes;
                document.getElementById("img_preview_antes").style.display = 'block';
                document.getElementById("foto_antes_texto").innerText = 'Foto atual';
                document.querySelector('label[for="foto_antes"]')?.classList.add('has_file');
            }
            if (reg.foto_depois) {
                document.getElementById("img_preview_depois").src = reg.foto_depois;
                document.getElementById("img_preview_depois").style.display = 'block';
                document.getElementById("foto_depois_texto").innerText = 'Foto atual';
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

function obterRegistrosDoAlvo(idBuscado) {
    const isAmbos = idBuscado.includes('Ambos');
    const isLC = idBuscado.includes('- LC');
    const isLM = idBuscado.includes('- LM');

    return state.dbReparos.filter(item => {
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

        const btnImprimirHist = `<button class="btn_icone" onclick="imprimirRegistroUnico('${reg.id_reparo}')" aria-label="Imprimir"><svg class="icone" aria-hidden="true"><use href="#i-printer"></use></svg></button>`;
        const acoesHist = isAdminAtual()
            ? `<button class="btn_icone icone_editar" onclick="editarRegistro('${reg.id_reparo}')" aria-label="Editar"><svg class="icone" aria-hidden="true"><use href="#i-pencil"></use></svg></button><button class="btn_icone icone_excluir" onclick="deletarRegistro('${reg.id_reparo}')" aria-label="Excluir"><svg class="icone" aria-hidden="true"><use href="#i-trash"></use></svg></button>${btnImprimirHist}`
            : btnImprimirHist;

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
            <div class="acoes_linha">${acoesHist}</div></div>
            <strong>Alvo:</strong> ${reg.id_referencia}<br><strong>Status:</strong> ${formatarStatus(reg.andamento)}<br>
            <strong>Ocorrência:</strong> ${formatarDataBR(reg.data_ocorrencia)}${reg.ranking_problema ? ` &nbsp;<strong>Ranking:</strong> ${reg.ranking_problema}` : ''}<br>
            ${(reg.avaliacao_ct || reg.avaliador_ct) ? `<strong>Avaliação CT:</strong> ${reg.avaliacao_ct || '-'}${reg.avaliador_ct ? ` (${reg.avaliador_ct})` : ''}<br>` : ''}
            <strong>Problema:</strong> ${reg.desc_problema || '-'}<br> <strong>Observação:</strong> ${reg.observacao || '-'} <br><strong>Prazo:</strong> ${formatarDataBR(reg.prazo)}<br>
            <strong>Registrado por:</strong> ${reg.criado_por || '-'}
            ${fotosHtml}
        `;
        listaHistorico.appendChild(card);
    });
}

function fecharLightbox() { if (lightboxFoto) { lightboxFoto.classList.remove('active'); lightboxImg.src = ''; } }

// Usado pelo módulo de impressão (impressao.js)
export function getObterRegistrosDoAlvo() { return obterRegistrosDoAlvo; }
export function getTituloFornoModalTexto() { return tituloFornoModal.innerText; }
export function getModalEl() { return modal; }

export function initModalReparo() {
    modal = document.getElementById("modal_reparo");
    tituloFornoModal = document.getElementById("forno_alvo");
    listaHistorico = document.getElementById("lista_historico");
    selectElements = document.querySelectorAll('.select_alvo');

    selTipoPrincipal = document.getElementById('sel_tipo');
    selLadoPrincipal = document.getElementById('sel_lado');

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

    document.getElementById("btn_abrir_manual").addEventListener('click', () => {
        if (!isAdminAtual()) { mostrarToast('Apenas usuários administradores podem lançar novos reparos.', 'info', 6000); return; }
        document.getElementById('sel_bat').value = 'A'; document.getElementById('sel_bloco').value = '1';
        document.getElementById('sel_forno').value = '01'; document.getElementById('sel_lado').value = 'LC'; document.getElementById('sel_tipo').value = 'Forno';

        selTipoPrincipal.dispatchEvent(new Event('change'));

        limparFormulario(); modal.classList.add("active");
        setTimeout(() => { init3D(); atualizarAlvoVisual(); }, 100);
    });

    configurarInputFoto('foto_antes', 'foto_antes_texto', 'img_preview_antes');
    configurarInputFoto('foto_depois', 'foto_depois_texto', 'img_preview_depois');

    document.getElementById("btn_cancelar_edicao").addEventListener("click", () => limparFormulario());
    document.getElementById("fechar_modal").addEventListener("click", () => modal.classList.remove("active"));
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("active"); });

    document.getElementById("btn_salvar").addEventListener("click", async () => {
        if (!isAdminAtual()) { mostrarToast('Apenas usuários administradores podem lançar ou editar reparos.', 'info', 6000); return; }
        const botaoSalvar = document.getElementById("btn_salvar");
        const idEdit = document.getElementById("id_reparo_edit").value;

        const dataOcorrencia = document.getElementById("data_ocorrencia").value;
        if (dataOcorrencia && dataOcorrencia > dataHojeISO()) {
            mostrarToast('A data da ocorrência não pode ser futura.', 'info', 6000);
            document.getElementById("data_ocorrencia").focus();
            return;
        }

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
                avaliador_ct: document.getElementById("avaliador_ct").value.trim().toUpperCase(),
                ranking_problema: document.getElementById("ranking_problema").value ? Number(document.getElementById("ranking_problema").value) : null,
                data_ocorrencia: document.getElementById("data_ocorrencia").value || null,
                observacao: document.getElementById("obs_reparo").value.toUpperCase(),
                foto_antes: urlAntes !== window.location.href ? urlAntes : null,
                foto_depois: urlDepois !== window.location.href ? urlDepois : null,
            };

            if (state.supabaseAtivo) {
                if (idEdit) {
                    const atualizado = await atualizarReparoSupabase(idEdit, dadosForm);
                    const index = state.dbReparos.findIndex(r => r.id_reparo == idEdit);
                    if (index !== -1) state.dbReparos[index] = atualizado || { ...state.dbReparos[index], ...dadosForm };
                } else {
                    const novoRegistro = {
                        id_reparo: Date.now().toString(),
                        data_registro: new Date().toLocaleDateString('pt-BR'),
                        criado_por: nomeExibicaoAtual(),
                        ...dadosForm
                    };
                    const salvo = await criarReparoSupabase(novoRegistro);
                    state.dbReparos.push(salvo || novoRegistro);
                }
            } else {
                if (idEdit) {
                    const index = state.dbReparos.findIndex(r => r.id_reparo == idEdit);
                    if (index !== -1) state.dbReparos[index] = { ...state.dbReparos[index], ...dadosForm };
                } else {
                    state.dbReparos.push({ id_reparo: Date.now().toString(), data_registro: new Date().toLocaleDateString('pt-BR'), criado_por: nomeExibicaoAtual(), ...dadosForm });
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
            mostrarToast(`Não foi possível salvar no Supabase.\n${erro.message}`, 'erro', 8000);
            // Deu erro: o registro NÃO foi salvo, então mantém o modo em que
            // o usuário estava (edição ou novo registro) pra ele poder tentar de novo.
            botaoSalvar.innerText = idEdit ? 'Atualizar Registro' : 'Adicionar Registro';
        } finally {
            botaoSalvar.disabled = false;
        }
    });

    window.deletarRegistro = async function (idReparo) {
        if (!isAdminAtual()) { mostrarToast('Apenas usuários administradores podem excluir reparos.', 'info', 6000); return; }
        if (!confirm("Deseja excluir este registro?")) return;

        try {
            if (state.supabaseAtivo) await excluirReparoSupabase(idReparo);
            state.dbReparos = state.dbReparos.filter(r => r.id_reparo != idReparo);
            salvarCacheLocal();
            processarDadosGlobais();
            // Só atualiza a vista 3D/histórico do modal de reparo se ele
            // estiver realmente aberto (a cena 3D só existe depois que
            // init3D() roda pelo menos uma vez); excluir direto pela
            // tabela não abre esse modal.
            if (modal.classList.contains('active') && state.three.scene) {
                atualizarAlvoVisual();
            }
            renderizarTabela();
        } catch (erro) {
            console.error('Erro ao excluir reparo:', erro);
            mostrarToast(`Não foi possível excluir no Supabase.\n${erro.message}`, 'erro', 8000);
        }
    };

    // --- LIGHTBOX DE FOTOS (clique na miniatura para expandir) ---
    lightboxFoto = document.getElementById('lightbox_foto');
    lightboxImg = document.getElementById('lightbox_img');

    listaHistorico.addEventListener('click', (e) => {
        const thumb = e.target.closest('.hist_foto_thumb');
        if (!thumb || !lightboxFoto || !lightboxImg) return;
        lightboxImg.src = thumb.dataset.full;
        lightboxFoto.classList.add('active');
    });

    document.getElementById('lightbox_fechar')?.addEventListener('click', fecharLightbox);
    lightboxFoto?.addEventListener('click', (e) => { if (e.target === lightboxFoto) fecharLightbox(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharLightbox(); });
}