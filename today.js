'use strict';
// 「今日の記録」画面（設計書 §5.2）

const LADDERS = ['A', 'B', 'C'];
const TEXT_MAX = 500;

// base＝「きょう」の日付、day＝0/1/2（きょう／きのう／おととい）、draft＝入力中の内容、baseline＝開いた時点の内容
const todayUi = { base: null, day: 0, draft: null, baseline: null, msg: '', msgError: false };

function ladderName(id) {
  const c = stateCache();
  return (c && c.config && c.config['ladder_name_' + id]) || S.ladderNames[id];
}

function otherRole(role) {
  return role === '父' ? '母' : '父';
}

function rowsForScreen() {
  return Q.overlay((stateCache() || {}).recent || [], loadQueue());
}

function draftFrom(date, role) {
  const rows = rowsForScreen();
  const own = id => rows[Q.rowKey({ date, ladder_id: id, role })] || null;
  const d = { date, rows: {}, good_moment: '', note: '', school_event: '' };
  for (const id of LADDERS) {
    const r = own(id);
    d.rows[id] = { did: Boolean(r && r.did_action), reaction: (r && r.did_action && r.reaction) || '' };
  }
  const a = own('A');
  const c = own('C');
  d.good_moment = (a && a.good_moment) || '';
  d.note = (a && a.note) || '';
  d.school_event = (c && c.school_event) || '';
  return d;
}

function copyDraft(d) {
  return JSON.parse(JSON.stringify(d));
}

function changedLadders() {
  const d = todayUi.draft;
  const b = todayUi.baseline;
  if (!d || !b) return [];
  return LADDERS.filter(id => {
    const x = d.rows[id];
    const y = b.rows[id];
    if (x.did !== y.did || x.reaction !== y.reaction) return true;
    if (id === 'A') return d.good_moment !== b.good_moment || d.note !== b.note;
    if (id === 'C') return d.school_event !== b.school_event;
    return false;
  });
}

function todayDirty() {
  return changedLadders().length > 0;
}

// 基準日を計算し直す。未保存の変更がある間は切り替えない
function syncBaseDate() {
  const base = D.todayJst();
  if (todayUi.base === base || todayDirty()) return;
  todayUi.base = base;
  todayUi.day = 0;
  todayUi.draft = null;
}

function rerenderToday() {
  if (ui.tab !== 'today') return;
  document.getElementById('main').replaceChildren(...renderToday().filter(Boolean));
}

