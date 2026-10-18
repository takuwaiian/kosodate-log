var S = {
  tabs: { today: '今日の記録', ladder: 'はしご', review: 'ふりかえり', settings: '設定' },
  ladderNames: { A: '会話', B: 'あそび', C: '伝える' },
  band: {
    offline: 'オフライン',
    offlineSince: 'オフライン（最終同期：{t}）',
    update: '更新があります',
    reload: '再読み込み'
  },
  badge: { pending: '未送信 {n}件', needsCheck: '確認が必要' },
  error: {
    AUTH: '合言葉が違います。設定を確認してください',
    UNREACHABLE: 'サーバーに接続できません。父に連絡してください',
    APP_OUTDATED: 'アプリが古いです。更新してください',
    SHEET_CONFIG: 'シートの設定を確認してください（前回の内容で表示中）',
    needOnline: 'オンラインで操作してください',
    unsupported: 'このiPhoneでは使えません（iOS 16以上が必要です）'
  },
  today: {
    dayTabs: ['きょう', 'きのう', 'おととい'],
    did: 'やった',
    reactions: ['のった', 'ふつう', 'むずかしそう'],
    save: '保存',
    thisWeek: '今週やってみること',
    goodMoment: '良かった瞬間',
    note: 'ひとこと',
    school: '学校のこと',
    askPrevDay: '前日分として記録しますか？',
    saved: '保存しました',
    noChange: '変更はありません',
    localSaveFailed: 'この端末に保存できませんでした',
    chooseRole: '役割を選んでください'
  },
  ladder: {
    current: '今の段',
    next: '次の段',
    parentDo: '親がやること',
    doneRule: '「やった」を押す条件',
    proposeUp: '提案：上げ',
    proposeDown: '提案：下げ',
    paused: 'お休み中（〜{d}）',
    setStep: 'この段にする',
    conflict: '先に変更されていました。最新の段を表示します',
    already: 'すでにこの段になっています',
    retry: 'もう一度お試しください'
  },
  review: {
    strength: '今週の強み（いいところ）',
    nextWeek: '来週やってみること',
    didDays: '親がやった日数',
    reactionCounts: '反応の内訳',
    goodMoments: '良かった瞬間',
    done: 'ふりかえり完了',
    overwrite: 'この週は記録済み（記録者：{who} {t}）。上書きしますか？',
    askPrevWeek: '先週分として記録しますか？',
    localOnly: '端末内の記録で表示中'
  },
  settings: {
    role: '役割',
    roles: ['父', '母'],
    url: '接続先URL',
    changeUrl: '接続先を変える（ふだんは不要）',
    token: '合言葉',
    queue: '未送信',
    version: '版',
    sendNow: 'いま送る',
    discard: 'この1件を破棄',
    discardConfirm: 'この1件を破棄しますか？',
    checkUpdate: '更新を確認',
    makeTemplate: '観察事実テンプレを作る',
    copy: 'コピー',
    roleConfirm: 'この端末は{role}ですか？',
    chooseRole: '役割を選んでください',
    staleNote: '新しい内容が先にあったため反映しませんでした',
    // 以下は §5.2 の一覧に無い、設定画面だけの補助文言
    saveSettings: '設定を保存',
    connected: '接続できました',
    checking: '確認しています…',
    needAll: '合言葉を入れてください',
    noUpdate: '最新の版です',
    statePending: '未送信',
    stateSending: '送信中'
  },
  stub: 'この画面は次の段階で作ります'
};
if (typeof module !== 'undefined') module.exports = { S };
