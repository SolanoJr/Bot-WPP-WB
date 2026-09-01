import { iceServers, criarPeer, ajustarEnvio, suportaWebRTC, MORTO } from './rtc.js';

/**
 * Pipeline de transmissão: captura → codifica → envia.
 * 
 * Duas implementações em um arquivo:
 * - WebCodecs (preferencial): baixa latência, mais eficiente
 * - MediaRecorder (fallback): funciona em HTTP e no Discord Activity
 * 
 * O broadcaster tenta WebCodecs primeiro. Se não estiver disponível
 * (navegador sem suporte ou contexto inseguro), cai no MediaRecorder.
 */

const TIPO_KEYFRAME = 1;
const TIPO_DELTA = 2;
const TIPO_AUDIO = 3;

export function supportError({ requireChromium = false } = {}) {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    return 'Seu navegador não suporta captura de tela. Use Chrome/Edge.';
  }
  
  const hasWebCodecs = window.VideoEncoder && window.VideoFrame && window.EncodedVideoChunk;
  if (!hasWebCodecs) {
    // Não falha — vai usar MediaRecorder
    console.log('[broadcaster] WebCodecs não disponível, usando MediaRecorder fallback');
  }
  
  return null;
}

export async function opcoesTela({ fps = 30, comSom = false, video } = {}) {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: video || { cursor: 'always' },
      audio: comSom
    });
    return stream;
  } catch {
    return null;
  }
}

export function fonteIndisponivel(fonte) {
  if (fonte === 'camera') return 'Câmera não suportada neste navegador.';
  return null;
}

