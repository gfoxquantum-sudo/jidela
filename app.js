/* 記得啦 / Duely — 訂閱、帳單、保固、證件、稅費的到期管家
   資料全部存在這台裝置（localStorage；照片在 IndexedDB），不會上傳。
   帳號與訂閱目前是「示範模式」：流程和畫面是完整的，但還沒接上真正的登入與金流（見 Account / Plan 區塊）。 */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = n => `<svg class="i"><use href="#i-${n}"/></svg>`;
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } }, del: k => { try { localStorage.removeItem(k); } catch {} } };

const TYPES = {
  sub:      { emoji: '🔁', color: '#7c5cff', money: true,  auto: true },
  bill:     { emoji: '🧾', color: '#f08a24', money: true,  auto: false },
  warranty: { emoji: '🛡️', color: '#14a38b', money: false, auto: false },
  doc:      { emoji: '🪪', color: '#3b82f6', money: false, auto: false },
  tax:      { emoji: '🚗', color: '#e5527a', money: true,  auto: false },
  ret:      { emoji: '↩️', color: '#0891b2', money: false, auto: false },
};
const PER_MONTH = { weekly: 52 / 12, monthly: 1, bimonthly: 1 / 2, quarterly: 1 / 3, yearly: 1 / 12, once: 0 };
const REMIND = [0, 3, 7, 14, 30, 90];

// 快速範本 [中文, English, 圖示, 週期]：金額請自己填（各家價格常變動）
const TEMPLATES = {
  sub: [
    ['Netflix', 'Netflix', '🎬', 'monthly'], ['Spotify', 'Spotify', '🎧', 'monthly'], ['YouTube Premium', 'YouTube Premium', '▶️', 'monthly'],
    ['Disney+', 'Disney+', '🏰', 'monthly'], ['iCloud+', 'iCloud+', '☁️', 'monthly'], ['Google One', 'Google One', '🗂️', 'monthly'],
    ['ChatGPT', 'ChatGPT', '🤖', 'monthly'], ['Claude', 'Claude', '✳️', 'monthly'], ['Apple Music', 'Apple Music', '🎵', 'monthly'],
    ['KKBOX', 'KKBOX', '🎶', 'monthly'], ['健身房', 'Gym', '🏋️', 'monthly'], ['Microsoft 365', 'Microsoft 365', '📎', 'yearly'],
  ],
  bill: [
    ['電費', 'Electricity', '💡', 'bimonthly'], ['水費', 'Water', '🚰', 'bimonthly'], ['瓦斯費', 'Gas', '🔥', 'bimonthly'],
    ['手機電信費', 'Mobile plan', '📱', 'monthly'], ['網路費', 'Internet', '🌐', 'monthly'], ['信用卡費', 'Credit card', '💳', 'monthly'],
    ['房租', 'Rent', '🏠', 'monthly'], ['管理費', 'Building fee', '🏢', 'monthly'], ['保險費', 'Insurance', '☂️', 'yearly'], ['學貸', 'Student loan', '🎓', 'monthly'],
  ],
  warranty: [
    ['手機', 'Phone', '📱', 'once'], ['筆電', 'Laptop', '💻', 'once'], ['平板', 'Tablet', '📲', 'once'], ['耳機', 'Headphones', '🎧', 'once'],
    ['冷氣', 'Air conditioner', '❄️', 'once'], ['冰箱', 'Fridge', '🧊', 'once'], ['洗衣機', 'Washer', '🧺', 'once'], ['電視', 'TV', '📺', 'once'], ['機車', 'Scooter', '🛵', 'once'],
  ],
  doc: [
    ['護照', 'Passport', '🛂', 'once'], ['汽車駕照', 'Driver’s license', '🚘', 'once'], ['機車駕照', 'Scooter license', '🛵', 'once'], ['居留證', 'Resident card (ARC)', '🪪', 'once'],
    ['信用卡效期', 'Card expiry', '💳', 'once'], ['學生證', 'Student ID', '🎓', 'once'], ['簽證', 'Visa', '✈️', 'once'], ['自然人憑證', 'Citizen certificate', '🔐', 'once'],
  ],
  tax: [
    ['汽機車強制險', 'Compulsory vehicle insurance', '☂️', 'yearly'], ['汽車定期檢驗', 'Car inspection', '🔧', 'yearly'], ['機車排氣檢驗', 'Scooter emissions test', '💨', 'yearly'],
    ['停車費', 'Parking', '🅿️', 'monthly'], ['ETC 儲值', 'ETC top-up', '🛣️', 'monthly'],
  ],
  ret: [
    ['網購 7 天鑑賞期', 'Online order (7-day return)', '📦', 'once'], ['實體店退換貨', 'In-store return', '🛍️', 'once'],
  ],
};

// 台灣固定稅費（期限為法定開徵期間最後一天；遇假日順延，實際以稅單為準）
const TW_TAX = [
  { key: 'tw-license', zh: '使用牌照稅', en: 'Vehicle license tax', emoji: '🚗', m: 4, d: 30, hint: '4/1–4/30' },
  { key: 'tw-income', zh: '綜合所得稅申報', en: 'Income tax filing', emoji: '🧮', m: 5, d: 31, hint: '5/1–5/31' },
  { key: 'tw-house', zh: '房屋稅', en: 'House tax', emoji: '🏠', m: 5, d: 31, hint: '5/1–5/31' },
  { key: 'tw-fuel', zh: '汽機車燃料使用費', en: 'Vehicle fuel fee', emoji: '⛽', m: 7, d: 31, hint: '7/1–7/31' },
  { key: 'tw-land', zh: '地價稅', en: 'Land value tax', emoji: '🗺️', m: 11, d: 30, hint: '11/1–11/30' },
];

// 方案（價格是暫定的，上架前再調整）
const FREE_LIMIT = 10;
const PRICE = { monthly: 60, yearly: 490 };

