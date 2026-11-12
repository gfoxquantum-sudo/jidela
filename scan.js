/* 記得啦 — 掃電子發票，自動建立保固與退換貨期限
   台灣電子發票證明聯上有兩個 QR Code（財政部規格）：
   左邊：發票號碼(10) 日期(7, 民國 yyyMMdd) 隨機碼(4) 銷售額(8, 16進位) 總計(8, 16進位) 買方統編(8) 賣方統編(8) 驗證碼(24)
         接著是「:自用區:本QR品項數:總品項數:編碼:品名:數量:單價:…」
   右邊：「**」開頭，接續其餘「品名:數量:單價:…」
   編碼 0 = Big5、1 = UTF-8、2 = Base64。全部在手機上解析，不會上傳。 */
'use strict';

const JSQR = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
let jsqrP;
const loadJsQR = () => jsqrP ||= new Promise((res, rej) => {
  if (window.jsQR) return res(window.jsQR);
  const el = document.createElement('script');
  el.src = JSQR; el.crossOrigin = 'anonymous';
  el.onload = () => (window.jsQR ? res(window.jsQR) : rej(new Error('lib')));
  el.onerror = () => { jsqrP = null; el.remove(); rej(new Error('lib')); };
  document.head.append(el);
});

/* ---------- 解析 ---------- */
const ascii = b => String.fromCharCode(...b);
function splitBytes(b) {
  const out = []; let s = 0;
  for (let i = 0; i < b.length; i++) if (b[i] === 0x3a) { out.push(b.slice(s, i)); s = i + 1; }
  out.push(b.slice(s));
  return out;
}
const trimEmpty = a => { while (a.length && !a[0].length) a.shift(); while (a.length && !a[a.length - 1].length) a.pop(); return a; };
function decodeText(bytes, enc) {
  try {
    const u8 = Uint8Array.from(bytes);
    if (enc === '0') return new TextDecoder('big5').decode(u8);
    if (enc === '2') { const bin = atob(ascii(u8).trim()); return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))); }
    return new TextDecoder().decode(u8);
  } catch { return ''; }
}
function classifyQR(bytes) {
  if (!bytes || bytes.length < 2) return null;
  if (bytes[0] === 0x2a && bytes[1] === 0x2a) return 'right';
  if (bytes.length >= 77 && /^[A-Z]{2}\d{15}$/.test(ascii(bytes.slice(0, 17)))) return 'left';
  return null;
}
function parseInvoice(left, right) {
  if (!left) return null;
  const h = ascii(left.slice(0, 77));
  const y = Number(h.slice(10, 13)) + 1911, m = Number(h.slice(13, 15)), d = Number(h.slice(15, 17));
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, m - 1, d);
  const inv = { no: h.slice(0, 10), date: ymd(date), total: parseInt(h.slice(29, 37), 16) || 0, seller: h.slice(45, 53), items: [], expected: 0 };
  const seg = splitBytes(left.slice(77)); // seg[0] 是開頭 ':' 前的空字串
  const enc = ascii(seg[4] || []).trim();
  inv.expected = parseInt(ascii(seg[3] || []), 10) || 0;
  let parts = trimEmpty(seg.slice(5));
  if (right) parts = parts.concat(trimEmpty(splitBytes(right.slice(2))));
  for (let i = 0; i + 2 < parts.length; i += 3) {
    const name = decodeText(parts[i], enc).replace(/\s+/g, ' ').trim();
    const qty = Number(ascii(parts[i + 1])), price = Number(ascii(parts[i + 2]));
    if (name && !/^\*+$/.test(name)) inv.items.push({ name: name.slice(0, 40), qty: qty > 0 ? qty : 1, price: Number.isFinite(price) ? price : 0 });
  }
  return inv;
}

