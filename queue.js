// 送信キューの規則（設計書 §5.5 送信キュー）。保存先や通信には触れない純関数だけを置く
var Q = (function () {
  const PENDING = '未送信';
  const SENDING = '送信中';
  const NEEDS_CHECK = '要対応';
  const MAX_TIMER_ATTEMPTS = 10;
  const BACKOFF_S = [1, 4, 16, 60];
  const HOLD_CODES = ['VALIDATION', 'AUTH', 'APP_OUTDATED'];

  function rowKey(p) {
    return `${p.date}|${p.ladder_id}|${p.role}`;
  }
  function itemKey(item) {
    return item.action === 'put_daily' ? rowKey(item.payload) : `${item.action}|${item.payload.week_start || ''}`;
  }

  // 未送信の同じキーがあれば置き換えて1件に畳む（新しい mutation_id）。送信中なら畳まず後ろに積む
  function enqueue(queue, action, payload, newId, nowIso) {
    const item = { mutation_id: newId, action, payload, created_at: nowIso, attempts: 0, status: PENDING, last_error: '', next_at: 0 };
    const k = itemKey(item);
    const i = queue.findIndex(x => x.status === PENDING && itemKey(x) === k);
    if (i >= 0) return queue.map((x, j) => (j === i ? item : x));
    return queue.concat([item]);
  }

  // client_seq = max(端末内の値, サーバの同じ行の値) + 1
  function nextSeq(seqs, key, recent) {
    const server = recent.filter(r => rowKey(r) === key).reduce((m, r) => Math.max(m, Number(r.client_seq) || 0), 0);
    return Math.max(seqs[key] || 0, server) + 1;
  }
  function raiseSeqs(seqs, recent) {
    const out = Object.assign({}, seqs);
    for (const r of recent) {
      const k = rowKey(r);
      out[k] = Math.max(out[k] || 0, Number(r.client_seq) || 0);
    }
    return out;
  }

  function backoffMs(attempts) {
    return BACKOFF_S[Math.min(attempts, BACKOFF_S.length) - 1] * 1000;
  }

  // 次に送る1件。force（online・起動・前面復帰・保存・いま送る）は時刻と上限を無視し、tried にある件は除く
  function pickNext(queue, nowMs, force, tried) {
    return queue.find(x => x.status === PENDING && !(tried || []).includes(x.mutation_id) &&
      (force || (x.attempts <= MAX_TIMER_ATTEMPTS && x.next_at <= nowMs))) || null;
  }

  // 送信結果を反映した新しいキューと、画面への知らせを返す
  function applyResult(queue, mutationId, res, nowMs) {
    const i = queue.findIndex(x => x.mutation_id === mutationId);
    if (i < 0) return { queue, done: false, stale: false };
    const item = Object.assign({}, queue[i]);
    if (res.ok) {
      return { queue: queue.filter((_, j) => j !== i), done: true, stale: Boolean(res.data && res.data.stale) };
    }
    const code = res.error.code;
    item.attempts += 1;
    item.last_error = res.error.message || code;
    if (HOLD_CODES.includes(code) || (code === 'INTERNAL' && item.attempts > MAX_TIMER_ATTEMPTS)) {
      item.status = NEEDS_CHECK;
    } else {
      item.status = PENDING;
      item.next_at = nowMs + backoffMs(item.attempts);
    }
    return { queue: queue.map((x, j) => (j === i ? item : x)), done: false, stale: false };
  }

  function markSending(queue, mutationId) {
    return queue.map(x => (x.mutation_id === mutationId ? Object.assign({}, x, { status: SENDING }) : x));
  }
  // 起動時：送信中のまま残った件を未送信に戻す
  function resetSending(queue) {
    return queue.map(x => (x.status === SENDING ? Object.assign({}, x, { status: PENDING }) : x));
  }
  // 設定の保存直後・版が上がった直後・［いま送る］：要対応も未送信に戻し、試行回数を0にする
  function resetAll(queue) {
    return queue.map(x => Object.assign({}, x, { status: PENDING, attempts: 0, next_at: 0 }));
  }
  // オフラインで試さなかった件は回数を増やさない（呼び出し側が送らないだけ）。次のタイマー時刻
  function nextTimerAt(queue) {
    const due = queue.filter(x => x.status === PENDING && x.attempts <= MAX_TIMER_ATTEMPTS).map(x => x.next_at);
    return due.length ? Math.min(...due) : null;
  }

  // サーバの行の上に、自端末のキュー（要対応を含む）を古い順に重ねる
  function overlay(recent, queue) {
    const rows = {};
    for (const r of recent) rows[rowKey(r)] = Object.assign({}, r, { pending: false, needsCheck: false });
    for (const x of queue) {
      if (x.action !== 'put_daily') continue;
      const k = rowKey(x.payload);
      const earlier = Boolean(rows[k] && rows[k].needsCheck);
      rows[k] = Object.assign({}, x.payload, { pending: true, needsCheck: earlier || x.status === NEEDS_CHECK });
    }
    return rows;
  }

  function counts(queue) {
    return { total: queue.length, needsCheck: queue.filter(x => x.status === NEEDS_CHECK).length };
  }

  return { PENDING, SENDING, NEEDS_CHECK, rowKey, enqueue, nextSeq, raiseSeqs, pickNext, applyResult, markSending, resetSending, resetAll, nextTimerAt, overlay, counts, backoffMs };
})();
if (typeof module !== 'undefined') module.exports = { Q };