/* ---------- 日期工具 ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const diffDays = (a, b) => Math.round((a - b) / 86400000);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function addMonths(d, n, anchorDay) {
  const day = anchorDay || d.getDate();
  const x = new Date(d.getFullYear(), d.getMonth() + n, 1);
  x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate()));
  return x;
}
function nextCycle(d, cycle, anchorDay) {
  switch (cycle) {
    case 'weekly': return addDays(d, 7);
    case 'monthly': return addMonths(d, 1, anchorDay);
    case 'bimonthly': return addMonths(d, 2, anchorDay);
    case 'quarterly': return addMonths(d, 3, anchorDay);
    case 'yearly': return addMonths(d, 12, anchorDay);
    default: return null;
  }
}
const fmtDate = d => `${d.getMonth() + 1}/${d.getDate()}` + (d.getFullYear() !== today().getFullYear() ? `/${d.getFullYear()}` : '');
const wk = d => tr('week')[d.getDay()];
const num = n => Math.round(n).toLocaleString('en-US');
const money = n => 'NT$' + num(n);

/* ---------- 資料 ---------- */
const KEY = 'jidela.items.v1';
let items = [];
function load() {
  try { items = JSON.parse(ls.get(KEY) || '[]'); if (!Array.isArray(items)) items = []; } catch { items = []; }
  rollForward();
}
function save() {
  if (!ls.set(KEY, JSON.stringify(items))) toast(tr('err.save'));
  syncSchedule();
}
// 訂閱會自動扣款，過了扣款日就自動跳到下一期；帳單、稅費要按「已繳」才會前進
function rollForward() {
  const t = today(); let changed = false;
  for (const it of items) {
    if (!TYPES[it.type]?.auto || it.cycle === 'once') continue;
    let d = parse(it.date), guard = 0;
    while (d < t && guard++ < 1000) d = nextCycle(d, it.cycle, it.anchorDay);
    if (ymd(d) !== it.date) { it.date = ymd(d); changed = true; }
  }
  if (changed) save();
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const hasMoney = it => TYPES[it.type].money && Number(it.amount) > 0;
const monthly = it => hasMoney(it) ? Number(it.amount) * PER_MONTH[it.cycle] : 0;
const active = () => items.filter(it => !it.done);
const nameOf = it => { const x = it.preset && TW_TAX.find(v => v.key === it.preset); return x ? x[LANG] : it.name; };
const emojiOf = it => it.emoji || TYPES[it.type].emoji;

function occurrences(it, days) {
  const t = today(), end = addDays(t, days), out = [];
  let d = parse(it.date), guard = 0;
  while (d <= end && guard++ < 400) {
    if (d >= t) out.push(d);
    const n = nextCycle(d, it.cycle, it.anchorDay);
    if (!n) break;
    d = n;
  }
  return out;
}

/* ---------- IndexedDB（照片、通知排程） ---------- */
let dbp;
function db() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('jidela', 2);
    r.onupgradeneeded = () => { for (const s of ['photos', 'kv']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function storeOp(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, mode), rq = fn(tx.objectStore(store));
    tx.oncomplete = () => res(rq.result);
    tx.onerror = () => rej(tx.error);
  });
}
const photoGet = id => storeOp('photos', 'readonly', s => s.get(id)).catch(() => null);
const photoPut = (id, data) => storeOp('photos', 'readwrite', s => s.put(data, id));
const photoDel = id => storeOp('photos', 'readwrite', s => s.delete(id)).catch(() => {});
const kvSet = (k, v) => storeOp('kv', 'readwrite', s => s.put(v, k));
function shrink(file, max = 1200) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
    img.src = url;
  });
}

/* ---------- 帳號與方案 ----------
   config.js 沒填 → 示範模式：登入與訂閱都是模擬的，只存在這台裝置。
   config.js 填了 Supabase → 真的登入（Email 魔法連結／OAuth，不存密碼）；
   方案從資料庫的 profiles 讀，瀏覽器改不了（見 supabase/schema.sql）。
   localStorage 的 jidela.account / jidela.plan 在真實模式下只是畫面用的快取。 */
const readJson = (k, d) => { try { return JSON.parse(ls.get(k)) ?? d; } catch { return d; } };
const LIVE = typeof CONFIG !== 'undefined' && !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js';
const REDIRECT = location.origin + location.pathname;
let sbp;
function backend() {
  return sbp ||= new Promise((res, rej) => {
    const el = document.createElement('script');
    el.src = SDK; el.crossOrigin = 'anonymous';
    el.onload = () => { try { res(window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey)); } catch (e) { sbp = null; rej(e); } };
    el.onerror = () => { sbp = null; el.remove(); rej(new Error('offline')); };
    document.head.append(el);
  });
}
const clearAccount = () => { ls.del('jidela.account'); ls.del('jidela.plan'); };

const Account = {
  get: () => readJson('jidela.account', null),
  // 示範模式用：直接在本機建立一個假帳號
  demoSignIn(provider, email) {
    ls.set('jidela.account', JSON.stringify({ provider, email: email || `demo@${provider}.example`, name: email ? email.split('@')[0] : tr('acct.demoUser'), demo: true }));
  },
  // 真實模式：寄登入連結。成功後使用者點信裡的連結回到 App，onSession() 會接手
  async sendLink(email) {
    const { error } = await (await backend()).auth.signInWithOtp({ email, options: { emailRedirectTo: REDIRECT } });
    if (error) throw error;
  },
  async oauth(provider) {
    const { error } = await (await backend()).auth.signInWithOAuth({ provider, options: { redirectTo: REDIRECT } });
    if (error) throw error;
  },
  async signOut() {
    if (LIVE) { const { error } = await (await backend()).auth.signOut(); if (error) throw error; }
    clearAccount();
  },
  async remove() {
    if (LIVE) {
      const sb = await backend();
      const { error } = await sb.rpc('delete_my_account');
      if (error) throw error;
      await sb.auth.signOut({ scope: 'local' }).catch(() => {});
    }
    clearAccount();
  },
};
const Plan = {
  get: () => readJson('jidela.plan', { tier: 'free' }),
  isPro() {
    const p = Plan.get();
    return p.tier === 'pro' && !!Account.get() && (!p.until || new Date(p.until) > new Date());
  },
  // 以下兩個只有示範模式會用到；真實模式的方案由伺服器決定
  demoSubscribe(cycle) { ls.set('jidela.plan', JSON.stringify({ tier: 'pro', cycle, trialEnds: ymd(addDays(today(), 7)), demo: true })); },
  demoCancel() { ls.del('jidela.plan'); },
  async refresh() {
    const { data, error } = await (await backend()).from('profiles').select('plan, plan_cycle, plan_until').maybeSingle();
    if (error) throw error;
    ls.set('jidela.plan', JSON.stringify({ tier: data?.plan || 'free', cycle: data?.plan_cycle || 'monthly', until: data?.plan_until || null }));
  },
};

async function onSession(event, session) {
  const had = Account.get();
  if (!session) {
    if (had) { clearAccount(); render(); if (modal.open) drawModal(); }
    return;
  }
  const u = session.user, email = u.email || '';
  ls.set('jidela.account', JSON.stringify({
    id: u.id, email, provider: u.app_metadata?.provider || 'email',
    name: u.user_metadata?.full_name || u.user_metadata?.name || email.split('@')[0] || '?',
  }));
  try { await Plan.refresh(); } catch {}
  render();
  if (!had && event === 'SIGNED_IN') toast(tr('acct.signedIn'));
  if (modal.open) { if (mState.kind === 'signin' || mState.kind === 'sent') modal.close(); else drawModal(); }
}
async function initBackend() {
  if (!LIVE) return;
  if (Account.get()?.demo) clearAccount(); // 從示範模式切到真實模式：丟掉假帳號
  try {
    const sb = await backend();
    // 不在 callback 裡直接呼叫 Supabase（官方建議），所以用 setTimeout 排到下一輪
    sb.auth.onAuthStateChange((event, session) => setTimeout(() => onSession(event, session), 0));
  } catch {} // 離線：沿用快取的帳號畫面，下次開啟再驗證
}
const authError = e => toast(e?.message === 'offline' || !navigator.onLine ? tr('acct.offline') : `${tr('acct.err')}${e?.message ? '：' + e.message : ''}`);

const atLimit = () => !Plan.isPro() && active().length >= FREE_LIMIT;