/* ---------- 哪些東西值得記保固 ---------- */
const W_RE = /手機|筆電|電腦|平板|耳機|喇叭|音響|電視|螢幕|顯示器|冰箱|冷氣|洗衣|烘衣|吹風|電鍋|微波|烤箱|氣炸|咖啡機|吸塵|掃地|除濕|清淨|電扇|風扇|暖氣|熱水器|相機|手錶|手環|充電器|行動電源|鍵盤|滑鼠|印表機|路由器|硬碟|SSD|主機|遊戲機|家電|iPhone|iPad|Mac|AirPods|Watch|Galaxy|Pixel|Switch|PS5|Xbox|Dyson|Sony|Panasonic|Samsung|ASUS|Acer|Lenovo|小米/i;
const W_EX = /保護殼|手機殼|保護貼|玻璃貼|包膜|收納|清潔|貼紙|提袋|購物袋/;
const EMOJI = [[/手機|iPhone|Galaxy|Pixel/i, '📱'], [/筆電|MacBook|電腦|主機/i, '💻'], [/平板|iPad/i, '📲'], [/耳機|AirPods/i, '🎧'], [/喇叭|音響/, '🔊'],
  [/電視|螢幕|顯示器/, '📺'], [/冷氣/, '❄️'], [/冰箱/, '🧊'], [/洗衣|烘衣/, '🧺'], [/吹風/, '💨'], [/相機/, '📷'], [/手錶|手環|Watch/i, '⌚'],
  [/鍵盤|滑鼠/, '⌨️'], [/遊戲|Switch|PS5|Xbox/i, '🎮'], [/吸塵|掃地/, '🧹'], [/電鍋|微波|烤箱|氣炸|咖啡機/, '🍳']];
const emojiFor = n => (EMOJI.find(([r]) => r.test(n)) || [0, '📦'])[1];
const suggestWarranty = it => (W_RE.test(it.name) && !W_EX.test(it.name)) || it.price >= 3000;
const fmtInvNo = no => `${no.slice(0, 2)}-${no.slice(2)}`;

/* ---------- 相機與照片 ---------- */
let scan = null; // { stream, timer, acc, ri }
function stopScan() {
  if (!scan) return;
  clearTimeout(scan.timer);
  scan.stream?.getTracks().forEach(t => t.stop());
  scan = null;
}
// jsQR 一次只認得一個 QR，畫面裡有兩個時常常兩個都認不出來，所以輪流看左半、右半、再放寬一點、最後整張
const REGIONS = [[0, 0.5], [0.5, 1], [0, 0.62], [0.38, 1], [0, 1]];
function decodeRegion(ctx, w, h, jsQR, ri) {
  const x = Math.round(w * REGIONS[ri][0]), rw = Math.round(w * REGIONS[ri][1]) - x;
  const img = ctx.getImageData(x, 0, rw, h);
  return jsQR(img.data, rw, h, { inversionAttempts: 'attemptBoth' })?.binaryData || null;
}
function absorb(acc, bytes) {
  const k = classifyQR(bytes);
  if (k && !acc[k]) { acc[k] = bytes; if (k === 'left') acc.leftAt = Date.now(); }
}
function readyToParse(acc) {
  if (!acc.left) return false;
  const inv = parseInvoice(acc.left, acc.right);
  if (!inv) { acc.left = null; return false; }
  return !!acc.right || inv.items.length >= inv.expected || Date.now() - acc.leftAt > 2500;
}
const setStatus = t => { const s = $('#scanStatus'); if (s) s.textContent = t; };

async function startCamera() {
  let jsQR;
  try { jsQR = await loadJsQR(); } catch { return setStatus(tr('scan.libFail')); }
  if (!navigator.mediaDevices?.getUserMedia) return setStatus(tr('scan.noCam'));
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }); }
  catch { return setStatus(tr('scan.noCam')); }
  if (!modal.open || mState.kind !== 'scan') return stream.getTracks().forEach(t => t.stop());
  stopScan();
  scan = { stream, acc: {}, ri: 0 };
  const v = $('#scanVideo');
  v.srcObject = stream;
  await v.play().catch(() => {});
  setStatus(tr('scan.hint'));
  const c = document.createElement('canvas'), ctx = c.getContext('2d', { willReadFrequently: true });
  const tick = () => {
    if (!scan) return;
    if (v.videoWidth) {
      const k = Math.min(1, 1280 / v.videoWidth);
      c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const b = decodeRegion(ctx, c.width, c.height, jsQR, scan.ri);
      scan.ri = (scan.ri + 1) % REGIONS.length;
      if (b) absorb(scan.acc, b);
      if (scan.acc.left && !scan.acc.right) setStatus(tr('scan.found1'));
      if (readyToParse(scan.acc)) { const { left, right } = scan.acc; stopScan(); return showInvoice(parseInvoice(left, right)); }
    }
    scan.timer = setTimeout(tick, 120);
  };
  tick();
}