function renderToday() {
  const s = settings();
  syncBaseDate();
  const date = D.addDays(todayUi.base, -todayUi.day);
  if (!todayUi.draft || todayUi.draft.date !== date) {
    todayUi.draft = s.role ? draftFrom(date, s.role) : draftFrom(date, '');
    todayUi.baseline = copyDraft(todayUi.draft);
  }
  const d = todayUi.draft;
  const dirty = todayDirty();
  const rows = rowsForScreen();
  const weekly = weeklyFor(date);
  if (weekly === null) fetchWeeklyFor(date);

  const dayTabs = S.today.dayTabs.map((label, i) => el('button', {
    'aria-pressed': i === todayUi.day ? 'true' : 'false',
    disabled: dirty && i !== todayUi.day,
    text: `${label} ${D.md(D.addDays(todayUi.base, -i))}`,
    onclick: () => {
      if (i === todayUi.day) return;
      todayUi.day = i;
      todayUi.draft = null;
      todayUi.msg = '';
      rerenderToday();
    }
  }));

  const cards = LADDERS.map(id => {
    const r = d.rows[id];
    const ifThen = (weekly || []).find(w => w.ladder_id === id);
    const own = rows[Q.rowKey({ date, ladder_id: id, role: s.role })];
    const other = rows[Q.rowKey({ date, ladder_id: id, role: otherRole(s.role) })];
    const toggle = () => {
      r.did = !r.did;
      if (!r.did) r.reaction = '';
      todayUi.msg = '';
      rerenderToday();
    };
    const pick = name => () => {
      r.reaction = r.reaction === name ? '' : name;
      todayUi.msg = '';
      rerenderToday();
    };
    return el('div', { class: 'card ladder-row' },
      el('div', { class: 'ladder-head' },
        el('strong', { text: ladderName(id) }),
        own && own.needsCheck ? el('span', { class: 'tag warn', text: S.badge.needsCheck }) : null),
      ifThen && ifThen.next_if_then ? el('p', { class: 'ifthen' },
        el('span', { class: 'sub', text: S.today.thisWeek + '：' }), ifThen.next_if_then) : null,
      el('div', { class: 'row tight' },
        el('button', { class: 'did', 'aria-pressed': r.did ? 'true' : 'false', text: S.today.did, onclick: toggle }),
        ...S.today.reactions.map(name => el('button', {
          'aria-pressed': r.reaction === name ? 'true' : 'false',
          disabled: !r.did,
          text: name,
          onclick: pick(name)
        }))),
      other && other.did_action ? el('p', { class: 'other', text: `${otherRole(s.role)}：${S.today.did}${other.reaction ? '・' + other.reaction : ''}` }) : null);
  });

  const field = (key, label) => {
    const box = el('textarea', { id: 'f-' + key, rows: '2', maxlength: String(TEXT_MAX) });
    box.value = d[key];
    box.addEventListener('input', () => {
      const wasDirty = todayDirty();
      d[key] = box.value;
      if (wasDirty !== todayDirty()) refreshDayTabs();
    });
    return [el('label', { for: 'f-' + key, text: label }), box];
  };

  const counts = Q.counts(loadQueue());
  const badge = counts.total ? el('p', { class: 'badge' },
    el('span', { text: fmt(S.badge.pending, { n: counts.total }) }),
    counts.needsCheck ? el('span', { class: 'tag warn', text: S.badge.needsCheck }) : null) : null;

  const msg = el('p', { class: todayUi.msgError ? 'msg error' : 'msg', text: s.role ? todayUi.msg : S.today.chooseRole });
  const save = el('button', { class: 'primary wide', text: S.today.save, disabled: !s.role, onclick: () => saveToday(msg) });

  return [
    el('h1', { text: S.tabs.today }),
    badge,
    el('div', { class: 'seg', id: 'day-tabs' }, ...dayTabs),
    ...cards,
    el('div', { class: 'card' },
      ...field('good_moment', S.today.goodMoment),
      ...field('note', S.today.note),
      ...field('school_event', S.today.school)),
    el('div', { class: 'row' }, save),
    msg
  ];
}

// 自由記述の入力で「変更あり」が切り替わったときだけ、日付タブの押せる・押せないを直す
function refreshDayTabs() {
  const dirty = todayDirty();
  document.querySelectorAll('#day-tabs button').forEach((b, i) => { b.disabled = dirty && i !== todayUi.day; });
}

function saveToday(msgEl) {
  const say = (text, isError) => {
    todayUi.msg = text;
    todayUi.msgError = Boolean(isError);
    msgEl.textContent = text;
    msgEl.className = isError ? 'msg error' : 'msg';
  };
  const s = settings();
  if (!s.role) return say(S.today.chooseRole, true);
  const cache = stateCache();
  if (!cache || !cache.state) return say(S.error.needOnline, true);
  const ids = changedLadders();
  if (!ids.length) return say(S.today.noChange);

  const d = todayUi.draft;
  let date = d.date;
  if (todayUi.day === 0 && D.hourJst() < 3 && confirm(S.today.askPrevDay)) date = D.addDays(date, -1);
  const payloads = ids.map(id => {
    const st = cache.state.find(x => x.ladder_id === id);
    const r = d.rows[id];
    return {
      date, ladder_id: id, role: s.role,
      step: st ? st.current_step : 1,
      did_action: r.did,
      reaction: r.did ? r.reaction : '',
      good_moment: id === 'A' ? d.good_moment.trim() : '',
      note: id === 'A' ? d.note.trim() : '',
      school_event: id === 'C' ? d.school_event.trim() : ''
    };
  });
  if (!saveDaily(payloads)) return say(S.today.localSaveFailed, true);
  todayUi.draft = null; // 保存した内容（キューを重ねた値）で開き直す＝比較の基準を更新
  todayUi.msg = S.today.saved;
  todayUi.msgError = false;
  rerenderToday();
  renderBands();
  flush(true);
}
