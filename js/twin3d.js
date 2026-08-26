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
const CENTRO_Y_ABOBADA = 5.2;              
const RAIO_X_ABOBADA = 4.8, RAIO_Y_ABOBADA = 2.8; 
const ALTURA_TOPO_FORNO = CENTRO_Y_ABOBADA + RAIO_Y_ABOBADA; 
const TOPO_SOLE_FLUE = 2.9;                
const PROTRUSAO_BUCKSTAY = PROFUNDIDADE_FORNO + 0.3;  
const PROTRUSAO_PROTECTOR = PROFUNDIDADE_FORNO + 0.08; 

const TOPO_BUCKSTAY_VERTICAL = 9.5;
const ALTURA_BUCKSTAY_HORIZONTAL = 0.5;
// MODIFICAÇÃO: Subtraindo a altura do próprio buckstay horizontal para que 
// o seu topo fique alinhado com o pico da abóbada (desceu 0.5 no eixo Y),
// sobrepondo e "segurando" o protector superior.
const BASE_BUCKSTAY_HORIZONTAL = ALTURA_TOPO_FORNO - ALTURA_BUCKSTAY_HORIZONTAL;

function criarGeometriaProtectorSuperior() {
    const profundidadeExtrude = 0.15;
    
    // Raios idênticos aos usados na face do forno (geoForno)
    const raioX_ext = RAIO_X_ABOBADA; // 4.8
    const raioY_ext = RAIO_Y_ABOBADA; // 2.8
    const raioX_int = 3.9;            // Raio interno do forno
    const raioY_int = 1.9;            // Raio interno do forno
    
    const shape = new THREE.Shape();
    // Desenha o arco externo exatamente igual à abóbada
    shape.absellipse(0, CENTRO_Y_ABOBADA, raioX_ext, raioY_ext, 0, Math.PI, false);
    // Fecha com o arco interno exatamente igual à parede interna da abóbada
    shape.absellipse(0, CENTRO_Y_ABOBADA, raioX_int, raioY_int, Math.PI, 0, true);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, { depth: profundidadeExtrude, bevelEnabled: false, curveSegments: 32 }); 
    geo.translate(0, 0, -profundidadeExtrude / 2);
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

    const zBuckstay = offsetZ + (isFront ? PROTRUSAO_BUCKSTAY : -PROTRUSAO_BUCKSTAY);
    const zProtector = offsetZ + (isFront ? PROTRUSAO_PROTECTOR : -PROTRUSAO_PROTECTOR);

    const ALTURA_PROTECTOR_INFERIOR = 0.7;
    const baseIntermediario = TOPO_SOLE_FLUE + (ALTURA_PROTECTOR_INFERIOR / 2);
    const topoIntermediario = CENTRO_Y_ABOBADA;
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
            const tipoPeca = child.userData.tipo;
            child.material.color.setHex(corBaseHex);

            let idBuscaAmbos = idOriginal.replace('LC', 'Ambos').replace('LM', 'Ambos');

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