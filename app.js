'use strict';

const API_TIMEOUT_MS = 25000;
const KEY_SETTINGS = 'settings';
const KEY_LAST_SYNC = 'last_sync';

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
};

function fmt(text, vars) {
  return text.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : ''));
}

function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'onclick') node.addEventListener('click', v);
    else if (k === 'text') node.textContent = v;
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

function supported() {
  if (!('serviceWorker' in navigator)) return false;
  if (!(window.crypto && typeof crypto.randomUUID === 'function')) return false;
  try {
    localStorage.setItem('__probe', '1');
    localStorage.removeItem('__probe');
  } catch (e) { return false; }
  return true;
}

function settings() {
  return store.get(KEY_SETTINGS, { role: '', url: '', token: '' });
}

function settingsReady(s) {
  return Boolean(s.url && s.token);
}

async function api(action, payload) {
  const s = settings();
  const body = JSON.stringify({
    token: s.token,
    action,
    payload: payload || {},
    client: { role: s.role, app_version: APP_VERSION, mutation_id: crypto.randomUUID() }
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(s.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow',
      signal: ctrl.signal
    });
    const json = JSON.parse(await res.text());
    if (typeof json !== 'object' || json === null || typeof json.ok !== 'boolean') throw new Error('bad response');
    if (json.ok) store.set(KEY_LAST_SYNC, new Date().toISOString());
    return json;
  } catch (e) {
    return { ok: false, error: { code: 'NETWORK', message: '' } };
  } finally {
    clearTimeout(timer);
  }
}

function errorText(err) {
  if (err.code === 'NETWORK') return navigator.onLine ? S.error.UNREACHABLE : S.band.offline;
  return S.error[err.code] || err.message || S.error.UNREACHABLE;
}

// ---- 帯（オフライン・更新） ----

const ui = { tab: 'today', waitingWorker: null, reloading: false, userAskedReload: false };

function lastSyncLabel() {
  const iso = store.get(KEY_LAST_SYNC, '');
  if (!iso) return '';
  const p = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(new Date(iso));
  const get = t => p.find(x => x.type === t).value;
  return `${get('month')}/${get('day')} ${get('hour')}:${get('minute')}`;
}

function renderBands() {
  const box = document.getElementById('bands');
  box.replaceChildren();
  if (!navigator.onLine) {
    const t = lastSyncLabel();
    box.append(el('div', { class: 'band', text: t ? fmt(S.band.offlineSince, { t }) : S.band.offline }));
  }
  if (ui.waitingWorker) {
    box.append(el('div', { class: 'band' },
      el('span', { text: S.band.update }),
      el('button', { class: 'primary', text: S.band.reload, onclick: applyUpdate })));
  }
}

function applyUpdate() {
  if (!ui.waitingWorker) return;
  ui.userAskedReload = true;
  ui.waitingWorker.postMessage('skipWaiting');
}

// ---- 画面 ----

const TABS = ['today', 'ladder', 'review', 'settings'];

function renderTabs() {
  const nav = document.getElementById('tabs');
  nav.replaceChildren(...TABS.map(t => el('button', {
    'aria-current': ui.tab === t ? 'page' : false,
    text: S.tabs[t],
    onclick: () => show(t)
  })));
}

function show(tab) {
  ui.tab = tab;
  renderTabs();
  const main = document.getElementById('main');
  main.replaceChildren(...SCREENS[tab]());
  window.scrollTo(0, 0);
}

function headingList(title, items) {
  return [el('h1', { text: title }), ...items.map(t => el('h2', { text: t })), el('p', { class: 'stub', text: S.stub })];
}

const SCREENS = {
  today() {
    const s = settings();
    const msg = el('p', { class: 'msg' });
    const save = el('button', { class: 'primary', text: S.today.save, disabled: !s.role, onclick: () => { msg.textContent = S.stub; } });
    if (!s.role) msg.textContent = S.today.chooseRole;
    const ladders = Object.values(S.ladderNames).map(name => el('div', { class: 'card' },
      el('strong', { text: name }),
      el('div', { class: 'row' }, el('button', { text: S.today.did, disabled: true }))));
    return [
      el('h1', { text: S.tabs.today }),
      el('div', { class: 'seg' }, ...S.today.dayTabs.map((d, i) => el('button', { 'aria-pressed': i === 0 ? 'true' : 'false', disabled: true, text: d }))),
      el('h2', { text: S.today.thisWeek }),
      ...ladders,
      el('p', { class: 'stub', text: S.stub }),
      el('div', { class: 'row' }, save),
      msg
    ];
  },
  ladder() {
    return headingList(S.tabs.ladder, [S.ladder.current, S.ladder.next, S.ladder.parentDo, S.ladder.doneRule]);
  },
  review() {
    return headingList(S.tabs.review, [S.review.didDays, S.review.reactionCounts, S.review.goodMoments, S.review.strength, S.review.nextWeek]);
  },
  settings: renderSettings
};