/* ---------- 到期通知：這裡排程，sw.js 的 fireDue() 負責跳 ---------- */
const canNotify = 'Notification' in window && 'serviceWorker' in navigator && location.protocol.startsWith('http');
const notifyOn = () => canNotify && ls.get('jidela.notify') === '1' && Notification.permission === 'granted';

function buildSchedule() {
  const now = Date.now(), out = [];
  const text = { over: 'sw.over', expired: 'sw.expired', today: 'sw.today', tomorrow: 'sw.tomorrow', left: 'sw.left' };
  for (const it of active()) {
    const T = TYPES[it.type], d = parse(it.date), n = Number(it.remind) || 0;
    const at9 = off => { const x = addDays(d, off); x.setHours(9, 0, 0, 0); return x.getTime(); };
    const stages = [];
    if (n > 0) stages.push(['remind', at9(-n)]);
    stages.push(['day', at9(0)]);
    if (!T.auto) stages.push(['over', at9(1)]);
    // 已經過了時間的階段只留最新的一個，避免一次補跳好幾則
    const past = stages.filter(s => s[1] <= now), keep = stages.filter(s => s[1] > now);
    if (past.length) keep.unshift(past[past.length - 1]);
    for (const [stage, at] of keep) out.push({
      key: `${it.id}|${it.date}|${stage}`, at, due: d.getTime(), lang: LANG,
      name: nameOf(it), emoji: emojiOf(it), label: tr('date.' + it.type),
      dateText: `${fmtDate(d)} ${wk(d)}`, amount: hasMoney(it) ? money(it.amount) : '',
      expiry: it.type === 'warranty' || it.type === 'doc' || it.type === 'ret',
    });
  }
  return out;
}
async function syncSchedule() {
  if (!canNotify) return;
  try {
    await kvSet('schedule', buildSchedule());
    await kvSet('enabled', notifyOn());
    if (notifyOn()) (await navigator.serviceWorker.ready).active?.postMessage({ type: 'check' });
  } catch {}
}
async function enableNotify() {
  if (!canNotify) return toast(tr('ntf.unsupported'));
  let p = Notification.permission;
  if (p === 'default') p = await Notification.requestPermission();
  if (p !== 'granted') { render(); return toast(tr('ntf.blocked')); }
  ls.set('jidela.notify', '1');
  try { const reg = await navigator.serviceWorker.ready; if ('periodicSync' in reg) await reg.periodicSync.register('jidela-due', { minInterval: 12 * 3600 * 1000 }); } catch {}
  await syncSchedule(); render(); toast(tr('ntf.enabled'));
}
async function disableNotify() {
  ls.set('jidela.notify', '0');
  try { const reg = await navigator.serviceWorker.ready; if ('periodicSync' in reg) await reg.periodicSync.unregister('jidela-due'); } catch {}
  await syncSchedule(); render(); toast(tr('ntf.disabled'));
}
async function testNotify() {
  try { await (await navigator.serviceWorker.ready).showNotification(`🔔 ${tr('app')}`, { body: tr('ntf.testBody'), icon: 'icon.svg', badge: 'icon.svg', tag: 'jidela-test' }); }
  catch { toast(tr('ntf.testFail')); }
}

/* ---------- 畫面 ---------- */
let tab = 'home', filter = 'all';
const view = $('#view');

function toast(msg) {
  const t = $('#toast');
  // 讓 toast 蓋在開著的 dialog 上面
  (modal.open ? modal : sheet.open ? sheet : document.body).append(t);
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2400);
}

function dueText(it) {
  const n = diffDays(parse(it.date), today());
  const isExpiry = it.type === 'warranty' || it.type === 'doc' || it.type === 'ret';
  if (n < 0) return { cls: 'over', text: tr(isExpiry ? 'expired' : 'overdue', -n) };
  if (n === 0) return { cls: 'soon', text: tr('today') };
  if (n === 1) return { cls: 'soon', text: tr('tomorrow') };
  if (n <= Math.max(7, Number(it.remind) || 0)) return { cls: 'soon', text: tr('inDays', n) };
  if (n < 60) return { cls: '', text: tr('inDays', n) };
  if (n < 730) return { cls: '', text: tr('inMonths', Math.round(n / 30)) };
  return { cls: '', text: tr('inYears', (n / 365).toFixed(1)) };
}

function row(it) {
  const T = TYPES[it.type], due = dueText(it), d = parse(it.date);
  const canPay = (it.type === 'bill' || it.type === 'tax') && diffDays(d, today()) <= 45;
  return `<div class="item" role="button" tabindex="0" data-id="${it.id}" style="--c:${T.color}">
    <div class="ico">${esc(emojiOf(it))}</div>
    <div class="mid">
      <div class="nm">${esc(nameOf(it))}</div>
      <div class="meta"><span class="tag">${tr('type.' + it.type)}</span><span class="due ${due.cls}">${due.text}</span><span>· ${fmtDate(d)} ${wk(d)}</span></div>
    </div>
    <div class="rt">
      ${hasMoney(it) ? `<div class="amt">${money(it.amount)}</div><div class="cyc">${tr('cycle.' + it.cycle)}</div>` : ''}
      ${canPay ? `<button class="pay" data-pay="${it.id}">${icon('check')}${tr('paid')}</button>` : ''}
    </div>
  </div>`;
}
const byDate = (a, b) => a.date.localeCompare(b.date);
const listHtml = arr => `<div class="list">${arr.map(row).join('')}</div>`;
const head = (title, sub) => `<h1 class="title">${title}</h1><p class="subtitle">${sub}</p>`;
const dateLine = () => { const t = today(); return `${tr('headerDate', t)} · ${wk(t)}`; };

function stripHtml(act) {
  const t = today(), map = {};
  for (const it of act) for (const d of occurrences(it, 13)) (map[ymd(d)] ||= []).push(TYPES[it.type].color);
  let cells = '';
  for (let i = 0; i < 14; i++) {
    const d = addDays(t, i), cs = [...new Set(map[ymd(d)] || [])].slice(0, 3);
    cells += `<div class="day ${i === 0 ? 'now' : ''} ${cs.length ? '' : 'none'}"><div class="w">${tr('weekShort')[d.getDay()]}</div><div class="n">${d.getDate()}</div><div class="dots">${cs.map(c => `<i style="--c:${c}"></i>`).join('')}</div></div>`;
  }
  return `<div class="card strip-card"><h4>${tr('home.next14')}</h4><div class="strip">${cells}</div></div>`;
}

