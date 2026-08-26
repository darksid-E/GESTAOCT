// =========================================================
// --- 3. MOTOR DO GÊMEO DIGITAL 3D ---
// =========================================================
import { state } from './state.js';

const corBaseHex = 0xa0a0a0;
let container3D;

// Reduz o tamanho de tudo (fornos, sole flues, dutos, labels) pela metade.
// Aplicamos como escala do GRUPO inteiro (não editando cada geometria/
// posição individualmente) justamente para garantir que nada fique fora
// de lugar ou desconectado: como é uma transformação uniforme, todas as
// posições relativas (forno-a-forno, sole flue-no-forno, duto-no-forno)
// encolhem juntas na mesma proporção.
const ESCALA_FORNO = 0.5;

// Além da escala geral acima, o COMPRIMENTO do forno (profundidade no
// eixo Z — de frente pra trás) também foi reduzido pela metade
// especificamente. A profundidade original de cada forno era 24 (metade
// pra cada lado do seu próprio centro = 12); agora é 12 (metade pra cada
// lado = 6). Os fornos de "frente" e "trás" de cada bloco se tocam bem no
// meio (Z=0) — por isso o deslocamento usado em construirCluster3D()
// também precisa acompanhar essa metade (PROFUNDIDADE_FORNO), senão eles
// ficariam desconectados (com um vão) ou sobrepostos.
const PROFUNDIDADE_FORNO = 6; // metade da profundidade de cada forno a partir do seu centro

function criarGeometriaForno() {
    const shape = new THREE.Shape();
    shape.moveTo(5, 0);
    shape.lineTo(5, 5.2); shape.lineTo(4.8, 5.2);
    shape.absellipse(0, 5.2, 4.8, 2.8, 0, Math.PI, false);
    shape.lineTo(-5, 5.2); shape.lineTo(-5, 0); shape.lineTo(-4, 0); shape.lineTo(-4, 5.2); shape.lineTo(-3.9, 5.2);
    shape.absellipse(0, 5.2, 3.9, 1.9, Math.PI, 0, true);
    shape.lineTo(4, 5.2); shape.lineTo(4, 0); shape.lineTo(5, 0);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: PROFUNDIDADE_FORNO * 2, bevelEnabled: false, curveSegments: 10 });
    geo.translate(0, 0, -PROFUNDIDADE_FORNO); return geo;
}

function criarGeometriaSoleFlue() {
    const shape = new THREE.Shape();
    shape.moveTo(1, 0); shape.lineTo(1, 2.9); shape.lineTo(-1, 2.9); shape.lineTo(-1, 0); shape.lineTo(2, 0);
    const hole = new THREE.Path();
    hole.moveTo(-0.7, 0.6); hole.lineTo(-0.7, 2.2); hole.lineTo(-0.55, 2.2);
    hole.absellipse(0, 2.2, 0.55, 0.4, Math.PI, 0, true);
    hole.lineTo(0.7, 2.2); hole.lineTo(0.7, 0.6); hole.lineTo(-0.7, 0.6);
    shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: PROFUNDIDADE_FORNO * 2, bevelEnabled: false, curveSegments: 32 });
    geo.translate(0, 0, -PROFUNDIDADE_FORNO); return geo;
}

const geoForno = criarGeometriaForno();
const geoSoleFlue = criarGeometriaSoleFlue();
const geoDuto = new THREE.CylinderGeometry(2.5, 2.5, 10, 32);
geoDuto.rotateZ(Math.PI / 2);

