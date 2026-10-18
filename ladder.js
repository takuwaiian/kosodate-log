'use strict';
// 「はしご」画面（設計書 §5.2。親用で子には見せない）。段の確定はオンライン時だけ（§5.5）

const ladderUi = { busy: '', msg: {}, msgError: {} };

function rerenderLadder() {
  if (ui.tab !== 'ladder') return;
  document.getElementById('main').replaceChildren(...renderLadder().filter(Boolean));
}

function proposalLabel(p) {
  if (p.kind === 'up') return S.ladder.proposeUp;
  if (p.kind === 'down') return S.ladder.proposeDown;
  if (p.kind === 'paused') return fmt(S.ladder.paused, { d: D.md(p.until) });
  return '';
}

function renderLadder() {
  const cache = stateCache();
  if (!cache || !cache.ladders || !cache.state) return [el('h1', { text: S.tabs.ladder }), el('p', { class: 'msg error', text: S.error.needOnline })];
  const today = D.todayJst();
  const records = Object.values(rowsForScreen());
  const online = serverReachable();
  return [
    el('h1', { text: S.tabs.ladder }),
    ...LADDERS.map(id => ladderCard(id, cache, records, today, online))
  ];
}

function ladderCard(id, cache, records, today, online) {
  const st = cache.state.find(x => x.ladder_id === id);
  const steps = cache.ladders.filter(l => l.ladder_id === id).sort((a, b) => a.step_no - b.step_no);
  if (!st) return null;
  const cur = st.current_step;
  const top = P.maxStep(cache.ladders, id);
  const p = P.proposal(records, st, cache.ladders, cache.config || {}, today);
  const label = proposalLabel(p);
  const target = p.kind === 'up' ? cur + 1 : p.kind === 'down' ? cur - 1 : null;
  const curRow = steps.find(l => l.step_no === cur);

  const items = steps.map(l => {
    const n = l.step_no;
    const isCur = n === cur;
    const canSet = n >= 1 && n <= top && Math.abs(n - cur) === 1;
    const tags = [];
    if (isCur) tags.push(el('span', { class: 'tag', text: S.ladder.current }));
    if (n === cur + 1) tags.push(el('span', { class: 'tag', text: S.ladder.next }));
    if (n === target) tags.push(el('span', { class: 'tag hint', text: label }));
    return el('li', { class: isCur ? 'step current' : 'step' },
      el('div', { class: 'step-head' }, el('strong', { text: fmt(S.ladder.stepNo, { n }) }), ...tags),
      el('p', { text: l.child_state }),
      l.parent_action ? el('p', { class: 'sub', text: `${S.ladder.parentDo}：${l.parent_action}` }) : null,
      canSet ? el('div', { class: 'row tight-right' }, el('button', {
        class: 'small',
        text: S.ladder.setStep,
        disabled: !online || Boolean(ladderUi.busy),
        onclick: () => setStepFor(id, cur, n)
      })) : null);
  });

  return el('div', { class: 'card' },
    el('div', { class: 'ladder-head' },
      el('strong', { text: `${ladderName(id)}　${fmt(S.ladder.stepNo, { n: cur })}` }),
      label ? el('span', { class: p.kind === 'paused' ? 'tag' : 'tag hint', text: label }) : null),
    curRow && curRow.done_rule ? el('p', { class: 'ifthen' }, el('span', { class: 'sub', text: S.ladder.doneRule + '：' }), curRow.done_rule) : null,
    el('ul', { class: 'steps' }, ...items),
    online ? null : el('p', { class: 'msg error', text: S.error.needOnline }),
    el('p', { class: ladderUi.msgError[id] ? 'msg error' : 'msg', text: ladderUi.msg[id] || '' }));
}

async function setStepFor(id, from, step) {
  const s = settings();
  const say = (text, isError) => { ladderUi.msg[id] = text; ladderUi.msgError[id] = Boolean(isError); };
  if (!s.role) { say(S.settings.chooseRole, true); return rerenderLadder(); }
  if (!confirm(fmt(S.ladder.confirmStep, { name: ladderName(id), n: step }))) return;
  ladderUi.busy = id;
  say(S.settings.checking);
  rerenderLadder();
  const res = await api('set_step', { ladder_id: id, from_step: from, step, decided_by: s.role });
  noteApiResult(res);
  ladderUi.busy = '';
  if (res.ok) {
    applyStateRow(res.data.state);
    say(S.ladder.done);
    await refreshState();
  } else if (res.error.code === 'CONFLICT') {
    if (res.error.state) applyStateRow(res.error.state);
    say(S.ladder.conflict, true);
    await refreshState();
  } else if (['AUTH', 'APP_OUTDATED'].includes(res.error.code)) {
    say('');
    renderBands();
    alert(S.error[res.error.code]);
    return show('settings');
  } else if (res.error.code === 'VALIDATION') {
    say(res.error.message || S.ladder.retry, true);
  } else {
    // タイムアウト・LOCK・INTERNAL：書き込まれたかもしれないので取り直して出し分ける
    await refreshState();
    const now = ((stateCache() || {}).state || []).find(x => x.ladder_id === id);
    if (now && now.current_step === step) say(S.ladder.already);
    else if (now && now.current_step !== from) say(S.ladder.conflict, true);
    else say(S.ladder.retry, true);
  }
  renderBands();
  rerenderLadder();
}