async function scanPhoto(file) {
  setStatus(tr('scan.reading'));
  let jsQR;
  try { jsQR = await loadJsQR(); } catch { return setStatus(tr('scan.libFail')); }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const acc = {};
    for (const max of [1600, 1000, 2400]) {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, c.width, c.height);
      for (let ri = 0; ri < REGIONS.length; ri++) { const b = decodeRegion(ctx, c.width, c.height, jsQR, ri); if (b) absorb(acc, b); }
      if (acc.left && acc.right) break;
    }
    const inv = parseInvoice(acc.left, acc.right);
    if (!inv) return setStatus(tr('scan.notFound'));
    stopScan(); showInvoice(inv);
  } catch { setStatus(tr('scan.notFound')); }
  finally { URL.revokeObjectURL(url); }
}

/* ---------- 確認畫面 ---------- */
function showInvoice(inv) {
  if (!inv) return setStatus(tr('scan.notFound'));
  const sel = inv.items.map(it => ({ on: suggestWarranty(it), months: 12 }));
  openModal('invoice', { inv, sel, ret: { on: sel.some(s => s.on), days: 7 } });
}
const pickCount = () => mState.sel.filter(s => s.on).length + (mState.ret.on ? 1 : 0);

function drawScan() {
  if (mState.kind === 'scan') {
    mBody.innerHTML = mHead() + `<h2 class="m-title">${tr('scan.title')}</h2>
      <div class="scanner"><video id="scanVideo" playsinline muted></video><div class="scan-frame"><i></i><i></i></div><div class="scan-line"></div></div>
      <p class="scan-status" id="scanStatus">${tr('scan.loading')}</p>
      <label class="btn ghost block" for="scanFile">${icon('image')}${tr('scan.photo')}</label>
      <input id="scanFile" type="file" accept="image/*" hidden>
      <p class="fine">${icon('lock')} ${tr('scan.privacy')}</p>`;
    setTimeout(startCamera, 0);
    return;
  }
  const { inv, sel, ret } = mState;
  const dup = items.some(it => it.proof?.no === inv.no);
  const rows = inv.items.map((it, i) => `<label class="inv-row">
      <input type="checkbox" data-s="on" data-i="${i}" ${sel[i].on ? 'checked' : ''}>
      <span class="ico" style="--c:${TYPES.warranty.color}">${emojiFor(it.name)}</span>
      <span class="mid"><b>${esc(it.name)}</b><small>${it.qty > 1 ? `${it.qty} × ` : ''}${money(it.price)}</small></span>
      <select data-s="months" data-i="${i}" ${sel[i].on ? '' : 'disabled'} aria-label="${tr('form.wPeriod')}">${[6, 12, 24, 36, 60].map(m => `<option value="${m}" ${m === sel[i].months ? 'selected' : ''}>${tr('form.w' + m)}</option>`).join('')}</select>
    </label>`).join('');
  mBody.innerHTML = mHead() + `<h2 class="m-title">${tr('inv.title')}</h2>
    <div class="inv-card">
      <div><span>${tr('inv.no')}</span><b>${fmtInvNo(inv.no)}</b></div>
      <div><span>${tr('inv.date')}</span><b>${fmtDate(parse(inv.date))}</b></div>
      <div><span>${tr('inv.total')}</span><b>${money(inv.total)}</b></div>
    </div>
    <p class="tip" style="margin:6px 2px 0">${tr('inv.seller', inv.seller)}</p>
    ${dup ? `<p class="warn">${tr('inv.dup')}</p>` : ''}
    ${inv.items.length ? `<h3 class="sec">${tr('inv.items', inv.items.length)}<span class="sub">${tr('inv.pick')}</span></h3><div class="list">${rows}</div>`
      : `<p class="warn">${tr('inv.noItems')}</p>`}
    ${inv.items.length && inv.items.length < inv.expected ? `<p class="tip">${tr('inv.partial', inv.items.length, inv.expected)}</p>` : ''}
    <div class="ret-box">
      <label class="switch"><input type="checkbox" data-s="ret" ${ret.on ? 'checked' : ''}><i></i></label>
      <div><b>${tr('inv.ret')}</b><small>${tr('inv.retSub')}</small></div>
      <select data-s="days" ${ret.on ? '' : 'disabled'} aria-label="${tr('inv.ret')}">${[3, 7, 14, 30].map(n => `<option value="${n}" ${n === ret.days ? 'selected' : ''}>${tr('inv.days', n)}</option>`).join('')}</select>
    </div>
    <button class="btn primary block" data-s="add" id="invAdd" ${pickCount() ? '' : 'disabled'}>${tr('inv.add', pickCount())}</button>
    <div class="m-links"><button class="link" data-s="rescan">${tr('inv.rescan')}</button></div>`;
}

