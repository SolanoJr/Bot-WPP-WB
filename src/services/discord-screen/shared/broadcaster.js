import { iceServers, criarPeer, ajustarEnvio, suportaWebRTC, MORTO } from './rtc.js';

export function createBroadcaster({ wsUrl, shareToken, onStatusChange }) {
  // Tentar WebCodecs primeiro (mais eficiente), depois MediaRecorder (funciona em HTTP)
  const hasWebCodecs = typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined';
  const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
  
  console.log(`[Broadcaster] WebCodecs: ${hasWebCodecs}, MediaRecorder: ${hasMediaRecorder}`);
  
  let ws = null;
  let mediaStream = null;
  let videoTrack = null;
  let encoder = null;
  let recorder = null;
  let peer = null;
  let broadcastInterval = null;
  let isBroadcasting = false;

  function connect() {
    if (ws) return;
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      console.log('[Broadcaster] WebSocket conectado');
      onStatuschange?.('connected');
    };
    
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log('[Broadcaster] Mensagem recebida:', msg.type);
        
        if (msg.type === 'viewer-joined' && peer) {
          // Novo espectador - já está no relay
        }
        
        if (msg.type === 'rtc-offer' && msg.peer && msg.payload) {
          answerPeer(msg.peer, msg.payload);
        }
      } catch (e) {
        console.error('[Broadcaster] Erro ao processar mensagem:', e);
      }
    };
    
    ws.onerror = (e) => {
      console.error('[Broadcaster] Erro no WebSocket:', e);
      onStatusChange?.('error');
    };
    
    ws.onclose = () => {
      console.log('[Broadcaster] WebSocket desconectado');
      isBroadcasting = false;
      onStatusChange?.('disconnected');
    };
  }
  
  function answerPeer(peerId, offer) {
    if (!peer) {
      peer = criarPeer({
        onTrack: () => {},
        onDataChannel: () => {},
        onIceCandidate: (candidate) => {
          if (candidate && ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'rtc', peer: peerId, payload: { candidate } }));
          }
        },
      });
    }
    
    const desc = new RTCSessionDescription(offer);
    peer.setRemoteDescription(desc)
      .then(() => peer.createAnswer())
      .then((answer) => {
        peer.setLocalDescription(answer);
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'rtc', peer: peerId, payload: { sdp: answer } }));
        }
      })
      .catch((e) => console.error('[Broadcaster] Erro ao responder peer:', e));
  }
  
  function startBroadcast(stream) {
    mediaStream = stream;
    videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      console.error('[Broadcaster] Nenhuma track de vídeo encontrada');
      return;
    }
    
    connect();
    
    if (hasWebCodecs && !isBroadcasting) {
      startWebCodecsBroadcast();
    } else if (hasMediaRecorder && !isBroadcasting) {
      startMediaRecorderBroadcast();
    } else {
      console.error('[Broadcaster] Nenhum método de transmissão disponível');
      onStatusChange?.('error');
      return;
    }
    
    isBroadcasting = true;
    onStatusChange?.('broadcasting');
  }
  
  function startWebCodecsBroadcast() {
    console.log('[Broadcaster] Iniciando transmissão via WebCodecs');
    
    const settings = videoTrack.getSettings();
    const width = settings.width || 1920;
    const height = settings.height || 1080;
    const fps = settings.framerate || 30;
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    const video = document.createElement('video');
    video.srcObject = mediaStream;
    video.muted = true;
    video.play();
    
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        if (ws?.readyState === WebSocket.OPEN) {
          const buffer = new ArrayBuffer(chunk.byteLength);
          chunk.copyTo(buffer);
          ws.send(JSON.stringify({
            type: 'frame',
            timestamp: chunk.timestamp,
            duration: chunk.duration,
            isKey: chunk.type === 'key',
          }));
          ws.send(buffer);
        }
      },
      error: (e) => {
        console.error('[Broadcaster] Erro no encoder WebCodecs:', e);
        // Fallback para MediaRecorder
        if (hasMediaRecorder && !recorder) {
          console.log('[Broadcaster] Fallback para MediaRecorder');
          startMediaRecorderBroadcast();
        }
      },
    });
    
    encoder.configure({
      codec: 'avc1.42E01E',
      width,
      height,
      bitrate: 2_500_000,
      framerate: fps,
    });
    
    broadcastInterval = setInterval(() => {
      if (video.readyState >= video.HAVE_CURRENT_DATA) {
        ctx.drawImage(video, 0, 0, width, height);
        const frame = new VideoFrame(canvas, { timestamp: performance.now() * 1000 });
        encoder.encode(frame);
        frame.close();
      }
    }, 1000 / fps);
  }
  
  function startMediaRecorderBroadcast() {
    console.log('[Broadcaster] Iniciando transmissão via MediaRecorder');
    
    if (recorder) {
      recorder.stop();
      recorder = null;
    }
    
    // Usar timeslice de 2 segundos para baixa latência
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=h264')
      ? 'video/webm;codecs=h264'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
    
    recorder = new MediaRecorder(mediaStream, {
      mimeType,
      videoBitsPerSecond: 2_500_000,
    });
    
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0 && ws?.readyState === WebSocket.OPEN) {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1];
          ws.send(JSON.stringify({
            type: 'chunk',
            data: base64,
            mimeType,
          }));
        };
        reader.readAsDataURL(event.data);
      }
    };
    
    recorder.onerror = (e) => {
      console.error('[Broadcaster] Erro no MediaRecorder:', e);
      onStatusChange?.('error');
    };
    
    // Coletar dados a cada 2 segundos
    recorder.start(2000);
  }
  
  function stopBroadcast() {
    isBroadcasting = false;
    
    if (broadcastInterval) {
      clearInterval(broadcastInterval);
      broadcastInterval = null;
    }
    
    if (encoder) {
      encoder.close();
      encoder = null;
    }
    
    if (recorder) {
      recorder.stop();
      recorder = null;
    }
    
    if (peer) {
      peer.close();
      peer = null;
    }
    
    if (ws) {
      ws.close();
      ws = null;
    }
    
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    
    videoTrack = null;
    onStatusChange?.('stopped');
  }
  
  return {
    startBroadcast,
    stopBroadcast,
    isBroadcasting: () => isBroadcasting,
  };
}

export function supportError() {
  if (!navigator.mediaDevices?.getDisplayMedia && !navigator.mediaDevices?.getUserMedia) {
    return 'Seu navegador não suporta captura de tela nem câmera.';
  }
  if (!navigator.mediaDevices?.getDisplayMedia) {
    return 'Seu navegador não suporta captura de tela (getDisplayMedia). Use Chrome ou Edge.';
  }
  if (!window.isSecureContext && !isLocalhost()) {
    return 'Seu navegador requer HTTPS para transmitir tela. Acesse via HTTPS ou localhost.';
  }
  return null;
}

export function fonteIndisponivel(fonte) {
  if (fonte === 'tela') {
    return !navigator.mediaDevices?.getDisplayMedia;
  }
  if (fonte === 'camera') {
    return !navigator.mediaDevices?.getUserMedia;
  }
  return false;
}

export function opcoesTela() {
  return {
    video: {
      cursor: 'always',
      displaySurface: 'monitor',
    },
  };
}

function isLocalhost() {
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}