// =========================================================
// --- BUCKSTAYS E PROTECTORS ---
// =========================================================
// Baseado no modelo FORNO3D.blend (meia-peça do forno com buckstays e
// protectors) enviado por Felipe. O arquivo original é um mesh CAD único
// e muito denso (~230 mil vértices, ~460 mil faces, sem objetos ou grupos
// nomeados por peça) — importar isso ao pé da letra pesaria demais pra
// renderizar em tempo real (ainda mais multiplicado por até 18 fornos).
// Por isso essas peças foram ADAPTADAS: formato geométrico simplificado,
// nas proporções e posições relativas equivalentes ao modelo real, no
// mesmo estilo visual leve já usado pro forno/sole flue/coletor.
//
// Formam uma "moldura" na face frontal de cada forno: dois buckstays
// verticais (nas bordas — por isso cada forno "pega um pedaço" do forno
// vizinho, já que a borda é compartilhada) que sobem além da abóbada pra
// segurar o coletor; um buckstay horizontal tangente ao topo da abóbada,
// ligando os dois verticais; um protector superior que acompanha a
// curvatura da abóbada (encostado por fora, sem invadir o forno); um
// protector inferior no nível do topo dos sole flues; e dois protectors
// intermediários colados nos buckstays verticais, na altura do meio.
const CENTRO_Y_ABOBADA = 5.2;              // centro da elipse da abóbada (mesmo valor usado no geoForno)
const RAIO_X_ABOBADA = 4.8, RAIO_Y_ABOBADA = 2.8; // raios externos da abóbada (idem geoForno)
const ALTURA_TOPO_FORNO = CENTRO_Y_ABOBADA + RAIO_Y_ABOBADA; // pico da abóbada = 8
const TOPO_SOLE_FLUE = 2.9;                // até onde vai o sole flue (eixo Y)
const PROTRUSAO_BUCKSTAY = PROFUNDIDADE_FORNO + 0.3;  // buckstay fica um pouco saliente da face do forno
const PROTRUSAO_PROTECTOR = PROFUNDIDADE_FORNO + 0.08; // protector quase colado na face

// Buckstays verticais: vão da base até um pouco acima do coletor (que
// fica em y=11), pra dar a impressão de estarem segurando-o.
const TOPO_BUCKSTAY_VERTICAL = 9.5;
// Buckstay horizontal: tangencia o pico da abóbada (fica encostado nela,
// sem cortar por dentro).
const BASE_BUCKSTAY_HORIZONTAL = ALTURA_TOPO_FORNO;
const ALTURA_BUCKSTAY_HORIZONTAL = 0.5;

function criarGeometriaProtectorSuperior() {
    // Acompanha exatamente a curva externa da abóbada (mesmo arco elíptico
    // do geoForno) — um "casco" fino por fora dela, então nunca invade o
    // forno. É mais estreito que a abóbada inteira ("menor"), cobrindo só
    // a parte central de cima, não até as bordas.
    const espessura = 0.15;
    const raioXext = RAIO_X_ABOBADA + espessura;
    const raioYext = RAIO_Y_ABOBADA + espessura;
    const anguloInicio = 0.45; // rad — deixa de fora as bordas da abóbada (menor)
    const anguloFim = Math.PI - 0.45;

    const shape = new THREE.Shape();
    shape.absellipse(0, CENTRO_Y_ABOBADA, raioXext, raioYext, anguloInicio, anguloFim, false);
    shape.absellipse(0, CENTRO_Y_ABOBADA, RAIO_X_ABOBADA, RAIO_Y_ABOBADA, anguloFim, anguloInicio, true);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, { depth: espessura, bevelEnabled: false, curveSegments: 24 });
    geo.translate(0, 0, -espessura / 2);
    return geo;
}

const geoBuckstayVertical = new THREE.BoxGeometry(0.6, TOPO_BUCKSTAY_VERTICAL, 0.5);
const geoBuckstayHorizontal = new THREE.BoxGeometry(10.3, ALTURA_BUCKSTAY_HORIZONTAL, 0.5);
const geoProtectorSuperior = criarGeometriaProtectorSuperior();
const geoProtectorInferior = new THREE.BoxGeometry(8.6, 0.7, 0.15);
const geoProtectorIntermediario = new THREE.BoxGeometry(1.3, 1.95, 0.15);

export function init3D() {
    if (state.three.scene) return;
    container3D = container3D || document.getElementById('container_3d');

    state.three.scene = new THREE.Scene();
    state.three.fornosGroup = new THREE.Group();
    state.three.fornosGroup.scale.setScalar(ESCALA_FORNO);
    state.three.scene.add(state.three.fornosGroup);

    const width = container3D.clientWidth; const height = container3D.clientHeight;
    state.three.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    state.three.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    state.three.renderer.setSize(width, height);
    container3D.appendChild(state.three.renderer.domElement);

    state.three.controls = new THREE.OrbitControls(state.three.camera, state.three.renderer.domElement);
    state.three.controls.enableDamping = true; state.three.controls.dampingFactor = 0.05;

    // Câmera também na metade da distância original: como os fornos agora
    // ocupam a metade do espaço em unidades do mundo, aproximar a câmera
    // na mesma proporção mantém o forno selecionado com o mesmo nível de
    // zoom/foco de antes — só que agora com o bloco inteiro ao redor dele.
    state.three.camera.position.set(0, 7.5, 27.5);
    state.three.controls.target.set(0, 2.5, 0);

    state.three.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
    dirLight.position.set(15, 30, 20); state.three.scene.add(dirLight);

    function animate() {
        requestAnimationFrame(animate);
        state.three.controls.update();
        state.three.renderer.render(state.three.scene, state.three.camera);
    }
    animate();
}

