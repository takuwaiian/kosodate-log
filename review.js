'use strict';
// 「ふりかえり」画面（設計書 §5.2）。日曜夕食後に、今週の集計を見て強みと来週の if-then を選ぶ

// week＝対象の月曜、server＝get_week の結果（null＝未取得、false＝取れなかった）、pick＝選んだ内容
const reviewUi = { week: null, server: null, loading: false, pick: null, msg: '', msgError: false };

function rerenderReview() {
  if (ui.tab !== 'review') return;
  document.getElementById('main').replaceChildren(...renderReview().filter(Boolean));
}

// タブを開くたびに対象週を決め直す。月曜0〜3時なら先週分にするか聞く
function openReview() {
  const today = D.todayJst();
  let week = D.mondayOf(today);
  if (week === today && D.hourJst() < 3 && confirm(S.review.askPrevWeek)) week = D.addDays(week, -7);
  if (reviewUi.week !== week) reviewUi.pick = null;
  reviewUi.week = week;
  reviewUi.server = null;
  reviewUi.msg = '';
  loadWeek(week);
}

async function loadWeek(week) {
  if (!settingsReady(settings())) { reviewUi.server = false; return; }
  reviewUi.loading = true;
  const res = await api('get_week', { week_start: week });
  noteApiResult(res);
  reviewUi.loading = false;
  if (reviewUi.week !== week) return;
  reviewUi.server = res.ok ? res.data : false;
  renderBands();
  rerenderReview();
}

// 表示用の行：サーバの7日分（取れなければ端末内の28日分）に自端末のキューを重ねる
function weekRows(week) {
  const end = D.addDays(week, 6);
  const base = reviewUi.server ? reviewUi.server.daily : ((stateCache() || {}).recent || []);
  return Object.values(Q.overlay(base, loadQueue())).filter(r => r.date >= week && r.date <= end);
}

function savedWeekly(week) {
  const queued = loadQueue().filter(x => x.action === 'put_weekly' && x.payload.week_start === week).pop();
  if (queued) return queued.payload.rows;
  return reviewUi.server ? reviewUi.server.weekly : [];
}

function summarize(rows, id) {
  const map = P.days(rows.filter(r => r.ladder_id === id));
  const c = P.counts(map);
  return { did: Object.keys(map).length, counts: c, text: P.REACTIONS.map(k => `${k}:${c[k]}`).join(',') };
}

function stepOf(id) {
  const st = ((stateCache() || {}).state || []).find(x => x.ladder_id === id);
  return st ? st.current_step : null;
}

function ifThenOptions(id) {
  const cache = stateCache() || {};
  const step = stepOf(id);
  const row = (cache.ladders || []).find(l => l.ladder_id === id && l.step_no === step);
  return row && row.if_then_options ? row.if_then_options.split('／').map(x => x.trim()).filter(Boolean) : [];
}

