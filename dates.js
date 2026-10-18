// 日付は Asia/Tokyo 固定の 'YYYY-MM-DD' 文字列で扱う（端末のタイムゾーン設定に依存させない。設計書 §5.5 日付境界）
var D = (function () {
  const PARTS = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
  });
  const DAY_MS = 86400000;
  const pad = n => String(n).padStart(2, '0');

  function parts(now) {
    const p = {};
    for (const x of PARTS.formatToParts(now || new Date())) p[x.type] = x.value;
    return p;
  }
  function todayJst(now) {
    const p = parts(now);
    return `${p.year}-${p.month}-${p.day}`;
  }
  function hourJst(now) {
    return Number(parts(now).hour) % 24;
  }
  function toUtcMs(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }
  function fromUtcMs(ms) {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  function addDays(ymd, n) {
    return fromUtcMs(toUtcMs(ymd) + n * DAY_MS);
  }
  function mondayOf(ymd) {
    const dow = new Date(toUtcMs(ymd)).getUTCDay();
    return addDays(ymd, dow === 0 ? -6 : 1 - dow);
  }
  function md(ymd) {
    const [, m, d] = ymd.split('-').map(Number);
    return `${m}/${d}`;
  }
  return { todayJst, hourJst, addDays, mondayOf, md };
})();
if (typeof module !== 'undefined') module.exports = { D };
