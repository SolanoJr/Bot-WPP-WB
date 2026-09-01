import { createBroadcaster, supportError } from '/shared/broadcaster.js?v=8';

const $ = (id) => document.getElementById(id);
const query = new URLSearchParams(location.search);
const token = query.get('t');

// Viewer: redirecionar para pagina de visualizacao
if (token && token.split('.').length === 6) {
  const _parts = token.split('.');
  if (_parts[3] === 'viewer') {
    location.href = '/viewer.html?t=' + encodeURIComponent(token);
    throw new Error('redirect');
  }
}

const FONTES = ['tela', 'camera'];
const GUARDADAS = 'opcoesTransmissao';

function guardadas() {
  try { return JSON.parse(localStorage.getItem(GUARDADAS) ?? '{}'); } catch { return {}; }
}

const salvas = guardadas();
const opcoes = {
  bitrate: Number(query.get('q')) || Number(salvas.bitrate) || 2_500_000,
  fps: Number(query.get('fps')) || Number(salvas.fps) || 30,
};

function guardar() {
  try { localStorage.setItem(GUARDADAS, JSON.stringify(opcoes)); } catch {}
}

function espelharOpcoes() {
  $('qualidade').value = String(opcoes.bitrate);
  $('quadros').value = String(opcoes.fps);
}

function mudarOpcao(chave, valor) {
  if (!Number(valor)) return;
  opcoes[chave] = Number(valor);
  guardar();
  for (const painel of Object.values(paineis)) painel?.aplicarQualidade?.();
}

const paineis = {};

function readTokenPayload() {
  if (!token) return null;
  if (token.split('.').length === 6) {
    const parts = token.split('.');
    return { room: parts[0], uid: parts[1], name: parts[2], role: parts[3], exp: parseInt(parts[4], 10), scope: parts[3] };
  }
  try { return JSON.parse(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return null; }
}

function falhar(titulo, msg) {
  for (const f of FONTES) $(`bloco-${f}`).hidden = true;
  const el = $('pageStatus');
  el.textContent = `${titulo} ${msg}`;
  el.className = 'status error';
}

function criarPainel(fonte) {
  let broadcaster = null;

  return {
    async start() {
      if (broadcaster) return;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${proto}://${location.host}/ws?t=${encodeURIComponent(token)}&fonte=${fonte}`;

      broadcaster = createBroadcaster({
        wsUrl,
        bitrate: opcoes.bitrate,
        fps: opcoes.fps,
        audio: false,
        fonte,
        onStatus: (info) => {
          const el = $(`${fonte}-status`);
          if (info?.codec) { el.textContent = '🟢 Conectado'; el.className = 'status success'; }
        },
        onStats: (stats) => {
          $(`${fonte}-fps`).textContent = stats.fps || '—';
          $(`${fonte}-bitrate`).textContent = stats.mbps ? stats.mbps.toFixed(1) + ' Mbps' : '—';
          $(`${fonte}-viewers`).textContent = stats.viewers || 0;
          $(`${fonte}-elapsed`).textContent = stats.seconds ? Math.floor(stats.seconds / 60).toString().padStart(2, '0') + ':' + (stats.seconds % 60).toString().padStart(2, '0') : '00:00';
        },
        onEnd: (reason) => {
          falhar('Transmissão encerrada.', reason || 'Você parou de transmitir.');
        },
      });

      try {
        const stream = await broadcaster.start();
        
        $(`${fonte}-setup`).hidden = true;
        $(`${fonte}-live`).hidden = false;
        $(`${fonte}-preview`).srcObject = stream;
        $(`${fonte}-preview`).play();
      } catch (err) {
        falhar('Erro ao capturar:', err.message || 'Permissão negada ou navegador sem suporte.');
      }
    },

    async stop(msg) {
      if (!broadcaster) return;
      await broadcaster.stop();
      broadcaster = null;
      $(`${fonte}-live`).hidden = true;
      $(`${fonte}-setup`).hidden = false;
      $(`${fonte}-status`).textContent = msg || 'Parado';
      $(`${fonte}-status`).className = 'status info';
    },

    aplicarQualidade: () => broadcaster?.setQuality({ bitrate: opcoes.bitrate, fps: opcoes.fps }),
    ativo: () => broadcaster?.isRunning?.() ?? false,
    trocarSom: () => broadcaster?.trocarSom?.(),
  };
}

function atenderPedido(fonte) {
  const painel = paineis[fonte];
  if (!painel) return;
  painel.start();
}

// Detectar se está em iframe do Discord (getDisplayMedia não funciona lá)
function inDiscordIframe() {
  try {
    // Discord carrega a Activity em iframe com sandbox
    if (window.self !== window.self.top) return true;
    // Verificar se tem display-capture permitido
    const params = new URLSearchParams(location.search);
    if (params.get('platform') === 'discord') return true;
  } catch {}
  return false;
}

// Init
const payload = token && readTokenPayload();
const missing = supportError({ requireChromium: true });

if (!payload) {
  falhar('Link inválido.', 'Volte à atividade no Discord e clique em compartilhar novamente.');
} else if (payload.exp && payload.exp * 1000 < Date.now()) {
  falhar('Link expirado.', 'Gere um novo pela atividade.');
} else if (missing) {
  falhar('Navegador sem suporte.', missing);
} else if (inDiscordIframe()) {
  falhar('Abra no navegador.', 'O Discord não permite captura de tela dentro do app. Copie este link e abra no Chrome/Edge para transmitir.');
  // Mostrar URL para copiar
  const copyBtn = document.createElement('button');
  copyBtn.textContent = 'Copiar link';
  copyBtn.className = 'btn secondary';
  copyBtn.style.marginTop = '12px';
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(location.href);
    copyBtn.textContent = 'Link copiado!';
  };
  $('pageStatus').after(copyBtn);
} else {
  for (const f of FONTES) paineis[f] = criarPainel(f);

  $('tela-start').addEventListener('click', () => {
    if (paineis.tela.ativo()) paineis.tela.stop();
    else paineis.tela.start();
  });

  $('tela-stop').addEventListener('click', () => paineis.tela.stop());
  $('camera-start').addEventListener('click', () => paineis.camera.start());
  $('camera-stop').addEventListener('click', () => paineis.camera.stop());

  $('qualidade').addEventListener('change', (e) => mudarOpcao('bitrate', e.target.value));
  $('quadros').addEventListener('change', (e) => mudarOpcao('fps', e.target.value));

  espelharOpcoes();

  const pedida = query.get('fonte');
  if (FONTES.includes(pedida)) atenderPedido(pedida);
}