window.mudarCamera3D = function (visao) {
    const cam = state.three.camera, controls = state.three.controls;
    if (!cam) return;
    if (visao === 'frontal') { cam.position.set(0, 7.5, 27.5); controls.target.set(0, 2.5, 0); }
    if (visao === 'topo') { cam.position.set(0, 27.5, 0.05); controls.target.set(0, 0, 0); }
    if (visao === 'lateral') { cam.position.set(22.5, 5, 0); controls.target.set(0, 2.5, 0); }
};

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
    fornoMesh.userData = { idRef: idBase, tipo: 'Forno' };
    fornoMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geoForno), new THREE.LineBasicMaterial({ color: 0x222 })));
    state.three.fornosGroup.add(fornoMesh);

    for (let i = 1; i <= 4; i++) {
        const sfMesh = new THREE.Mesh(geoSoleFlue, matPadrao.clone());
        sfMesh.position.set(offsetX - 3 + ((i - 1) * 2), 0, offsetZ);
        sfMesh.userData = { idRef: `${idBase} - SF${i}` };
        sfMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geoSoleFlue), new THREE.LineBasicMaterial({ color: 0x222 })));
        state.three.fornosGroup.add(sfMesh);
    }

    const dutoMesh = new THREE.Mesh(geoDuto, matPadrao.clone());
    dutoMesh.position.set(offsetX, 11, offsetZ + (isFront ? PROFUNDIDADE_FORNO - 0.35 : -(PROFUNDIDADE_FORNO - 0.35)));
    dutoMesh.userData = { idRef: `${strF} - ${bat}${bloco} - Coletor ${lado}` };
    state.three.fornosGroup.add(dutoMesh);

    // Buckstays e protectors: mesmo idRef do forno (pra pintarem a mesma
    // célula no mapa 2D, sem precisar de um ponto próprio pra cada um —
    // ver atualizarCores3D, onde essas peças são coloridas individualmente
    // filtrando também pelo campo "tipo" do reparo, não só pelo idRef).
    const zBuckstay = offsetZ + (isFront ? PROTRUSAO_BUCKSTAY : -PROTRUSAO_BUCKSTAY);
    const zProtector = offsetZ + (isFront ? PROTRUSAO_PROTECTOR : -PROTRUSAO_PROTECTOR);

    // Faixa entre o topo do protector inferior e o início da abóbada —
    // é aí que os protectors intermediários ficam encaixados. (posição é
    // sempre o CENTRO da peça, por isso a "borda de cima" do inferior é
    // seu centro + metade da própria altura, não a altura inteira)
    const ALTURA_PROTECTOR_INFERIOR = 0.7;
    const baseIntermediario = TOPO_SOLE_FLUE + (ALTURA_PROTECTOR_INFERIOR / 2); // topo do protector inferior
    const topoIntermediario = CENTRO_Y_ABOBADA;      // onde a abóbada começa
    const centroIntermediario = (baseIntermediario + topoIntermediario) / 2;

    function criarPecaAcessoria(geo, tipo, x, y, z) {
        const mesh = new THREE.Mesh(geo, matPadrao.clone());
        mesh.position.set(x, y, z);
        mesh.userData = { idRef: idBase, tipo };
        mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x222 })));
        state.three.fornosGroup.add(mesh);
    }

    criarPecaAcessoria(geoBuckstayVertical, 'Buckstay Vertical Esquerdo', offsetX - 5, TOPO_BUCKSTAY_VERTICAL / 2, zBuckstay);
    criarPecaAcessoria(geoBuckstayVertical, 'Buckstay Vertical Direito', offsetX + 5, TOPO_BUCKSTAY_VERTICAL / 2, zBuckstay);
    criarPecaAcessoria(geoBuckstayHorizontal, 'Buckstay Horizontal', offsetX, BASE_BUCKSTAY_HORIZONTAL + ALTURA_BUCKSTAY_HORIZONTAL / 2, zBuckstay);
    // O protector superior já tem a curva da abóbada embutida na própria
    // geometria (centrada em CENTRO_Y_ABOBADA) — por isso é posicionado em
    // y=0, igual ao próprio forno, e não precisa de deslocamento extra.
    criarPecaAcessoria(geoProtectorSuperior, 'Protector Superior', offsetX, 0, zProtector);
    criarPecaAcessoria(geoProtectorInferior, 'Protector Inferior', offsetX, TOPO_SOLE_FLUE, zProtector);
    criarPecaAcessoria(geoProtectorIntermediario, 'Protector Intermediário Esquerdo', offsetX - 4.65, centroIntermediario, zProtector);
    criarPecaAcessoria(geoProtectorIntermediario, 'Protector Intermediário Direito', offsetX + 4.65, centroIntermediario, zProtector);

    const label = criarSpriteTexto(`F${strF} ${bat}${bloco} ${lado}`);
    label.position.set(offsetX, 4.6, offsetZ + (isFront ? PROFUNDIDADE_FORNO + 0.05 : -(PROFUNDIDADE_FORNO + 0.05)));
    state.three.fornosGroup.add(label);
}