function renderReview() {
  if (!reviewUi.week) openReview();
  const week = reviewUi.week;
  const cache = stateCache();
  const head = [el('h1', { text: S.tabs.review }), el('p', { class: 'meta top', text: fmt(S.review.weekOf, { from: D.md(week), to: D.md(D.addDays(week, 6)) }) })];
  if (!cache || !cache.state || !cache.ladders) return head.concat([el('p', { class: 'msg error', text: S.error.needOnline })]);

  const rows = weekRows(week);
  const saved = savedWeekly(week);
  if (!reviewUi.pick) {
    const a = saved.find(w => w.ladder_id === 'A');
    reviewUi.pick = { strength: (a && a.strength_word) || '', ifThen: {} };
    for (const id of LADDERS) {
      const w = saved.find(x => x.ladder_id === id);
      reviewUi.pick.ifThen[id] = (w && ifThenOptions(id).includes(w.next_if_then)) ? w.next_if_then : '';
    }
  }
  const pick = reviewUi.pick;

  const stats = LADDERS.map(id => {
    const x = summarize(rows, id);
    return el('div', { class: 'card' },
      el('div', { class: 'ladder-head' }, el('strong', { text: ladderName(id) }), el('span', { class: 'sub', text: fmt(S.ladder.stepNo, { n: stepOf(id) }) })),
      el('p', { class: 'ifthen', text: `${S.review.didDays}：${fmt(S.review.days, { n: x.did })}` }),
      el('p', { class: 'ifthen', text: `${S.review.reactionCounts}：${P.REACTIONS.map(k => `${k} ${x.counts[k]}`).join('／')}` }));
  });

  const goods = rows.filter(r => (r.good_moment || '').trim()).sort((a, b) => (a.date < b.date ? -1 : 1))
    .map(r => el('li', { text: `${D.md(r.date)}（${r.role}）${r.good_moment.trim()}` }));

  const words = String((cache.config || {}).strength_words || '').split('／').map(x => x.trim()).filter(Boolean);
  const choose = (current, value, set) => el('button', {
    'aria-pressed': current === value ? 'true' : 'false',
    text: value,
    onclick: () => { set(current === value ? '' : value); reviewUi.msg = ''; rerenderReview(); }
  });

  const ifThens = LADDERS.map(id => el('div', { class: 'card' },
    el('strong', { text: ladderName(id) }),
    el('div', { class: 'choices' }, ...ifThenOptions(id).map(o => choose(pick.ifThen[id], o, v => { pick.ifThen[id] = v; })))));

  const note = reviewUi.server === false ? el('p', { class: 'tag-line', text: S.review.localOnly }) : null;
  const msg = el('p', { class: reviewUi.msgError ? 'msg error' : 'msg', text: settings().role ? reviewUi.msg : S.settings.chooseRole });

  return head.concat([
    note,
    el('h2', { text: `${S.review.didDays}・${S.review.reactionCounts}` }),
    ...stats,
    el('h2', { text: S.review.goodMoments }),
    goods.length ? el('ul', { class: 'goods' }, ...goods) : el('p', { class: 'sub', text: S.review.none }),
    el('h2', { text: S.review.strength }),
    el('div', { class: 'card choices' }, ...words.map(w => choose(pick.strength, w, v => { pick.strength = v; }))),
    el('h2', { text: S.review.nextWeek }),
    ...ifThens,
    el('div', { class: 'row' }, el('button', {
      class: 'primary wide',
      text: S.review.done,
      disabled: !settings().role || reviewUi.loading,
      onclick: saveReview
    })),
    msg
  ]);
}

function saveReview() {
  const s = settings();
  const say = (text, isError) => { reviewUi.msg = text; reviewUi.msgError = Boolean(isError); rerenderReview(); };
  if (!s.role) return say(S.settings.chooseRole, true);
  const pick = reviewUi.pick;
  if (!pick.strength || LADDERS.some(id => ifThenOptions(id).length && !pick.ifThen[id])) return say(S.review.needPick, true);
  const week = reviewUi.week;
  const saved = savedWeekly(week);
  if (saved.length) {
    const a = saved.find(w => w.ladder_id === 'A') || saved[0];
    const t = a.updated_at ? timeLabel(a.updated_at) : '';
    if (!confirm(fmt(S.review.overwrite, { who: a.decided_by || '', t }))) return;
  }
  const rows = weekRows(week);
  const payload = {
    week_start: week,
    rows: LADDERS.map(id => {
      const x = summarize(rows, id);
      const first = rows.filter(r => r.ladder_id === id && r.step !== null && r.step !== undefined).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
      return {
        ladder_id: id,
        step_before: first ? first.step : stepOf(id),
        step_after: stepOf(id),
        did_days: x.did,
        reaction_counts: x.text,
        strength_word: pick.strength,
        next_if_then: pick.ifThen[id] || '',
        decided_by: s.role,
        updated_at: new Date().toISOString() // 送信前の上書き確認の表示用。サーバは自分の時刻で保存する
      };
    })
  };
  if (!saveWeekly(payload)) return say(S.today.localSaveFailed, true);
  say(S.today.saved);
  renderBands();
  flush(true).then(() => { if (reviewUi.week === week) loadWeek(week); });
}