function renderHome() {
  const act = active().sort(byDate), t = today();
  if (!act.length) {
    view.innerHTML = head(tr('tab.home'), dateLine()) + `<div class="card empty"><div class="art">${icon('bell')}</div>
      <b>${tr('empty.title')}</b><p>${tr('empty.body')}</p>
      <div class="empty-acts"><button class="btn primary" data-act="scan">${icon('receipt')}${tr('scan.cta')}</button>
      <button class="btn" data-act="add">${icon('plus')}${tr('empty.add')}</button></div>
      <p style="margin:14px 0 0"><button class="link" data-act="sample">${tr('empty.sample')}</button></p></div>`;
    return;
  }
  const perMonth = act.reduce((s, it) => s + monthly(it), 0);
  let in30 = 0;
  for (const it of act) if (hasMoney(it)) in30 += occurrences(it, 30).length * Number(it.amount);
  in30 += act.filter(it => hasMoney(it) && parse(it.date) < t).reduce((s, it) => s + Number(it.amount), 0);

  const g = { over: [], week: [], month: [], later: [] };
  for (const it of act) {
    const n = diffDays(parse(it.date), t);
    (n < 0 ? g.over : n <= 7 ? g.week : n <= 30 ? g.month : g.later).push(it);
  }
  const sec = (title, arr, cls = '') => arr.length ? `<h3 class="sec ${cls}">${title}<span class="n">${arr.length}</span></h3>${listHtml(arr)}` : '';
  view.innerHTML = head(tr('tab.home'), dateLine()) + `
    <div class="hero">
      <div class="k">${tr('home.next30')}</div>
      <div class="big"><small>NT$</small>${num(in30)}</div>
      <div class="sub">
        <div><b>${money(perMonth)}</b><span>${tr('home.perMonth')}</span></div>
        <div><b>${money(perMonth * 12)}</b><span>${tr('home.perYear')}</span></div>
      </div>
    </div>
    ${stripHtml(act)}
    <button class="scan-tile" data-act="scan"><span class="st">${icon('receipt')}</span><div><b>${tr('scan.cta')}</b><small>${tr('scan.ctaSub')}</small></div>${icon('chev')}</button>
    ${sec(tr('home.over'), g.over, 'over')}
    ${sec(tr('home.week'), g.week)}
    ${sec(tr('home.month'), g.month)}
    ${sec(tr('home.later'), g.later.slice(0, 6))}
    ${g.later.length > 6 ? `<p class="hint">${tr('home.more', g.later.length - 6)}</p>` : ''}
    ${!g.over.length && !g.week.length ? `<p class="hint">${tr('home.clear')}</p>` : ''}`;
}

function renderAll() {
  const act = active().sort(byDate);
  const count = k => k === 'all' ? act.length : act.filter(it => it.type === k).length;
  const shown = filter === 'all' ? act : act.filter(it => it.type === filter);
  const pills = [['all', tr('all')], ...Object.keys(TYPES).map(k => [k, `${TYPES[k].emoji} ${tr('type.' + k)}`])]
    .map(([k, l]) => `<button class="pill ${filter === k ? 'on' : ''}" data-filter="${k}">${l}<b>${count(k)}</b></button>`).join('');
  const limit = Plan.isPro() ? '' : ` · ${tr('acct.free')} ${Math.min(act.length, FREE_LIMIT)}/${FREE_LIMIT}`;
  view.innerHTML = head(tr('tab.all'), `${act.length} ${tr('stats.count')}${limit}`) + `<div class="filters">${pills}</div>` +
    (shown.length ? listHtml(shown) : `<div class="card empty"><div class="art">${icon('list')}</div><p>${tr('empty.cat')}</p><button class="btn primary" data-act="add">${icon('plus')}${tr('add')}</button></div>`);
}

function renderStats() {
  const act = active(), paid = act.filter(hasMoney);
  if (!act.length) { view.innerHTML = head(tr('tab.stats'), dateLine()) + `<div class="card empty"><div class="art">${icon('chart')}</div><p>${tr('empty.stats')}</p></div>`; return; }
  const perMonth = paid.reduce((s, it) => s + monthly(it), 0);
  const cats = Object.keys(TYPES).filter(k => TYPES[k].money)
    .map(k => ({ k, c: TYPES[k].color, v: paid.filter(it => it.type === k).reduce((s, it) => s + monthly(it), 0) }));
  const top = paid.filter(it => it.cycle !== 'once').map(it => ({ it, y: monthly(it) * 12 })).sort((a, b) => b.y - a.y).slice(0, 5);
  const t = today(), dd = it => diffDays(parse(it.date), t);
  const wOk = act.filter(it => it.type === 'warranty' && dd(it) >= 0).length;
  const wSoon = act.filter(it => it.type === 'warranty' && dd(it) >= 0 && dd(it) <= 90).length;
  const dSoon = act.filter(it => it.type === 'doc' && dd(it) <= 180).length;
  const subs = paid.filter(it => it.type === 'sub').length;
  const pct = v => { const p = perMonth ? Math.round(v / perMonth * 100) : 0; return v > 0 && p === 0 ? '<1' : p; };

  view.innerHTML = head(tr('tab.stats'), dateLine()) + `
    <div class="card">
      <h4>${tr('stats.fixed')}</h4>
      <div class="kv">
        <div><b>${money(perMonth)}</b><span>${tr('stats.avgMonth')}</span></div>
        <div><b>${money(perMonth * 12)}</b><span>${tr('stats.year')}</span></div>
      </div>
      <div class="stack">${cats.filter(c => c.v > 0).map(c => `<i style="--c:${c.c};flex:${c.v}"></i>`).join('')}</div>
      <div class="legend">${cats.map(c => `<div><i style="--c:${c.c}"></i><span>${tr('type.' + c.k)}</span><b>${money(c.v)}</b><em>${pct(c.v)}%</em></div>`).join('')}</div>
      <p class="tip">${tr('stats.note')}</p>
    </div>
    ${top.length ? `<div class="card"><h4>${tr('stats.top', top.length)}</h4>
      ${top.map(({ it, y }) => `<div class="rank" style="--c:${TYPES[it.type].color}"><div class="l"><span>${esc(emojiOf(it))} ${esc(nameOf(it))}</span><b>${money(y)}${tr('stats.perYear')}</b></div><div class="b"><i style="width:${(y / top[0].y * 100).toFixed(1)}%"></i></div></div>`).join('')}
      ${subs >= 3 ? `<p class="tip">${tr('stats.subsTip', subs)}</p>` : ''}
    </div>` : ''}
    <div class="card">
      <h4>${tr('stats.wd')}</h4>
      <div class="kv">
        <div><b>${wOk}</b><span>${tr('stats.wOk')}</span></div>
        <div><b>${wSoon}</b><span>${tr('stats.wSoon')}</span></div>
        <div><b>${dSoon}</b><span>${tr('stats.dSoon')}</span></div>
        <div><b>${act.length}</b><span>${tr('stats.count')}</span></div>
      </div>
      ${wSoon ? `<p class="tip">${tr('stats.wTip')}</p>` : ''}
    </div>`;
}

const setRow = (title, small, ctl) => `<div class="set"><div>${title}${small ? `<small>${small}</small>` : ''}</div>${ctl}</div>`;
const segc = (attr, cur, opts) => `<div class="segc">${opts.map(([k, l]) => `<button class="${cur === k ? 'on' : ''}" data-${attr}="${k}">${l}</button>`).join('')}</div>`;

