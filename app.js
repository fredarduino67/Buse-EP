(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const N = 400; // taille d'analyse
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  };
  let mirror = store.get('buse.mirror', false);
  let descs = store.get('buse.descs', {});

  /* ---------- navigation ---------- */
  document.querySelectorAll('nav button').forEach(b => b.onclick = () => show(b.dataset.v));
  function show(v) {
    document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.id === v));
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v || (v === 'v-photo' && b.dataset.v === 'v-scan')));
    if (v !== 'v-scan') setAuto(false);
    if (v === 'v-list') buildGrid();
  }

  /* ---------- dessin d'un code (SVG) ---------- */
  function codeSvg(n, size) {
    const s = BuseCore.slotsFromCode(n);
    let h = `<svg viewBox="-110 -110 220 220" width="${size || 84}" height="${size || 84}"><circle r="100" fill="#c4c8ce" stroke="#77808a" stroke-width="3"/><circle r="27" fill="#0d1b2e"/>`;
    const pos = k => { const a = (mirror ? -1 : 1) * k * 45 * Math.PI / 180; return [70 * Math.sin(a), -70 * Math.cos(a)]; };
    const [x0, y0] = pos(0); h += `<circle cx="${x0}" cy="${y0}" r="8" fill="#111"/>`;
    s.forEach((on, i) => { if (on) { const [x, y] = pos(i + 1); h += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14" fill="#111"/>`; } });
    return h + '</svg>';
  }

  /* ---------- lecture ---------- */
  const work = document.createElement('canvas'); work.width = work.height = N;
  const wctx = work.getContext('2d', { willReadFrequently: true });
  function grab(src, cx, cy, half) {
    wctx.fillStyle = '#808080'; wctx.fillRect(0, 0, N, N);
    wctx.drawImage(src, cx - half, cy - half, 2 * half, 2 * half, 0, 0, N, N);
    const d = wctx.getImageData(0, 0, N, N).data, g = new Uint8Array(N * N);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (d[j] * 77 + d[j + 1] * 150 + d[j + 2] * 29) >> 8;
    return g;
  }
  function readAround(src, cx, cy, halves) {
    const res = [];
    for (const half of halves) {
      if (half < 8) continue;
      const g = grab(src, cx, cy, half);
      const r = BuseCore.analyse(g, N, N, { mirror });
      r.half = half; r.cx = cx; r.cy = cy;
      res.push(r);
    }
    const ok = res.filter(r => r.ok);
    if (!ok.length) {
      const best = res.sort((a, b) => (b.score || -1e9) - (a.score || -1e9))[0];
      return { ok: false, best, tries: res.length };
    }
    const votes = {};
    ok.forEach(r => { votes[r.numero] = (votes[r.numero] || 0) + 1; });
    const nums = Object.keys(votes).sort((a, b) => votes[b] - votes[a]);
    const win = +nums[0];
    const best = ok.filter(r => r.numero === win).sort((a, b) => a.err - b.err)[0];
    return { ok: true, numero: win, best, votes, n: ok.length, tries: res.length, conflict: nums.length > 1 };
  }

  function showResult(src, R) {
    const card = $('result'), num = $('resNum'), desc = $('resDesc'), info = $('resInfo');
    num.className = 'res-num ' + (R.ok ? 'ok' : 'bad');
    if (R.ok) {
      num.textContent = 'N° ' + R.numero;
      desc.textContent = descs[R.numero] || '';
      const others = Object.keys(R.votes).filter(k => +k !== R.numero);
      info.textContent = others.length ? `Attention : lecture hésitante (aussi N° ${others.join(', ')}). Relisez.` : R.n >= 2 ? `Lecture sûre (${R.n}/${R.tries})` : 'Lecture à confirmer : relisez une fois.';
      try { navigator.vibrate && navigator.vibrate(60); } catch (e) { }
    } else {
      num.textContent = 'Lecture impossible';
      desc.textContent = '';
      info.textContent = (R.best && R.best.message ? R.best.message + '. ' : '') + 'Bien de face, plus près, plus de lumière, ou utilisez « Manuel ».';
    }
    // image avec les points trouvés
    const cv = $('resCv'), c = cv.getContext('2d'), b = R.best;
    c.fillStyle = '#000'; c.fillRect(0, 0, 300, 300);
    if (b && b.half) {
      c.drawImage(src, b.cx - b.half, b.cy - b.half, 2 * b.half, 2 * b.half, 0, 0, 300, 300);
      const k = 300 / N, vals = ['départ', '1', '2', '4', '8', '16', '32', 'C'];
      (b.points || []).forEach(p => {
        c.strokeStyle = p.k === 0 ? '#ffd23f' : '#2ecc71'; c.lineWidth = 3;
        c.beginPath(); c.arc(p.x * k, p.y * k, Math.max(6, p.r * k + 3), 0, 7); c.stroke();
        c.font = 'bold 15px sans-serif'; c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 3;
        const t = p.k === 0 ? '▲' : vals[p.k]; c.strokeText(t, p.x * k + 12, p.y * k - 8); c.fillText(t, p.x * k + 12, p.y * k - 8);
      });
    }
    card.classList.remove('hidden');
  }
  $('resClose').onclick = () => $('result').classList.add('hidden');

  /* ---------- caméra + loupe ---------- */
  const video = document.createElement('video');
  video.setAttribute('playsinline', ''); video.muted = true;
  const loupe = $('loupe'), lctx = loupe.getContext('2d');
  let stream = null, zoom = +$('zoom').value;
  $('zoom').oninput = e => { zoom = +e.target.value; $('zoomVal').textContent = '×' + zoom; store.set('buse.zoom', zoom); };
  zoom = store.get('buse.zoom', zoom); $('zoom').value = zoom; $('zoomVal').textContent = '×' + zoom;

  async function startCam() {
    if (stream) return true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } } });
      video.srcObject = stream; await video.play();
      $('camMsg').style.display = 'none'; $('btnCam').textContent = 'Arrêter';
      requestAnimationFrame(draw);
      return true;
    } catch (e) {
      $('camMsg').textContent = 'Caméra non disponible (' + e.name + '). Autorisez la caméra, ou utilisez « Photo ».';
      $('camMsg').style.display = 'flex';
      return false;
    }
  }
  function stopCam() {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null; setAuto(false);
    $('btnCam').textContent = 'Caméra'; $('camMsg').textContent = 'Touchez « Caméra » pour démarrer'; $('camMsg').style.display = 'flex';
    lctx.fillStyle = '#000'; lctx.fillRect(0, 0, loupe.width, loupe.height);
  }
  function region() { // zone vidéo affichée dans la loupe
    const vw = video.videoWidth, vh = video.videoHeight, side = Math.min(vw, vh) / zoom;
    return { cx: vw / 2, cy: vh / 2, side };
  }
  function draw() {
    if (!stream) return;
    if (video.videoWidth) {
      const r = region();
      lctx.drawImage(video, r.cx - r.side / 2, r.cy - r.side / 2, r.side, r.side, 0, 0, loupe.width, loupe.height);
    }
    requestAnimationFrame(draw);
  }
  function liveRead() {
    if (!video.videoWidth) return null;
    const r = region(), guideHalf = r.side * 0.4; // cercle guide = 80 % de la loupe
    return readAround(video, r.cx, r.cy, [guideHalf * 1.05, guideHalf * 1.3, guideHalf * 1.6, guideHalf * 2]);
  }
  function snapshot() { // image figée de la vidéo pour l'affichage du résultat
    const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0); return c;
  }
  $('btnCam').onclick = () => stream ? stopCam() : startCam();
  $('btnRead').onclick = async () => {
    if (!stream && !(await startCam())) return;
    if (!video.videoWidth) await new Promise(r => setTimeout(r, 500));
    const snap = snapshot();
    const r = region(), guideHalf = r.side * 0.4;
    showResult(snap, readAround(snap, r.cx, r.cy, [guideHalf * 1.05, guideHalf * 1.3, guideHalf * 1.6, guideHalf * 2]));
  };

  // lecture automatique : même numéro 3 fois de suite
  let autoTimer = null, lastNum = null, same = 0;
  function setAuto(on) {
    if (on === !!autoTimer) return;
    if (on) {
      autoTimer = setInterval(() => {
        if ($('result').classList.contains('hidden') === false) return;
        const R = liveRead();
        if (R && R.ok && !R.conflict) {
          same = R.numero === lastNum ? same + 1 : 1; lastNum = R.numero;
          if (same >= 3) { same = 0; lastNum = null; const snap = snapshot(); const rg = region(), gh = rg.side * 0.4; showResult(snap, readAround(snap, rg.cx, rg.cy, [gh * 1.05, gh * 1.3, gh * 1.6, gh * 2])); }
        } else { same = 0; lastNum = null; }
      }, 300);
    } else { clearInterval(autoTimer); autoTimer = null; }
    $('btnAuto').textContent = 'Auto : ' + (autoTimer ? 'oui' : 'non');
    $('btnAuto').classList.toggle('on-auto', !!autoTimer);
  }
  $('btnAuto').onclick = async () => { if (!autoTimer && !(await startCam())) return; setAuto(!autoTimer); };

  /* ---------- photo ---------- */
  let photo = null;
  const pcv = $('photoCv');
  $('photoIn').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image();
    img.onload = () => {
      photo = img;
      pcv.width = img.naturalWidth; pcv.height = img.naturalHeight;
      pcv.getContext('2d').drawImage(img, 0, 0);
      show('v-photo');
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
    e.target.value = '';
  };
  pcv.addEventListener('click', e => {
    if (!photo) return;
    const b = pcv.getBoundingClientRect();
    const x = (e.clientX - b.left) * pcv.width / b.width, y = (e.clientY - b.top) * pcv.height / b.height;
    const m = Math.min(pcv.width, pcv.height);
    const halves = [0.03, 0.04, 0.055, 0.075, 0.1, 0.13, 0.17, 0.22].map(f => f * m);
    showResult(photo, readAround(photo, x, y, halves));
  });
  $('btnBack').onclick = () => show('v-scan');

  /* ---------- saisie manuelle ---------- */
  const man = new Array(7).fill(false);
  function buildMan() {
    const svg = $('manSvg');
    const pos = k => { const a = (mirror ? -1 : 1) * k * 45 * Math.PI / 180; return [70 * Math.sin(a), -70 * Math.cos(a)]; };
    let h = '<circle r="100" fill="#c4c8ce" stroke="#77808a" stroke-width="3"/><circle r="27" fill="#0d1b2e"/>';
    const [x0, y0] = pos(0); h += `<circle cx="${x0}" cy="${y0}" r="8" fill="#111"/>`;
    for (let k = 1; k <= 7; k++) {
      const [x, y] = pos(k);
      h += `<circle class="slot" data-k="${k}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="15" fill="${man[k - 1] ? '#111' : 'transparent'}" stroke="#55606c" stroke-width="2" stroke-dasharray="${man[k - 1] ? '0' : '4 3'}"/>`;
    }
    svg.innerHTML = h;
    svg.querySelectorAll('.slot').forEach(el => el.onclick = () => { const k = +el.dataset.k; man[k - 1] = !man[k - 1]; buildMan(); });
    const r = BuseCore.codeFromSlots(man), cnt = man.filter(Boolean).length;
    const out = $('manRes');
    if (!cnt) out.innerHTML = '—';
    else if (r.controleOK) out.innerHTML = `N° ${r.numero}<small>${escapeHtml(descs[r.numero] || '')}</small>`;
    else out.innerHTML = `<span style="color:var(--bad)">Code impossible</span><small>Vérifiez les points (le nombre de gros points est toujours pair).</small>`;
  }
  $('manClear').onclick = () => { man.fill(false); buildMan(); };

  /* ---------- liste ---------- */
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function buildGrid() {
    const q = $('search').value.trim().toLowerCase();
    let h = '';
    for (let n = 1; n <= 63; n++) {
      const d = descs[n] || '';
      if (q && !String(n).startsWith(q) && !d.toLowerCase().includes(q)) continue;
      h += `<div class="item">${codeSvg(n)}<b>N° ${n}</b><input data-n="${n}" value="${escapeHtml(d)}" placeholder="description"></div>`;
    }
    $('grid').innerHTML = h || '<p class="hint">Aucun résultat.</p>';
    $('grid').querySelectorAll('input').forEach(inp => inp.onchange = () => {
      const v = inp.value.trim(); if (v) descs[inp.dataset.n] = v; else delete descs[inp.dataset.n];
      store.set('buse.descs', descs);
    });
  }
  $('search').oninput = buildGrid;

  /* ---------- réglages ---------- */
  document.querySelectorAll('input[name=dir]').forEach(r => {
    r.checked = (+r.value === 1) === mirror;
    r.onchange = () => { mirror = r.value === '1'; store.set('buse.mirror', mirror); buildMan(); };
  });
  $('btnExport').onclick = () => {
    const blob = new Blob([JSON.stringify(descs, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'buse-ep-descriptions.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('importIn').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => { try { const o = JSON.parse(t); if (o && typeof o === 'object') { descs = o; store.set('buse.descs', descs); alertMsg('Descriptions importées.'); } } catch (er) { alertMsg('Fichier non valide.'); } });
    e.target.value = '';
  };
  function alertMsg(t) { $('resNum').className = 'res-num'; $('resNum').textContent = ''; $('resDesc').textContent = t; $('resInfo').textContent = ''; $('resCv').getContext('2d').clearRect(0, 0, 300, 300); $('result').classList.remove('hidden'); }

  buildMan();
  lctx.fillStyle = '#000'; lctx.fillRect(0, 0, loupe.width, loupe.height);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopCam(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
})();