export function construirCluster3D(bat, bloco, fornoStr, ladoStr) {
    while (state.three.fornosGroup.children.length > 0) { state.three.fornosGroup.remove(state.three.fornosGroup.children[0]); }
    let fornoCentro = parseInt(fornoStr) || 1;
    let ladoFrontal = (ladoStr === 'Ambos') ? 'LC' : ladoStr;
    let ladoTraseiro = (ladoFrontal === 'LC') ? 'LM' : 'LC';

    // Mostra o bloco inteiro (fornos 01 a 18) em vez de só 2 pra cada lado
    // do selecionado. O forno selecionado continua sempre no offsetX=0,
    // que é justamente pra onde a câmera aponta (controls.target) — então
    // o foco visual nele se mantém, só que agora com o bloco todo ao redor
    // pra dar contexto.
    for (let fNum = 1; fNum <= 18; fNum++) {
        let i = fNum - fornoCentro;
        let offsetX = i * 10;
        instanciarConjuntoForno(fNum, ladoFrontal, bat, bloco, offsetX, PROFUNDIDADE_FORNO, true);
        instanciarConjuntoForno(fNum, ladoTraseiro, bat, bloco, offsetX, -PROFUNDIDADE_FORNO, false);
    }
}

export function atualizarCores3D() {
    const coresStatus = { 'inspecao': 0xFFD700, 'nao_reparado': 0xFF4C4C, 'em_andamento': 0x1E90FF, 'concluido': 0x32CD32 };

    state.three.fornosGroup.children.forEach(child => {
        if (child.type === "Mesh" && child.userData && child.userData.idRef) {
            const idOriginal = child.userData.idRef;
            const tipoPeca = child.userData.tipo; // só existe pro forno, buckstays e protectors
            child.material.color.setHex(corBaseHex);

            let idBuscaAmbos = idOriginal.replace('LC', 'Ambos').replace('LM', 'Ambos');

            // Forno, buckstays e protectors compartilham o MESMO idRef (o do
            // forno) — pra cada um pintar de acordo com o próprio histórico
            // (e não todos ficarem com a cor do último reparo de qualquer
            // um deles), filtramos também pelo campo reparo_no. Sole flue e
            // coletor não têm "tipo" (seus idRef já são únicos), então
            // continuam comparando só pelo idRef, como sempre.
            const reparosPeca = state.dbReparos.filter(r => {
                const mesmoAlvo = r.id_referencia === idOriginal || r.id_referencia === idBuscaAmbos;
                if (!mesmoAlvo) return false;
                return tipoPeca ? r.reparo_no === tipoPeca : true;
            });

            if (reparosPeca.length > 0) {
                const ultimoReparo = reparosPeca[reparosPeca.length - 1];
                const corHex = coresStatus[ultimoReparo.andamento] || corBaseHex;
                child.material.color.setHex(corHex);
            }
        }
    });
}