function accountCard() {
  const a = Account.get(), p = Plan.get(), pro = Plan.isPro();
  if (!a) return `<div class="card"><div class="acct"><div class="av">${icon('user')}</div>
    <div class="who"><b>${tr('acct.guest')}</b><small>${tr('acct.guestSub')}</small></div>
    <button class="btn sm primary" data-act="signin">${tr('acct.signin')}</button></div></div>`;
  const planLine = pro ? (p.trialEnds && parse(p.trialEnds) >= today() ? tr('acct.trial', fmtDate(parse(p.trialEnds))) : tr('cycle.' + p.cycle)) : tr('acct.free');
  return `<div class="card"><div class="acct"><div class="av">${esc(a.name.slice(0, 1).toUpperCase())}</div>
    <div class="who"><b>${esc(a.name)} ${pro ? '<span class="pro-tag">PRO</span>' : ''}</b><small>${esc(a.email)} · ${planLine}</small></div>
    <button class="btn sm" data-act="account">${tr('acct.manage')}</button></div></div>`;
}

function notifyCard() {
  let body;
  if (!canNotify) body = setRow(tr('ntf.unsupported'), tr('ntf.unsupportedSub'), '');
  else if (Notification.permission === 'denied') body = setRow(tr('ntf.denied'), tr('ntf.deniedSub'), '');
  else if (!notifyOn()) body = setRow(tr('ntf.off'), tr('ntf.offSub'), `<button class="btn sm primary" data-act="notify-on">${tr('ntf.enable')}</button>`);
  else body = setRow(tr('ntf.on'), tr('ntf.onSub'), `<button class="btn sm" data-act="notify-off">${tr('ntf.disable')}</button>`)
    + setRow(tr('ntf.test'), tr('ntf.testSub'), `<button class="btn sm ghost" data-act="notify-test">${tr('ntf.testBtn')}</button>`);
  return `<div class="card"><h4>${icon('bell')}${tr('ntf.title')}</h4>${body}<p class="tip">${tr('ntf.note')}</p></div>`;
}

function renderSettings() {
  const theme = ls.get('jidela.theme') || 'system';
  const has = k => items.some(it => it.preset === k && !it.done);
  view.innerHTML = head(tr('tab.settings'), tr('tagline')) + accountCard() +
    (Plan.isPro() ? '' : `<button class="upsell" data-act="paywall"><span class="st">${icon('star')}</span><div><b>${tr('pro.banner')}</b><small>${tr('pro.bannerSub')}</small></div>${icon('chev')}</button>`) +
    notifyCard() + `
    <div class="card">
      <h4>${tr('set.look')}</h4>
      ${setRow(tr('set.lang'), '', segc('lang', LANG, [['zh', '中文'], ['en', 'English']]))}
      ${setRow(tr('set.theme'), '', segc('theme-set', theme, [['system', tr('set.system')], ['light', tr('set.light')], ['dark', tr('set.dark')]]))}
    </div>
    <div class="card">
      <h4>🇹🇼 ${tr('tax.title')}</h4>
      <p class="tip" style="margin:0 0 8px">${tr('tax.lead')}</p>
      ${TW_TAX.map(x => setRow(`${x.emoji} ${x[LANG]}`, tr('tax.every', x.hint), `<button class="btn sm ${has(x.key) ? '' : 'ghost'}" data-tax="${x.key}">${has(x.key) ? icon('check') + tr('tax.added') : tr('tax.add')}</button>`)).join('')}
    </div>
    <div class="card">
      <h4>${tr('bk.title')}</h4>
      ${setRow(tr('bk.ics'), tr('bk.icsSub'), `<button class="btn sm ghost" data-act="ics">${tr('bk.export')}</button>`)}
      ${setRow(tr('bk.backup'), tr('bk.backupSub'), `<button class="btn sm ghost" data-act="export">${tr('bk.backupBtn')}</button>`)}
      ${setRow(tr('bk.restore'), tr('bk.restoreSub'), `<label class="btn sm ghost" for="importFile">${tr('bk.restoreBtn')}</label><input id="importFile" type="file" accept="application/json,.json" hidden>`)}
    </div>
    <div class="card">
      <h4>${icon('shield')}${tr('sec.title')}</h4>
      <ul class="sec-list">${[1, 2, 3, 4].map(i => `<li>${icon('check')}<span>${tr('sec.' + i)}</span></li>`).join('')}</ul>
    </div>
    <div class="card">
      <h4>${tr('data.title')}</h4>
      ${setRow(tr('data.sample'), tr('data.sampleSub'), `<button class="btn sm" data-act="sample">${tr('data.sampleBtn')}</button>`)}
      ${setRow(tr('data.wipe'), tr('data.wipeSub'), `<button class="btn sm danger" data-act="wipe">${tr('data.wipeBtn')}</button>`)}
    </div>`;
}

function renderChip() {
  const a = Account.get(), pro = Plan.isPro();
  $('#acctChip').innerHTML = `<span class="av">${a ? esc(a.name.slice(0, 1).toUpperCase()) : icon('user')}</span>${pro ? '<span class="pro-tag">PRO</span>' : `<span>${a ? tr('acct.free') : tr('acct.signin')}</span>`}`;
}

function applyStatic() {
  document.documentElement.lang = LANG === 'zh' ? 'zh-Hant' : 'en';
  document.title = tr('app');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = tr(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = tr(el.dataset.i18nPh); });
  $('#fRemind').innerHTML = REMIND.map(n => `<option value="${n}">${n ? tr('form.rN', n) : tr('form.r0')}</option>`).join('');
  $('#addBtn').setAttribute('aria-label', tr('form.new'));
  $('#sheetClose').setAttribute('aria-label', '✕');
}

function render() {
  ({ home: renderHome, all: renderAll, stats: renderStats, settings: renderSettings })[tab]();
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('#addBtn').hidden = tab === 'settings' || tab === 'stats';
  renderChip();
}

/* ---------- 帳號／方案 modal ---------- */
const modal = $('#modal'), mBody = $('#modalBody');
let mState = {};
const mHead = () => `<div class="grab"></div><div class="sheet-head"><span></span><button type="button" class="x" data-m="close" aria-label="✕">${icon('x')}</button></div>`;
const demoNote = k => `<p class="demo">${icon('lock')}<span>${tr(k)}</span></p>`;

