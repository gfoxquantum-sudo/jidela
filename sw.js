// 記得啦 service worker：網路優先、離線用快取；另外負責跳到期通知
const CACHE = 'jidela-v6';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'i18n.js', 'config.js', 'scan.js', 'icon.svg', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});

/* ---------- 到期通知 ----------
   App 每次存檔會把「什麼時候該提醒什麼」寫進 IndexedDB 的 kv/schedule，
   這裡只負責把時間已到、還沒跳過的那幾筆跳出來。 */
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('jidela', 2);
    r.onupgradeneeded = () => { for (const s of ['photos', 'kv']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function kv(mode, fn) {
  const d = await idb();
  return new Promise((res, rej) => {
    const tx = d.transaction('kv', mode), rq = fn(tx.objectStore('kv'));
    tx.oncomplete = () => { d.close(); res(rq.result); };
    tx.onerror = () => { d.close(); rej(tx.error); };
  });
}

const days = n => `${n} day${n === 1 ? '' : 's'}`;
const TXT = {
  zh: { over: n => `已逾期 ${n} 天`, expired: n => `已過期 ${n} 天`, today: '就是今天', tomorrow: '明天', left: n => `還有 ${n} 天`, many: n => `有 ${n} 件事快到期了`, sep: '、' },
  en: { over: n => `${days(n)} overdue`, expired: n => `Expired ${days(n)} ago`, today: 'Today', tomorrow: 'Tomorrow', left: n => `${days(n)} left`, many: n => `${n} things are due soon`, sep: ', ' },
};
function whenText(e) {
  const L = TXT[e.lang] || TXT.zh, t = new Date(); t.setHours(0, 0, 0, 0);
  const n = Math.round((e.due - t.getTime()) / 86400000);
  if (n < 0) return e.expiry ? L.expired(-n) : L.over(-n);
  return n === 0 ? L.today : n === 1 ? L.tomorrow : L.left(n);
}

async function fireDue() {
  if (!self.Notification || Notification.permission !== 'granted') return 0;
  const [enabled, schedule, fired] = await Promise.all(['enabled', 'schedule', 'fired'].map(k => kv('readonly', s => s.get(k))));
  if (!enabled || !Array.isArray(schedule)) return 0;
  const now = Date.now(), f = fired || {};
  const due = schedule.filter(e => e.at <= now && !f[e.key]);
  if (!due.length) return 0;
  for (const e of due) f[e.key] = now;
  const keys = new Set(schedule.map(e => e.key));
  for (const k in f) if (!keys.has(k)) delete f[k];
  await kv('readwrite', s => s.put(f, 'fired'));

  const base = { icon: 'icon.svg', badge: 'icon.svg' };
  if (due.length > 3) {
    const L = TXT[due[0].lang] || TXT.zh;
    const names = due.slice(0, 5).map(e => e.name).join(L.sep) + (due.length > 5 ? '…' : '');
    await self.registration.showNotification(L.many(due.length), { ...base, body: names, tag: 'jidela-summary' });
  } else {
    for (const e of due) {
      const body = [`${e.label} ${e.dateText}`, whenText(e), e.amount].filter(Boolean).join('・');
      await self.registration.showNotification(`${e.emoji} ${e.name}`, { ...base, body, tag: e.key });
    }
  }
  return due.length;
}

self.addEventListener('message', e => {
  if (e.data?.type === 'check') e.waitUntil(fireDue().then(n => e.source?.postMessage({ type: 'checked', fired: n })).catch(() => {}));
});
// Android Chrome 安裝成 App 後，瀏覽器會不定期在背景喚醒這裡
self.addEventListener('periodicsync', e => {
  if (e.tag === 'jidela-due') e.waitUntil(fireDue().catch(() => {}));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => (list[0] ? list[0].focus() : self.clients.openWindow('./')))
  );
});
