(() => {
  const onlineBtn    = document.getElementById('online');
  const onlinePanel  = document.getElementById('online-panel');
  const onlineStatus = document.getElementById('online-status');
  const shareBox     = document.getElementById('share');
  const shareLink    = document.getElementById('share-link');
  const copyBtn      = document.getElementById('copy');

  let peer = null;
  let conn = null;
  let icePc = null;
  let iceHandler = null;
  let connectTimer = null;

  const CONNECT_TIMEOUT_MS = 10000;

  Game.setHandlers({
    onLocalMove:  (r, c) => send({ type: 'move', r, c }),
    onLocalReset: ()     => send({ type: 'reset' }),
  });

  function send(msg) {
    if (conn && conn.open) {
      console.info('[online] send', msg);
      conn.send(msg);
    } else {
      console.warn('[online] send dropped (no open conn)', msg);
    }
  }

  function setStatus(text) {
    onlineStatus.textContent = text;
  }

  function showShareLink(id) {
    shareLink.value = `${location.origin}${location.pathname}?join=${id}`;
    shareBox.hidden = false;
  }

  function teardown(statusText) {
    console.info('[online] teardown:', statusText);
    Game.setConnected(false);
    Game.setLocalPlayer(null);
    setStatus(statusText);
    shareBox.hidden = true;
    onlineBtn.disabled = false;
    onlineBtn.hidden = false;
    if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
    if (icePc && iceHandler) {
      icePc.removeEventListener('iceconnectionstatechange', iceHandler);
    }
    icePc = null;
    iceHandler = null;
    if (peer) { peer.destroy(); peer = null; }
    conn = null;
    if (new URLSearchParams(location.search).has('join')) {
      history.replaceState(null, '', location.pathname);
    }
  }

  function setupConn(c) {
    conn = c;
    c.on('data', (msg) => {
      console.info('[online] recv', msg);
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'move')       Game.applyRemoteMove(msg.r, msg.c);
      else if (msg.type === 'reset') Game.applyRemoteReset();
    });
    c.on('open', () => {
      console.info('[online] data channel open with', c.peer);
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
      Game.setConnected(true);
      setStatus('Connected — playing online');
      shareBox.hidden = true;
      onlineBtn.hidden = true;
      Game.startMatch();

      // ICE state changes detect remote disconnect within seconds;
      // conn.on('close') alone relies on a slow PeerJS heartbeat timeout.
      const pc = c.peerConnection;
      if (pc) {
        icePc = pc;
        iceHandler = () => {
          const s = pc.iceConnectionState;
          console.info('[online] ICE state:', s);
          if (s === 'disconnected' || s === 'failed' || s === 'closed') {
            teardown('Disconnected');
          }
        };
        pc.addEventListener('iceconnectionstatechange', iceHandler);
      }
    });
    c.on('error', (e) => {
      console.error('[online] data channel error', e);
      teardown('Connection error');
    });
  }

  function startHost() {
    console.info('[online] startHost');
    onlinePanel.hidden = false;
    onlineBtn.disabled = true;
    setStatus('Setting up…');

    peer = new Peer();
    peer.on('open', (id) => {
      console.info(`[online] host peer open, id=${id}`);
      Game.setLocalPlayer(1);
      showShareLink(id);
      setStatus('Share the link below — waiting for opponent…');
    });
    peer.on('connection', (c) => {
      console.info('[online] incoming connection from', c.peer);
      setupConn(c);
    });
    peer.on('error', (e) => {
      console.error('[online] host peer error', e);
      teardown(`Error: ${e.type || e.message || 'unknown'}`);
    });
  }

  function startGuest(hostId) {
    console.info(`[online] startGuest, hostId=${hostId}`);
    onlinePanel.hidden = false;
    onlineBtn.hidden = true;
    setStatus('Connecting…');
    Game.setLocalPlayer(2);

    peer = new Peer();
    peer.on('open', () => {
      console.info('[online] guest peer open, connecting to host');
      setupConn(peer.connect(hostId, { reliable: true }));
      connectTimer = setTimeout(() => {
        console.warn('[online] guest connect timed out');
        teardown('Connection timed out — host may be offline');
      }, CONNECT_TIMEOUT_MS);
    });
    peer.on('error', (e) => {
      console.error('[online] guest peer error', e);
      teardown(`Error: ${e.type || e.message || 'unknown'}`);
    });
  }

  onlineBtn.addEventListener('click', startHost);
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareLink.value);
      copyBtn.textContent = 'Copied!';
      setTimeout(() => (copyBtn.textContent = 'Copy'), 1500);
    } catch {
      shareLink.select();
    }
  });

  const joinId = new URLSearchParams(location.search).get('join');
  if (joinId) startGuest(joinId);
})();