function openModal(kind, state = {}) {
  mState = { kind, cycle: 'yearly', ...state };
  drawModal();
  if (!modal.open) modal.showModal();
}
function drawModal() {
  if (mState.kind === 'scan' || mState.kind === 'invoice') return drawScan();
  const a = Account.get();
  const providers = LIVE ? (CONFIG.oauth || []) : ['apple', 'google'];
  if (mState.kind === 'sent') {
    mBody.innerHTML = mHead() + `<div class="m-hero"><div class="badge" style="background:var(--accent-soft);color:var(--accent)">${icon('mail')}</div>
      <h2>${tr('acct.sent')}</h2><p>${tr('acct.sentBody', esc(mState.email))}</p></div>
      <p class="fine">${tr('acct.sentHint')}</p>
      <div class="m-links"><button class="link" data-m="back">${tr('acct.other')}</button></div>`;
  } else if (mState.kind === 'signin') {
    mBody.innerHTML = mHead() + `<div class="m-hero"><img src="icon.svg" width="64" height="64" alt=""><h2>${tr('acct.heading')}</h2><p>${tr('acct.lead')}</p></div>
      ${providers.length ? `<div class="oauth">
        ${providers.includes('apple') ? `<button class="btn dark" data-m="oauth" data-p="apple"> ${tr('acct.apple')}</button>` : ''}
        ${providers.includes('google') ? `<button class="btn g" data-m="oauth" data-p="google"><b style="color:#4285f4">G</b> ${tr('acct.google')}</button>` : ''}
      </div>
      <div class="or">${tr('acct.or')}</div>` : ''}
      <form id="emailForm" novalidate>
        <label class="f"><span>${tr('acct.email')}</span><input id="mEmail" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com"></label>
        <p class="err" id="mErr" role="alert" hidden></p>
        <button class="btn primary block" type="submit" id="mSend">${tr('acct.send')}</button>
      </form>
      <p class="fine">${tr('acct.nopw')}</p>${LIVE ? '' : demoNote('acct.demo')}`;
  } else if (mState.kind === 'paywall') {
    const save = Math.round((1 - PRICE.yearly / (PRICE.monthly * 12)) * 100);
    const feats = [['pro.f1', tr('pro.f1s', FREE_LIMIT)], ['pro.f2', tr('pro.f2s')], ['pro.f3', tr('pro.f3s')], ['pro.f4', tr('pro.f4s')]];
    mBody.innerHTML = mHead() + `<div class="m-hero"><div class="badge gold">${icon('star')}</div><h2>${tr('pro.title')}</h2><p>${mState.reason ? esc(mState.reason) : tr('pro.lead')}</p></div>
      <div class="feat">${feats.map(([k, s]) => `<div><span class="ck">${icon('check')}</span><span><b>${tr(k)}</b><small>${s}</small></span></div>`).join('')}</div>
      <div class="plans">
        <button class="plan ${mState.cycle === 'yearly' ? 'on' : ''}" data-m="cycle" data-c="yearly"><i class="save">${tr('pro.save', save)}</i><span>${tr('pro.yearly')}</span><b>NT$${PRICE.yearly}<small>${tr('pro.perYear')}</small></b><em>${tr('pro.avg', Math.round(PRICE.yearly / 12))}</em></button>
        <button class="plan ${mState.cycle === 'monthly' ? 'on' : ''}" data-m="cycle" data-c="monthly"><span>${tr('pro.monthly')}</span><b>NT$${PRICE.monthly}<small>${tr('pro.perMonth')}</small></b><em>&nbsp;</em></button>
      </div>
      <button class="btn primary block" data-m="subscribe">${tr('pro.cta')}</button>
      <p class="fine">${tr('pro.fine')}</p>
      <div class="m-links"><button class="link" data-m="restore">${tr('pro.restore')}</button></div>${demoNote(LIVE ? 'pro.soon' : 'pro.demo')}`;
  } else if (mState.kind === 'account' && a) {
    const pro = Plan.isPro(), p = Plan.get();
    mBody.innerHTML = mHead() + `<div class="m-hero"><div class="av" style="width:64px;height:64px;font-size:26px;margin:4px auto 12px">${esc(a.name.slice(0, 1).toUpperCase())}</div>
        <h2>${esc(a.name)} ${pro ? '<span class="pro-tag">PRO</span>' : ''}</h2><p>${esc(a.email)}</p></div>
      <div class="card" style="box-shadow:none;background:var(--fill)">
        ${setRow(pro ? tr('acct.pro') : tr('acct.free'), pro ? `${tr('cycle.' + p.cycle)} · NT$${PRICE[p.cycle]}` + (p.trialEnds ? ` · ${tr('acct.trial', fmtDate(parse(p.trialEnds)))}` : '') + (p.until ? ` · ${tr('acct.until', fmtDate(new Date(p.until)))}` : '') : tr('pro.limit', FREE_LIMIT),
          pro ? (LIVE ? '' : `<button class="btn sm" data-m="cancel">${tr('pro.cancel')}</button>`) : `<button class="btn sm primary" data-m="upgrade">${tr('pro.banner')}</button>`)}
      </div>
      <button class="btn block" data-m="signout">${tr('acct.signout')}</button>
      <div class="m-links"><button class="link" data-m="delete" style="color:var(--danger)">${tr('acct.delete')}</button></div>${LIVE ? '' : demoNote('acct.demo')}`;
  } else modal.close();
}
function afterSignIn() {
  toast(tr('acct.signedIn'));
  if (mState.then === 'paywall') openModal('paywall', { cycle: mState.cycleWanted || 'yearly' });
  else modal.close();
  render();
}
mBody.addEventListener('click', e => {
  const b = e.target.closest('[data-m]'); if (!b) return;
  const m = b.dataset.m;
  if (m === 'close') modal.close();
  else if (m === 'back') openModal('signin', { then: mState.then, cycleWanted: mState.cycleWanted });
  else if (m === 'oauth') {
    if (LIVE) { b.disabled = true; Account.oauth(b.dataset.p).catch(e => { b.disabled = false; authError(e); }); }
    else { Account.demoSignIn(b.dataset.p); afterSignIn(); }
  }
  else if (m === 'cycle') { mState.cycle = b.dataset.c; drawModal(); }
  else if (m === 'subscribe') {
    if (!Account.get()) return openModal('signin', { then: 'paywall', cycleWanted: mState.cycle });
    if (LIVE) return toast(tr('pro.soon'));
    Plan.demoSubscribe(mState.cycle); modal.close(); render(); toast(tr('pro.started'));
  }
  else if (m === 'restore') toast(tr('pro.noRestore'));
  else if (m === 'upgrade') openModal('paywall');
  else if (m === 'cancel') { if (confirm(tr('pro.cancelConfirm'))) { Plan.demoCancel(); drawModal(); render(); toast(tr('pro.cancelled')); } }
  else if (m === 'signout') {
    b.disabled = true;
    Account.signOut().then(() => { modal.close(); render(); toast(tr('acct.signedOut')); }).catch(e => { b.disabled = false; authError(e); });
  }
  else if (m === 'delete') {
    if (!confirm(tr('acct.deleteConfirm'))) return;
    b.disabled = true;
    Account.remove().then(() => { modal.close(); render(); toast(tr('acct.deleted')); }).catch(e => { b.disabled = false; authError(e); });
  }
});
mBody.addEventListener('submit', e => {
  e.preventDefault();
  const email = $('#mEmail').value.trim(), err = $('#mErr');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = tr('acct.badEmail'); err.hidden = false; return; }
  if (!LIVE) { Account.demoSignIn('email', email); return afterSignIn(); }
  const btn = $('#mSend'); btn.disabled = true; err.hidden = true;
  Account.sendLink(email)
    .then(() => openModal('sent', { email, then: mState.then, cycleWanted: mState.cycleWanted }))
    .catch(e => { btn.disabled = false; authError(e); });
});
modal.addEventListener('click', e => { if (e.target === modal) modal.close(); });

/* ---------- 新增／編輯 ---------- */
const sheet = $('#sheet');
let editing = null, fType = 'sub', fEmoji = '', pendingPhoto; // pendingPhoto: undefined=不變, null=移除, string=新照片

