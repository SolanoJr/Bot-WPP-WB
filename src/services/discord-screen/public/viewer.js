(function() {
  var $ = function(id) { return document.getElementById(id); };
  var query = new URLSearchParams(location.search);
  var token = query.get('t');

  function setStatus(id, text, type) {
    var el = $(id);
    if (el) { el.textContent = text; el.className = 'status ' + (type || ''); }
  }
  function fail(title, msg) {
    $('viewer-setup').hidden = true;
    setStatus('pageStatus', title + ' ' + msg, 'error');
    console.log('[viewer] ' + title + ' ' + msg);
  }

  if (!token) {
    fail('Link inválido.', 'Volte ao Discord e peça um novo link.');
  } else {
    var parts = token.split('.');
    if (parts.length !== 6) {
      fail('Token inválido.', 'Formato incorreto.');
    } else if (parseInt(parts[4], 10) < Math.floor(Date.now() / 1000)) {
      fail('Link expirado.', 'Peça um novo.');
    } else {
      var proto = location.protocol === 'https:' ? 'wss' : 'ws';
      var wsUrl = proto + '://' + location.host + '/ws?t=' + encodeURIComponent(token) + '&fonte=tela';
      
      var ws = null;
      var reconnectTimer = null;
      var mediaSource = null;
      var sourceBuffer = null;
      var queue = [];
      var startedAt = 0;
      var currentCodec = null;
      var watchingSlot = null;
      var roomGone = false;

      function connect() {
        if (roomGone) return;
        ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';
        
        ws.onopen = function() {
          console.log('[viewer] Conectado');
          setStatus('pageStatus', '🟢 Conectado — aguardando transmissão...', 'success');
          // Não faz watch aqui — servidor ignora se !streaming. Espera stream-start/config.
        };

        ws.onmessage = function(e) {
          if (e.data instanceof ArrayBuffer) {
            // Header do relay: [slot(1), tipo(1), timestamp(8)] = 10 bytes
            // MediaSource precisa só do payload WebM
            var payload = e.data.byteLength > 10 ? e.data.slice(10) : e.data;
            appendToSourceBuffer(payload);
            return;
          }
          
          try {
            var msg = JSON.parse(e.data);
            console.log('[viewer] Mensagem recebida:', msg.type, msg);
            
            if (msg.type === 'room-gone') {
              roomGone = true;
              console.log('[viewer] Sala encerrada pelo servidor');
              setStatus('pageStatus', '⚪ Sala encerrada — peça um novo link', 'error');
              try { ws.close(); } catch(_){}
              return;
            }
            if (msg.type === 'config') {
              console.log('[viewer] Config recebida:', msg.config);
              currentCodec = msg.config?.mimeType || msg.config?.codec || null;
              // Normaliza: servidor manda "video/webm;codecs=vp9" sem audio, MediaSource precisa com audio ou sem
              if (currentCodec && currentCodec.indexOf('video/webm') === 0) {
                if (currentCodec.indexOf('vorbis') === -1 && currentCodec.indexOf('opus') === -1) {
                  // MediaRecorder foi sem audio, só video
                  currentCodec = currentCodec;
                }
              }
              if (!mediaSource) initMediaSource(currentCodec);
              // Se já recebemos stream-start mas ainda não fizemos watch, faz agora
              if (watchingSlot !== null && msg.slot === watchingSlot) {
                // já assistindo
              }
            } else if (msg.type === 'stream-start') {
              console.log('[viewer] Stream iniciado slot', msg.slot);
              $('viewer-setup').hidden = true;
              $('viewer-live').hidden = false;
              setStatus('pageStatus', '🔴 Ao vivo', 'success');
              startedAt = Date.now();
              if (!mediaSource) initMediaSource(currentCodec || 'video/webm;codecs=vp9');
              // Solicita o stream — só agora o servidor aceita (streaming=true)
              watchingSlot = msg.slot;
              try { ws.send(JSON.stringify({ type: 'watch', slot: msg.slot })); } catch(_){}
              console.log('[viewer] Enviado watch slot', msg.slot);
            } else if (msg.type === 'stream-stop') {
              console.log('[viewer] Stream parado');
              setStatus('pageStatus', '⚪ Transmissão encerrada', 'info');
              $('viewer-live').hidden = true;
              $('viewer-setup').hidden = false;
              watchingSlot = null;
            } else if (msg.type === 'state') {
              // Lista de streams ativas — se já tem stream mas ainda não assistimos
              if (msg.streams && msg.streams.length && watchingSlot === null) {
                var s = msg.streams[0];
                console.log('[viewer] state com streams', s);
                // se mediaSource ainda não pronto, espera config/stream-start
              }
            }
          } catch (err) {
            console.log('[viewer] Erro ao processar mensagem:', err);
          }
        };

        ws.onerror = function() {
          console.log('[viewer] Erro no WebSocket');
          setStatus('pageStatus', '❌ Erro de conexão', 'error');
        };

        ws.onclose = function(ev) {
          console.log('[viewer] WebSocket fechado', ev.code, ev.reason);
          if (roomGone) return;
          setStatus('pageStatus', '⚪ Desconectado — reconectando...', 'info');
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connect, 3000);
        };
      }

      function initMediaSource(codec) {
        console.log('[viewer] Inicializando MediaSource com codec:', codec);
        if (!('MediaSource' in window)) {
          setStatus('pageStatus', '❌ Navegador não suporta MediaSource', 'error');
          return;
        }
        if (mediaSource) return;
        mediaSource = new MediaSource();
        var video = $('viewer-preview');
        // garante muted antes do play (autoplay policy)
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.addEventListener('loadedmetadata', function(){ console.log('[viewer] video loadedmetadata', video.videoWidth, video.videoHeight); });
        video.addEventListener('playing', function(){ console.log('[viewer] video playing'); });
        video.addEventListener('error', function(){ console.log('[viewer] video error', video.error); });
        video.src = URL.createObjectURL(mediaSource);

        mediaSource.addEventListener('sourceopen', function() {
          console.log('[viewer] MediaSource aberto');
          var candidates = [];
          if (codec) candidates.push(codec);
          candidates.push('video/webm;codecs=vp9');
          candidates.push('video/webm;codecs=vp8');
          candidates.push('video/webm');
          var mimeType = null;
          for (var i=0;i<candidates.length;i++) {
            if (MediaSource.isTypeSupported(candidates[i])) { mimeType = candidates[i]; break; }
          }
          if (!mimeType) { setStatus('pageStatus','❌ Codec não suportado','error'); return; }
          try {
            sourceBuffer = mediaSource.addSourceBuffer(mimeType);
            sourceBuffer.mode = 'segments';
            sourceBuffer.addEventListener('updateend', function() {
              console.log('[viewer] updateend buffered', sourceBuffer.buffered.length ? (sourceBuffer.buffered.end(0)-sourceBuffer.buffered.start(0)).toFixed(2)+'s' : '0', 'queue', queue.length);
              if (queue.length > 0 && !sourceBuffer.updating) {
                try { 
                  var next = queue.shift();
                  console.log('[viewer] append queued', next.byteLength);
                  sourceBuffer.appendBuffer(next); 
                } catch(e){ console.log('[viewer] append queued err', e.message); }
              }
              // garante play após ter dados
              if (video.paused) video.play().catch(function(e){ console.log('[viewer] play err', e.message); });
            });
            sourceBuffer.addEventListener('error', function(e){ console.log('[viewer] SourceBuffer error', e); });
            console.log('[viewer] SourceBuffer criado com:', mimeType);
            // drena fila
            while (queue.length && !sourceBuffer.updating) {
              try { 
                var q = queue.shift();
                console.log('[viewer] drain', q.byteLength);
                sourceBuffer.appendBuffer(q); 
              } catch(e){ console.log('[viewer] drain err', e.message); break; }
            }
            // tenta tocar
            video.play().catch(function(e){ console.log('[viewer] play err', e.message); });
          } catch (e) {
            console.log('[viewer] Erro ao criar SourceBuffer com', mimeType, ':', e.message);
            setStatus('pageStatus', '❌ Erro no player: ' + e.message, 'error');
          }
        });
        mediaSource.addEventListener('sourceended', function(){ console.log('[viewer] MediaSource ended'); });
        mediaSource.addEventListener('error', function(e){ console.log('[viewer] MediaSource error', e); });
      }

      function appendToSourceBuffer(data) {
        // log só primeiro e a cada 30 appends pra não floodar
        appendToSourceBuffer._c = (appendToSourceBuffer._c||0)+1;
        if (appendToSourceBuffer._c===1 || appendToSourceBuffer._c%30===0) console.log('[viewer] append', data.byteLength, 'bytes, sb', sourceBuffer? (sourceBuffer.updating?'updating':'ready') : 'no-sb', 'queue', queue.length);
        if (!sourceBuffer || sourceBuffer.updating) {
          // se ainda não temos SourceBuffer, enfileira até 5MB
          if (queue.length < 80) queue.push(data);
          else console.log('[viewer] queue drop');
          return;
        }
        // Evita estouro: se buffered > 30s, remove início
        try {
          if (mediaSource.duration && video.buffered.length) {
            // remove antigo se muito grande
          }
        } catch(_){}
        try {
          sourceBuffer.appendBuffer(data);
        } catch (e) {
          // Buffer cheio (QuotaExceeded) — remove 5s do início e tenta de novo
          try {
            if (sourceBuffer.buffered.length) {
              var start = sourceBuffer.buffered.start(0);
              sourceBuffer.remove(start, start + 5);
              queue.unshift(data);
            }
          } catch(_){}
        }
      }

      connect();
    }
  }
})();
