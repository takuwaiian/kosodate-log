'use strict';
// 端末内の保存（キュー・連番・最終状態）と、サーバとのやり取り（設計書 §5.5）

const KEY_QUEUE = 'queue';
const KEY_SEQS = 'seqs';
const KEY_CACHE = 'state_cache';
const KEY_WEEKLY = 'weekly_prev';
const KEY_STALE = 'stale_notes';
const KEY_SEEN_VERSION = 'seen_version';
const STALE_KEEP = 20;
const UNREACHABLE_AFTER = 3;

const sync = { running: false, rerun: null, timer: null, netFails: 0, alert: '', onChange: () => {} };

function loadQueue() { return store.get(KEY_QUEUE, []); }
function saveQueue(q) { return store.set(KEY_QUEUE, q); }
function stateCache() { return store.get(KEY_CACHE, null); }

// 今日の記録の［保存］：連番を付けてキューへ。端末に書けなければ false
function saveDaily(payloads) {
  const recent = (stateCache() || {}).recent || [];
  const seqs = Object.assign({}, store.get(KEY_SEQS, {}));
  let q = loadQueue();
  const now = new Date().toISOString();
  for (const p of payloads) {
    const k = Q.rowKey(p);
    seqs[k] = Q.nextSeq(seqs, k, recent);
    q = Q.enqueue(q, 'put_daily', Object.assign({}, p, { updated_at: now, client_seq: seqs[k] }), crypto.randomUUID(), now);
  }
  if (!saveQueue(q)) return false;
  store.set(KEY_SEQS, seqs);
  return true;
}

function noteApiResult(res) {
  if (res.ok) { sync.netFails = 0; return; }
  if (res.error.code === 'NETWORK') { if (navigator.onLine) sync.netFails += 1; return; }
  sync.netFails = 0;
  if (['AUTH', 'APP_OUTDATED', 'SHEET_CONFIG'].includes(res.error.code)) sync.alert = S.error[res.error.code];
}

function serverReachable() {
  return navigator.onLine && sync.netFails === 0;
}

function unreachable() {
  return navigator.onLine && sync.netFails >= UNREACHABLE_AFTER;
}

// キューを1件ずつ送る。force は online・起動・前面復帰・保存・［いま送る］の契機
async function flush(force) {
  if (sync.running) { sync.rerun = sync.rerun || (force ? 'force' : 'timer'); return; }
  if (!settingsReady(settings())) return;
  sync.running = true;
  clearTimeout(sync.timer);
  const tried = [];
  let changed = false;
  try {
    while (navigator.onLine) {
      const item = Q.pickNext(loadQueue(), Date.now(), force, tried);
      if (!item) break;
      tried.push(item.mutation_id);
      saveQueue(Q.markSending(loadQueue(), item.mutation_id));
      const res = await api(item.action, item.payload, item.mutation_id);
      noteApiResult(res);
      const r = Q.applyResult(loadQueue(), item.mutation_id, res, Date.now());
      saveQueue(r.queue);
      if (r.done) changed = true;
      if (r.stale) addStaleNote(item.payload);
      if (res.ok && sync.alert !== S.error.SHEET_CONFIG) sync.alert = '';
    }
  } finally {
    sync.running = false;
  }
  scheduleFlush();
  sync.onChange();
  if (changed) await refreshState();
  if (sync.rerun) {
    const f = sync.rerun === 'force';
    sync.rerun = null;
    flush(f);
  }
}

function scheduleFlush() {
  clearTimeout(sync.timer);
  if (!navigator.onLine) return; // 圏外では試さず、online の合図を待つ
  const at = Q.nextTimerAt(loadQueue());
  if (at !== null) sync.timer = setTimeout(() => flush(false), Math.max(0, at - Date.now()));
}

function addStaleNote(p) {
  const notes = store.get(KEY_STALE, []);
  notes.unshift({ date: p.date, ladder_id: p.ladder_id, at: new Date().toISOString() });
  store.set(KEY_STALE, notes.slice(0, STALE_KEEP));
}

// get_state を取り、端末内の最終状態として保存する（キューは消さない）
async function refreshState() {
  if (!settingsReady(settings())) return;
  const date = D.todayJst();
  const res = await api('get_state', { date });
  noteApiResult(res);
  if (res.ok) {
    store.set(KEY_CACHE, Object.assign({ date }, res.data));
    rememberWeekly(date, res.data.weekly_prev);
    store.set(KEY_SEQS, Q.raiseSeqs(store.get(KEY_SEQS, {}), res.data.recent));
    sync.alert = '';
  }
  sync.onChange();
}

function prevWeekOf(date) {
  return D.addDays(D.mondayOf(date), -7);
}

function rememberWeekly(date, rows) {
  const map = store.get(KEY_WEEKLY, {});
  map[prevWeekOf(date)] = rows;
  const keys = Object.keys(map).sort().slice(-4); // 直近4週分だけ残す
  store.set(KEY_WEEKLY, Object.fromEntries(keys.map(k => [k, map[k]])));
}

function weeklyFor(date) {
  const map = store.get(KEY_WEEKLY, {});
  const k = prevWeekOf(date);
  return k in map ? map[k] : null;
}

// きのう・おとといが前の週にあたるとき、その週の「今週やってみること」を取りに行く
async function fetchWeeklyFor(date) {
  if (weeklyFor(date) !== null || !serverReachable() || !settingsReady(settings())) return;
  const res = await api('get_state', { date });
  noteApiResult(res);
  if (res.ok) {
    rememberWeekly(date, res.data.weekly_prev);
    sync.onChange();
  }
}

// 起動時：送信中のまま残った件を戻し、版が上がっていれば要対応も戻す
function prepareQueue() {
  let q = Q.resetSending(loadQueue());
  if (store.get(KEY_SEEN_VERSION, null) !== APP_VERSION) {
    q = Q.resetAll(q);
    store.set(KEY_SEEN_VERSION, APP_VERSION);
  }
  saveQueue(q);
}

function discardItem(mutationId) {
  saveQueue(loadQueue().filter(x => x.mutation_id !== mutationId));
  sync.onChange();
}

function resetQueueAndSend() {
  saveQueue(Q.resetAll(loadQueue()));
  flush(true);
}