function setType(k) {
  fType = k;
  $('#typeSeg').innerHTML = Object.keys(TYPES).map(key =>
    `<button type="button" role="radio" aria-checked="${key === k}" class="${key === k ? 'on' : ''}" data-type="${key}" style="--c:${TYPES[key].color}"><span>${TYPES[key].emoji}</span>${tr('short.' + key)}</button>`).join('');
  $('#tplChips').innerHTML = TEMPLATES[k].map((x, i) => `<button type="button" data-tpl="${i}">${x[2]} ${x[LANG === 'zh' ? 0 : 1]}</button>`).join('');
  $('#dateLabel').textContent = tr('date.' + k);
  $('#moneyRow').hidden = !TYPES[k].money;
  $('#warrantyRow').hidden = k !== 'warranty';
  $('#photoRow').hidden = !(k === 'warranty' || k === 'doc');
  $('#photoPro').hidden = Plan.isPro();
  if (!editing) {
    $('#fCycle').value = k === 'tax' ? 'yearly' : 'monthly';
    $('#fRemind').value = { sub: '3', bill: '3', warranty: '30', doc: '90', tax: '14', ret: '3' }[k];
  }
}
function showPhoto(data) {
  $('#photoPrev').hidden = !data; $('#photoDel').hidden = !data;
  if (data) $('#photoPrev').src = data; else $('#photoPrev').removeAttribute('src');
}
async function openSheet(it) {
  if (!it && atLimit()) return openModal('paywall', { reason: tr('pro.limit', FREE_LIMIT) });
  editing = it || null; pendingPhoto = undefined; fEmoji = it?.emoji || '';
  $('#itemForm').reset(); $('#formErr').hidden = true; showPhoto(null);
  $('#sheetTitle').textContent = tr(it ? 'form.edit' : 'form.new');
  $('#delBtn').hidden = !it;
  setType(it?.type || (filter !== 'all' && tab === 'all' ? filter : 'sub'));
  if (it) {
    $('#fName').value = nameOf(it); $('#fAmount').value = it.amount || '';
    $('#fCycle').value = it.cycle; $('#fDate').value = it.date;
    $('#fRemind').value = String(it.remind ?? 3); $('#fNote').value = it.note || '';
    $('#fBought').value = it.bought || '';
    if (it.photo) showPhoto(await photoGet(it.id));
  }
  $('#scanCta').hidden = !!it;
  $('#proofBox').hidden = !it?.proof;
  $('#proofBox').innerHTML = it?.proof ? proofHtml(it.proof) : '';
  sheet.showModal();
}
function calcWarranty() {
  const b = $('#fBought').value, m = Number($('#fWMonths').value);
  if (b && m) $('#fDate').value = ymd(addMonths(parse(b), m));
}
async function submitForm(e) {
  e.preventDefault();
  const T = TYPES[fType], err = $('#formErr');
  const name = $('#fName').value.trim(), date = $('#fDate').value;
  const amount = T.money ? Number($('#fAmount').value) || 0 : 0;
  const fail = m => { err.textContent = m; err.hidden = false; };
  if (!name) return fail(tr('err.name'));
  if (!date) return fail(tr('err.date', tr('date.' + fType)));
  if (amount < 0) return fail(tr('err.neg'));
  const it = editing || { id: uid(), created: ymd(today()) };
  if (it.preset && name !== nameOf(it)) delete it.preset; // 改了名字就不再跟著語言翻譯
  Object.assign(it, {
    type: fType, name, amount, date,
    cycle: T.money ? $('#fCycle').value : 'once',
    anchorDay: parse(date).getDate(),
    remind: Number($('#fRemind').value), note: $('#fNote').value.trim(),
    emoji: fEmoji, bought: fType === 'warranty' ? $('#fBought').value : '',
  });
  try {
    if (typeof pendingPhoto === 'string') { await photoPut(it.id, pendingPhoto); it.photo = true; }
    else if (pendingPhoto === null) { await photoDel(it.id); it.photo = false; }
  } catch { toast(tr('err.photoSave')); }
  const wasEdit = !!editing;
  if (!wasEdit) items.push(it);
  rollForward(); save(); sheet.close(); render();
  toast(wasEdit ? tr('toast.updated') : tr('toast.added', name));
}