export function createBroadcaster({
  wsUrl,
  bitrate = 2_500_000,
  fps = 30,
  audio = false,
  fonte = 'tela',
  streamPronto = null,
  deviceId = null,
  onStatus,
  onStats,
  onEnd,
  onAviso,
}) {
  let ws = null;
  let stream = null;
  let encoder = null;
  let recorder = null;
  let statsTimer = null;
  let running = false;
  let startedAt = 0;
  let bytes = 0;
  let frames = 0;
  let viewers = 0;

  const hasWebCodecs = !!(window.VideoEncoder && window.VideoFrame && window.EncodedVideoChunk);
  // Usar MediaRecorder como padrão para compatibilidade com o viewer via MediaSource.
  // WebCodecs continua disponível, mas requer transmuxing H.264→WebM no viewer.
  const useWebCodecs = false; // hasWebCodecs;

  function cleanup() {
    if (statsTimer) { clearInterval(statsTimer); statsTimer = null; }
    if (encoder) { try { encoder.close(); } catch {} encoder = null; }
    if (recorder) { try { recorder.stop(); } catch {} recorder = null; }
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (ws) { ws.close(); ws = null; }
  }

  function stop(reason) {
    if (!running) return;
    running = false;
    cleanup();
    onEnd?.(reason ?? '');
  }

  let reconnectCount = 0;
  const MAX_RECONNECT = 5;

  async function connect() {
    return new Promise((resolve, reject) => {
      console.log(`[broadcaster] Conectando ao WebSocket (tentativa ${reconnectCount + 1}/${MAX_RECONNECT}):`, wsUrl);
      const attemptWs = new WebSocket(wsUrl);
      let settled = false;
      attemptWs.binaryType = 'arraybuffer';
      attemptWs.onopen = () => {
        console.log('[broadcaster] WebSocket aberto');
        ws = attemptWs;
        reconnectCount = 0;
        // binding de eventos pós-open fica no ws principal
        ws.onclose = (e) => {
          console.log('[broadcaster] WebSocket fechado:', e.code, e.reason || '(sem reason)', 'running=', running);
          if (running) {
            if (reconnectCount < MAX_RECONNECT) {
              reconnectCount++;
              const delay = Math.min(1000 * Math.pow(2, reconnectCount -1), 10000);
              console.log(`[broadcaster] Reconectando em ${delay}ms...`);
              setTimeout(() => connect().then(startAfterConnect).catch((err) => stop('Conexão com o servidor caiu. ' + (err?.message||''))), delay);
            } else {
              stop('Conexão com o servidor caiu.');
            }
          }
        };
        ws.onerror = (e) => {
          console.error('[broadcaster] Erro no WebSocket (pós-open):', e);
        };
        // Mensagens do servidor (slot, state, need-keyframe, chunks)
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'slot') console.log('[broadcaster] slot', msg.slot);
            else if (msg.type === 'need-keyframe') console.log('[broadcaster] need-keyframe');
            else if (msg.type === 'chunks') console.log('[broadcaster] chunks', msg.on ? 'on' : 'off');
            else if (msg.type === 'state') {
              // Atualiza contador local de espectadores
              if (typeof msg.viewers === 'number') viewers = msg.viewers;
              console.log('[broadcaster] state viewers', viewers);
            }
            else if (msg.type === 'error') { console.error('[broadcaster] erro do servidor:', msg.message); stop(msg.message); }
            else console.log('[broadcaster] msg', msg.type);
          } catch {}
        };
        settled = true;
        resolve();
      };
      attemptWs.onerror = (e) => {
        console.error('[broadcaster] Erro no WebSocket (tentativa):', e);
        if (!settled) { settled = true; reject(e); }
      };
      attemptWs.onclose = (e) => {
        if (!settled) {
          console.log('[broadcaster] Fechado antes de abrir:', e.code, e.reason);
          settled = true;
          reject(new Error(`WS fechado antes de abrir: ${e.code} ${e.reason||''}`));
        }
      };
    });
  }

  async function startAfterConnect() {
    try {
      ws.send(JSON.stringify({
        type: 'config',
        config: {
          codec: useWebCodecs ? 'avc1.640028' : 'video/webm;codecs=vp9',
          mimeType: useWebCodecs ? 'video/mp4;codecs="avc1.640028"' : 'video/webm;codecs=vp9',
        },
      }));

      running = true;
      startedAt = Date.now();

      if (useWebCodecs) {
        await startWebCodecs(stream);
        onStatus?.({ codec: 'webcodecs', width: 1920, height: 1080 });
      } else {
        await startMediaRecorder(stream);
        onStatus?.({ codec: 'mediarecorder' });
      }

      ws.send(JSON.stringify({ type: 'start' }));

      // Heartbeat para manter a conexão viva
      const heartbeat = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        } else {
          clearInterval(heartbeat);
        }
      }, 10000);

      statsTimer = setInterval(() => {
        onStats?.({
          viewers,
          fps: frames,
          mbps: (bytes * 8) / 1e6,
          seconds: Math.floor((Date.now() - startedAt) / 1000),
        });
        bytes = 0;
        frames = 0;
      }, 1000);

      return stream;
    } catch (err) {
      cleanup();
      throw err;
    }
  }

  // Implementação WebCodecs
  async function startWebCodecs(stream) {
    const width = 1920;
    const height = 1080;

    // Tentar codecs H.264 do mais preferencial ao menos.
    // Formato: avc1.<profile><constraint><level>
    const codecCandidates = [
      'avc1.640028', // High, Level 4.0
      'avc1.64002A', // High, Level 4.2
      'avc1.640032', // High, Level 5.0
      'avc1.64001F', // High, Level 3.1
      'avc1.64001E', // High, Level 3.0
      'avc1.4D401E', // Main, Level 3.0
      'avc1.42C01E', // Baseline, Level 3.0
    ];

    let codec = null;
    let config = null;

    for (const candidate of codecCandidates) {
      try {
        config = {
          codec: candidate,
          width,
          height,
          bitrate,
          framerate: fps,
          latencyMode: 'realtime',
        };

        const result = await VideoEncoder.isConfigSupported(config);
        if (result?.supported) {
          codec = candidate;
          console.log(`[broadcaster] Codec suportado: ${candidate}`);
          break;
        }
      } catch (err) {
        console.log(`[broadcaster] Codec ${candidate} não suportado:`, err.message);
      }
    }

    if (!codec) {
      throw new Error('Nenhum codec H.264 suportado encontrado');
    }

    const onEncoded = (chunk) => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const buf = new ArrayBuffer(chunk.byteLength);
      chunk.copyTo(buf);
      
      // Empacotar: [slot(1), tipo(1), timestamp(8), dados]
      const packet = new Uint8Array(1 + 1 + 8 + buf.byteLength);
      packet[0] = 0; // slot
      packet[1] = chunk.type === 'key' ? TIPO_KEYFRAME : TIPO_DELTA;
      const view = new DataView(packet.buffer);
      view.setFloat64(2, chunk.timestamp || Date.now(), false);
      packet.set(new Uint8Array(buf), 10);
      
      ws.send(packet);
      bytes += buf.byteLength;
      frames++;
    };

    encoder = new VideoEncoder({
      output: onEncoded,
      error: (err) => stop(`Erro no encoder: ${err.message}`),
    });

    encoder.configure(config);

    // Capturar frames da tela usando canvas + requestFrame
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const video = document.createElement('video');
    video.srcObject = stream;
    video.play();

    let frameCount = 0;
    const processFrame = () => {
      if (!running) return;
      ctx.drawImage(video, 0, 0, width, height);
      const frame = new VideoFrame(canvas, { timestamp: frameCount * 1_000_000 / fps });
      encoder.encode(frame);
      frame.close();
      frameCount++;
      requestAnimationFrame(processFrame);
    };

    requestAnimationFrame(processFrame);
  }

  // Implementação MediaRecorder (fallback)
  async function startMediaRecorder(stream) {
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8'
        : 'video/webm';

    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: bitrate,
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0 && ws && ws.readyState === WebSocket.OPEN) {
        e.data.arrayBuffer().then((buf) => {
          // Empacotar: [slot(1), tipo(1), timestamp(8), dados]
          const packet = new Uint8Array(1 + 1 + 8 + buf.byteLength);
          packet[0] = 0; // slot
          packet[1] = TIPO_DELTA;
          const view = new DataView(packet.buffer);
          view.setFloat64(2, Date.now(), false);
          packet.set(new Uint8Array(buf), 10);
          
          ws?.send(packet);
          bytes += buf.byteLength;
          frames++;
        });
      }
    };

    recorder.start(1000); // Coletar a cada 1 segundo
  }

  async function start() {
    try {
      stream = streamPronto ?? await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: audio,
      });

      const track = stream.getVideoTracks()[0];
      track.addEventListener('ended', () => stop('Você parou o compartilhamento pelo navegador.'));

      await connect();
      await startAfterConnect();

      return stream;
    } catch (err) {
      cleanup();
      throw err;
    }
  }

  return {
    start,
    stop,
    isRunning: () => running,
    setQuality: ({ bitrate: newBitrate, fps: newFps } = {}) => {
      if (encoder && running) {
        encoder.configure({
          codec: encoder.codec,
          width: encoder.width,
          height: encoder.height,
          bitrate: newBitrate || bitrate,
          framerate: newFps || fps,
        });
      }
    },
    getStats: () => ({ viewers, fps: frames, mbps: (bytes * 8) / 1e6, seconds: Math.floor((Date.now() - startedAt) / 1000) }),
    trocarSom: () => {},
  };
}