function addFromInvoice() {
  const { inv, sel, ret } = mState;
  const picks = inv.items.map((it, i) => ({ it, s: sel[i] })).filter(x => x.s.on);
  const count = picks.length + (ret.on ? 1 : 0);
  if (!count) return toast(tr('inv.none'));
  if (!Plan.isPro() && active().length + count > FREE_LIMIT) return openModal('paywall', { reason: tr('pro.limit', FREE_LIMIT) });
  const bought = parse(inv.date), now = ymd(today());
  const proof = { no: inv.no, date: inv.date, seller: inv.seller, total: inv.total };
  for (const { it, s } of picks) {
    const end = addMonths(bought, s.months);
    items.push({ id: uid(), created: now, type: 'warranty', name: it.name, emoji: emojiFor(it.name), amount: 0, cycle: 'once',
      date: ymd(end), anchorDay: end.getDate(), remind: 30, note: '', bought: inv.date, proof: { ...proof, price: it.price, qty: it.qty } });
  }
  if (ret.on) {
    const end = addDays(bought, ret.days);
    items.push({ id: uid(), created: now, type: 'ret', name: tr('inv.retName', inv.items[0]?.name, inv.items.length, fmtInvNo(inv.no)).slice(0, 40),
      emoji: '↩️', amount: 0, cycle: 'once', date: ymd(end), anchorDay: end.getDate(), remind: ret.days > 3 ? 3 : 0, note: '', proof });
  }
  save(); modal.close(); render(); toast(tr('inv.added', count));
}

// 編輯畫面裡的「購買證明」
function proofHtml(p) {
  return `<div class="proof"><div class="ph">${icon('receipt')}<b>${tr('proof.title')}</b></div>
    <div class="pg"><span>${tr('inv.no')}</span><b class="mono">${fmtInvNo(p.no)}</b>
    <span>${tr('inv.date')}</span><b>${fmtDate(parse(p.date))}</b>
    ${p.price != null ? `<span>${tr('proof.price')}</span><b>${money(p.price)}${p.qty > 1 ? ` × ${p.qty}` : ''}</b>` : `<span>${tr('inv.total')}</span><b>${money(p.total)}</b>`}
    <span>${tr('proof.seller')}</span><b class="mono">${esc(p.seller)}</b></div>
    <small>${tr('proof.hint')}</small></div>`;
}

/* ---------- 事件 ---------- */
modal.addEventListener('close', stopScan);
mBody.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'scanFile') { if (el.files[0]) scanPhoto(el.files[0]); el.value = ''; return; }
  const s = el.dataset.s; if (!s || mState.kind !== 'invoice') return;
  if (s === 'on') { const i = +el.dataset.i; mState.sel[i].on = el.checked; mBody.querySelector(`select[data-i="${i}"]`).disabled = !el.checked; }
  else if (s === 'months') mState.sel[+el.dataset.i].months = +el.value;
  else if (s === 'ret') { mState.ret.on = el.checked; mBody.querySelector('select[data-s="days"]').disabled = !el.checked; }
  else if (s === 'days') mState.ret.days = +el.value;
  const b = $('#invAdd'); b.textContent = tr('inv.add', pickCount()); b.disabled = !pickCount();
});
mBody.addEventListener('click', e => {
  const b = e.target.closest('[data-s]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'SELECT') return;
  if (b.dataset.s === 'add') addFromInvoice();
  else if (b.dataset.s === 'rescan') openModal('scan');
});
function openScanner() { if (sheet.open) sheet.close(); openModal('scan'); }