/* ---------- 動作 ---------- */
function markPaid(id) {
  const it = items.find(x => x.id === id); if (!it) return;
  const next = nextCycle(parse(it.date), it.cycle, it.anchorDay);
  if (next) { it.date = ymd(next); toast(tr('toast.paid', nameOf(it), fmtDate(next))); }
  else { it.done = true; toast(tr('toast.done', nameOf(it))); }
  save(); render();
}
function toggleTax(key) {
  const x = TW_TAX.find(v => v.key === key), had = items.find(it => it.preset === key && !it.done);
  if (had) { items = items.filter(it => it !== had); toast(tr('tax.toastDel', x[LANG])); }
  else {
    if (atLimit()) return openModal('paywall', { reason: tr('pro.limit', FREE_LIMIT) });
    const t = today(); let d = new Date(t.getFullYear(), x.m - 1, x.d);
    if (d < t) d = new Date(t.getFullYear() + 1, x.m - 1, x.d);
    items.push({ id: uid(), created: ymd(t), preset: key, type: 'tax', name: x.zh, emoji: x.emoji, amount: 0, cycle: 'yearly', date: ymd(d), anchorDay: x.d, remind: 14, note: x.hint });
    toast(tr('tax.toastAdd', x[LANG], fmtDate(d)));
  }
  save(); render();
}
function download(name, text, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportIcs() {
  const act = active();
  if (!act.length) return toast(tr('bk.icsNone'));
  const icsEsc = s => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const FREQ = { weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY', bimonthly: 'FREQ=MONTHLY;INTERVAL=2', quarterly: 'FREQ=MONTHLY;INTERVAL=3', yearly: 'FREQ=YEARLY' };
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//jidela//' + LANG, 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + tr('ics.cal')];
  for (const it of act) {
    const d = parse(it.date), n = Number(it.remind) || 0;
    const title = `${emojiOf(it)} ${nameOf(it)}｜${tr('date.' + it.type)}` + (hasMoney(it) ? ` ${money(it.amount)}` : '');
    L.push('BEGIN:VEVENT', `UID:${it.id}@jidela`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(d).replace(/-/g, '')}`, `DTEND;VALUE=DATE:${ymd(addDays(d, 1)).replace(/-/g, '')}`,
      `SUMMARY:${icsEsc(title)}`);
    if (it.note) L.push(`DESCRIPTION:${icsEsc(it.note)}`);
    if (FREQ[it.cycle]) L.push(`RRULE:${FREQ[it.cycle]}`);
    L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(title)}`, `TRIGGER:${n > 0 ? `-P${n - 1}DT15H` : 'PT9H'}`, 'END:VALARM', 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  download(`${tr('ics.cal')}.ics`, L.join('\r\n'), 'text/calendar');
  toast(tr('bk.icsDone', act.length));
}
function exportJson() {
  download(`${tr('bk.file')}-${ymd(today())}.json`, JSON.stringify({ app: 'jidela', version: 1, exported: new Date().toISOString(), items }, null, 2), 'application/json');
  toast(tr('bk.done'));
}
async function importJson(file) {
  try {
    const data = JSON.parse(await file.text());
    const arr = Array.isArray(data) ? data : data.items;
    if (!Array.isArray(arr)) throw 0;
    const ok = arr.filter(it => it && TYPES[it.type] && it.cycle in PER_MONTH && typeof it.name === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(it.date));
    if (!ok.length) throw 0;
    if (items.length && !confirm(tr('bk.confirm', ok.length, items.length))) return;
    items = ok.map(it => ({ ...it, id: it.id || uid(), photo: false }));
    rollForward(); save(); render(); toast(tr('bk.restored', ok.length));
  } catch { toast(tr('bk.bad')); }
}
function loadSample() {
  const t = today(), D = n => ymd(addDays(t, n)), z = LANG === 'zh';
  const mk = (type, zh, en, emoji, amount, cycle, date, remind, note = '') =>
    ({ id: uid(), created: ymd(t), sample: true, type, name: z ? zh : en, emoji, amount, cycle, date, anchorDay: parse(date).getDate(), remind, note });
  items.push(
    mk('sub', '影音串流', 'Video streaming', '🎬', 330, 'monthly', D(2), 3, z ? '跟室友平分' : 'Split with roommate'),
    mk('sub', '音樂串流', 'Music streaming', '🎧', 149, 'monthly', D(9), 3),
    mk('sub', '雲端空間', 'Cloud storage', '☁️', 90, 'monthly', D(17), 3),
    mk('sub', '健身房', 'Gym', '🏋️', 1288, 'monthly', D(24), 3),
    mk('sub', '辦公軟體', 'Office suite', '📎', 2190, 'yearly', D(140), 7),
    mk('bill', '信用卡費', 'Credit card', '💳', 8640, 'monthly', D(-2), 3),
    mk('bill', '手機電信費', 'Mobile plan', '📱', 599, 'monthly', D(5), 3),
    mk('bill', '電費', 'Electricity', '💡', 1820, 'bimonthly', D(12), 3),
    mk('bill', '房租', 'Rent', '🏠', 12000, 'monthly', D(20), 3),
    mk('warranty', '筆電', 'Laptop', '💻', 0, 'once', D(48), 30, z ? '原廠保固，發票在信箱' : 'Manufacturer warranty'),
    mk('warranty', '冷氣', 'Air conditioner', '❄️', 0, 'once', D(620), 30),
    mk('doc', '護照', 'Passport', '🛂', 0, 'once', D(150), 90, z ? '出國前要剩 6 個月效期' : 'Needs 6 months validity to travel'),
    mk('doc', '機車駕照', 'Scooter license', '🛵', 0, 'once', D(900), 90),
    mk('tax', '機車強制險', 'Scooter insurance', '☂️', 1100, 'yearly', D(33), 14),
  );
  save(); render(); toast(tr('data.sampleDone'));
}
async function wipe() {
  if (!items.length) return toast(tr('data.none'));
  if (!confirm(tr('data.wipeConfirm', items.length))) return;
  items = []; save();
  try { await storeOp('photos', 'readwrite', s => s.clear()); } catch {}
  render(); toast(tr('data.wiped'));
}
function applyTheme() {
  const t = ls.get('jidela.theme') || 'system';
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
}
function setLang(l) {
  LANG = l; ls.set('jidela.lang', l);
  applyStatic(); render(); syncSchedule();
}

/* ---------- 事件 ---------- */
document.querySelector('.tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]'); if (!b) return;
  tab = b.dataset.tab; render(); window.scrollTo(0, 0);
});
$('#addBtn').addEventListener('click', () => openSheet());
$('#acctChip').addEventListener('click', () => openModal(Account.get() ? 'account' : 'signin'));

view.addEventListener('click', e => {
  const q = s => e.target.closest(s);
  let el;
  if ((el = q('[data-pay]'))) { e.stopPropagation(); return markPaid(el.dataset.pay); }
  if ((el = q('.item[data-id]'))) return openSheet(items.find(x => x.id === el.dataset.id));
  if ((el = q('[data-filter]'))) { filter = el.dataset.filter; return render(); }
  if ((el = q('[data-tax]'))) return toggleTax(el.dataset.tax);
  if ((el = q('[data-lang]'))) return setLang(el.dataset.lang);
  if ((el = q('[data-theme-set]'))) { ls.set('jidela.theme', el.dataset.themeSet); applyTheme(); return render(); }
  if ((el = q('[data-act]'))) {
    const a = el.dataset.act;
    ({
      add: () => openSheet(), sample: loadSample, ics: exportIcs, export: exportJson, wipe,
      'notify-on': enableNotify, 'notify-off': disableNotify, 'notify-test': testNotify,
      signin: () => openModal('signin'), scan: () => openScanner(), account: () => openModal('account'), paywall: () => openModal('paywall'),
    })[a]?.();
  }
});
view.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.item[data-id]')) { e.preventDefault(); e.target.click(); }
});
view.addEventListener('change', e => {
  if (e.target.id === 'importFile' && e.target.files[0]) importJson(e.target.files[0]);
});

$('#typeSeg').addEventListener('click', e => { const b = e.target.closest('[data-type]'); if (b) { fEmoji = editing?.type === b.dataset.type ? editing.emoji : ''; setType(b.dataset.type); } });
$('#tplChips').addEventListener('click', e => {
  const b = e.target.closest('[data-tpl]'); if (!b) return;
  const x = TEMPLATES[fType][b.dataset.tpl];
  $('#fName').value = x[LANG === 'zh' ? 0 : 1]; fEmoji = x[2];
  if (TYPES[fType].money) $('#fCycle').value = x[3];
  (TYPES[fType].money ? $('#fAmount') : $('#fDate')).focus();
});
$('#fBought').addEventListener('change', calcWarranty);
$('#fWMonths').addEventListener('change', calcWarranty);
$('#photoBtn').addEventListener('click', () => {
  if (!Plan.isPro()) return openModal('paywall', { reason: tr('pro.photoLock') });
  $('#fPhoto').click();
});
$('#fPhoto').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try { pendingPhoto = await shrink(f); showPhoto(pendingPhoto); } catch { toast(tr('err.photo')); }
  e.target.value = '';
});
$('#photoDel').addEventListener('click', () => { pendingPhoto = null; showPhoto(null); });
$('#sheetClose').addEventListener('click', () => sheet.close());
sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });
$('#itemForm').addEventListener('submit', submitForm);
$('#delBtn').addEventListener('click', async () => {
  if (!editing || !confirm(tr('confirm.delete', nameOf(editing)))) return;
  if (editing.photo) await photoDel(editing.id);
  items = items.filter(x => x !== editing); save(); sheet.close(); render(); toast(tr('toast.deleted'));
});
modal.addEventListener('close', () => { $('#photoPro').hidden = Plan.isPro(); document.body.append($('#toast')); });
sheet.addEventListener('close', () => document.body.append($('#toast')));

// 跨日或從背景回來時重新整理
document.addEventListener('visibilitychange', () => { if (!document.hidden) { rollForward(); render(); syncSchedule(); } });
setInterval(syncSchedule, 30 * 60 * 1000);

applyTheme(); applyStatic(); load(); render(); initBackend();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').then(syncSchedule).catch(() => {});
