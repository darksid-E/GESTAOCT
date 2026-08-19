// =========================================================
// --- 3. MOTOR DO GÊMEO DIGITAL 3D ---
// =========================================================
import { state } from './state.js';

const corBaseHex = 0xa0a0a0;
let container3D;

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

export function init3D() {
    if (state.three.scene) return;
    container3D = container3D || document.getElementById('container_3d');

    state.three.scene = new THREE.Scene();
    state.three.fornosGroup = new THREE.Group();
    state.three.scene.add(state.three.fornosGroup);

    const width = container3D.clientWidth; const height = container3D.clientHeight;
    state.three.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    state.three.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    state.three.renderer.setSize(width, height);
    container3D.appendChild(state.three.renderer.domElement);

    state.three.controls = new THREE.OrbitControls(state.three.camera, state.three.renderer.domElement);
    state.three.controls.enableDamping = true; state.three.controls.dampingFactor = 0.05;

    state.three.camera.position.set(0, 15, 55);
    state.three.controls.target.set(0, 5, 0);

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
    if (visao === 'frontal') { cam.position.set(0, 15, 55); controls.target.set(0, 5, 0); }
    if (visao === 'topo') { cam.position.set(0, 55, 0.1); controls.target.set(0, 0, 0); }
    if (visao === 'lateral') { cam.position.set(45, 10, 0); controls.target.set(0, 5, 0); }
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
    fornoMesh.userData = { idRef: idBase };
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
    dutoMesh.position.set(offsetX, 11, offsetZ + (isFront ? 11.3 : -11.3));
    dutoMesh.userData = { idRef: `${strF} - ${bat}${bloco} - Coletor ${lado}` };
    state.three.fornosGroup.add(dutoMesh);

    const label = criarSpriteTexto(`F${strF} ${bat}${bloco} ${lado}`);
    label.position.set(offsetX, 4.6, offsetZ + (isFront ? 12.1 : -12.1));
    state.three.fornosGroup.add(label);
}

export function construirCluster3D(bat, bloco, fornoStr, ladoStr) {
    while (state.three.fornosGroup.children.length > 0) { state.three.fornosGroup.remove(state.three.fornosGroup.children[0]); }
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

export function atualizarCores3D() {
    const coresStatus = { 'inspecao': 0xFFD700, 'nao_reparado': 0xFF4C4C, 'em_andamento': 0x1E90FF, 'concluido': 0x32CD32 };

    state.three.fornosGroup.children.forEach(child => {
        if (child.type === "Mesh" && child.userData && child.userData.idRef) {
            const idOriginal = child.userData.idRef;
            child.material.color.setHex(corBaseHex);

            let idBuscaAmbos = idOriginal.replace('LC', 'Ambos').replace('LM', 'Ambos');

            const reparosPeca = state.dbReparos.filter(r =>
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