function renderSettings() {
  const s = settings();
  const msg = el('p', { class: 'msg' });
  const say = (text, isError) => { msg.textContent = text; msg.className = isError ? 'msg error' : 'msg'; };

  const roleButtons = S.settings.roles.map(r => el('button', {
    'aria-pressed': s.role === r ? 'true' : 'false',
    text: r,
    onclick: () => {
      if (settings().role === r) return;
      if (!confirm(fmt(S.settings.roleConfirm, { role: r }))) return;
      const next = Object.assign(settings(), { role: r });
      if (!store.set(KEY_SETTINGS, next)) return say(S.today.localSaveFailed, true);
      show('settings');
    }
  }));

  const noFix = { autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', autocomplete: 'off' };
  const url = el('input', Object.assign({ id: 'set-url', type: 'url', inputmode: 'url', value: s.url }, noFix));
  const token = el('input', Object.assign({ id: 'set-token', type: 'password', value: s.token }, noFix));

  async function saveSettings() {
    const next = Object.assign(settings(), { url: url.value.trim(), token: token.value.trim() });
    url.value = next.url;
    token.value = next.token;
    if (!settingsReady(next)) return say(S.settings.needAll, true);
    if (!store.set(KEY_SETTINGS, next)) return say(S.today.localSaveFailed, true);
    await pingAndSay(say);
  }

  async function checkUpdate() {
    say(S.settings.checking);
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) { try { await reg.update(); } catch (e) { /* オフライン時は ping の結果で知らせる */ } }
    if (settingsReady(settings())) await pingAndSay(say, ui.waitingWorker ? S.band.update : S.settings.noUpdate);
    else say(ui.waitingWorker ? S.band.update : S.settings.noUpdate);
  }

  return [
    el('h1', { text: S.tabs.settings }),
    el('div', { class: 'card' },
      el('label', { text: S.settings.role }),
      el('div', { class: 'seg' }, ...roleButtons),
      s.role ? null : el('p', { class: 'msg error', text: S.settings.chooseRole }),
      el('label', { for: 'set-url', text: S.settings.url }), url,
      el('label', { for: 'set-token', text: S.settings.token }), token,
      el('div', { class: 'row' }, el('button', { class: 'primary', text: S.settings.saveSettings, onclick: saveSettings })),
      msg),
    el('h2', { text: S.settings.queue }),
    el('p', { class: 'stub', text: S.stub }),
    el('div', { class: 'row' }, el('button', { text: S.settings.checkUpdate, onclick: checkUpdate })),
    el('p', { class: 'meta', text: `${S.settings.version} ${APP_VERSION}` })
  ];
}

async function pingAndSay(say, okText) {
  say(S.settings.checking);
  const r = await api('ping');
  renderBands();
  if (r.ok) say(okText || S.settings.connected);
  else say(errorText(r.error), true);
}

// ---- Service Worker ----

function watchWorker(reg) {
  const check = () => {
    if (reg.waiting && navigator.serviceWorker.controller) {
      ui.waitingWorker = reg.waiting;
      renderBands();
    }
  };
  check();
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') check(); });
  });
}

async function setupWorker() {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!ui.userAskedReload || ui.reloading) return;
    ui.reloading = true;
    location.reload();
  });
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    watchWorker(reg);
    reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  } catch (e) { /* 登録できなくても画面は使える。次の起動で再試行 */ }
}

// ---- 起動 ----

function start() {
  if (!supported()) {
    document.getElementById('main').replaceChildren(el('p', { class: 'fatal', text: S.error.unsupported }));
    return;
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  window.addEventListener('online', renderBands);
  window.addEventListener('offline', renderBands);
  renderBands();
  show(settingsReady(settings()) ? 'today' : 'settings');
  setupWorker();
}

start();
