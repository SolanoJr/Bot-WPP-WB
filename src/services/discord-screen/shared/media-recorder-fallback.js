/**
 * Fallback com MediaRecorder para quando WebCodecs não suportar.
 * Funciona em qualquer navegador com ~200ms de latência.
 */
export function createMediaRecorderBroadcaster(opts) {
  let ws = null;
  let mediaRecorder = null;
  let stream = null;
  let running = false;

  async function start() {
    try {
      stream = opts.streamPronto || await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: opts.fps || 30 },
        audio: opts.audio !== false
      });

      stream.getVideoTracks()[0].addEventListener('ended', () => {
        opts.onEnd?.('Transmissão encerrada pelo navegador.');
      });

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm;codecs=vp8';

      mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: opts.bitrate || 5_000_000
      });

      const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${wsProto}://${location.host}/ws?t=${encodeURIComponent(opts.token)}&fonte=${opts.fonte || 'tela'}`);
      ws.binaryType = 'arraybuffer';

      ws.addEventListener('open', () => {
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0 && ws?.readyState === WebSocket.OPEN) {
            e.data.arrayBuffer().then(buf => ws.send(buf));
          }
        };
        mediaRecorder.start(100);
        running = true;
        opts.onStatus?.({ codec: 'VP8/VP9', width: 1920, height: 1080, direct: false });
      });

      ws.addEventListener('message', (e) => {
        if (typeof e.data !== 'string') return;
        const msg = JSON.parse(e.data);
        if (msg.type === 'state') opts.onStats?.({ viewers: msg.viewers, fps: 0, mbps: 0, seconds: 0 });
      });

      return stream;
    } catch (err) {
      stop();
      throw err;
    }
  }

  function stop() {
    running = false;
    mediaRecorder?.stop();
    stream?.getTracks().forEach(t => t.stop());
    ws?.close();
  }

  return { start, stop };
}
