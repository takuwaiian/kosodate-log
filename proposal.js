// 段の上げ下げの提案（設計書 §3.1 ルール2）と、日ごとの集計。内部で現在時刻を読まない純関数だけを置く
var P = (function () {
  const HARD = 'むずかしそう';
  const REACTIONS = ['のった', 'ふつう', HARD];
  const DAY_MS = 86400000;

  function ms(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }
  function daysBetween(from, to) {
    return Math.round((ms(to) - ms(from)) / DAY_MS);
  }
  function addDays(ymd, n) {
    const d = new Date(ms(ymd) + n * DAY_MS);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  // はしご1本の行を日ごとに畳む：親がやった日と、その日の反応（食い違えば「むずかしそう」を優先）
  function days(rows) {
    const out = {};
    for (const r of rows) {
      if (!r.did_action) continue;
      const cur = out[r.date];
      const reaction = REACTIONS.includes(r.reaction) ? r.reaction : '';
      if (cur === undefined) out[r.date] = reaction;
      else if (reaction === HARD || (reaction && !cur)) out[r.date] = reaction;
    }
    return out;
  }

  // 反応の内訳（日数）。反応が空の日は数えない
  function counts(dayMap) {
    const c = { 'のった': 0, 'ふつう': 0, [HARD]: 0 };
    for (const v of Object.values(dayMap)) if (v) c[v] += 1;
    return c;
  }

  function maxStep(ladders, id) {
    return ladders.filter(l => l.ladder_id === id).reduce((m, l) => Math.max(m, l.step_no), 0);
  }

  // 戻り値：{kind:'up'|'down'|'none'|'paused', until, did, hard, need, window}
  function proposal(records, state, ladders, config, today) {
    const id = state.ladder_id;
    const cur = state.current_step;
    const out = { kind: 'none', until: '', did: 0, hard: 0, need: 0, window: 0 };
    if (config.pause_until && config.pause_until >= today) return Object.assign(out, { kind: 'paused', until: config.pause_until });
    if (daysBetween(state.since_date, today) < config.min_stay_days) return out;
    const step = ladders.find(l => l.ladder_id === id && l.step_no === cur);
    if (!step) return out;

    const W = Math.max(step.target_window_days, config.min_stay_days);
    const need = Math.ceil(step.target_count * W / step.target_window_days);
    const own = records.filter(r => r.ladder_id === id && r.date >= state.since_date && r.date <= today);
    const inWindow = (map, n) => Object.entries(map).filter(([d]) => d > addDays(today, -n));
    const map = days(own);
    const hardDays = inWindow(map, config.down_window_days).filter(([, v]) => v === HARD).length;
    const did = inWindow(map, W);
    const notHard = did.filter(([, v]) => v !== HARD).length;
    Object.assign(out, { did: did.length, hard: did.length - notHard, need, window: W });

    if (hardDays >= config.down_count && cur > 1) return Object.assign(out, { kind: 'down' });
    if (did.length >= need && notHard * 2 > did.length && cur < maxStep(ladders, id)) return Object.assign(out, { kind: 'up' });
    return out;
  }

  return { proposal, days, counts, maxStep, daysBetween, addDays, HARD, REACTIONS };
})();
if (typeof module !== 'undefined') module.exports = { P, proposal: P.proposal };
