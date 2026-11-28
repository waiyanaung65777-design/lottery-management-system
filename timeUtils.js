/**
 * Bangkok Timezone (Asia/Bangkok, ICT UTC+7) Utilities & Session Scheduler
 * Exactly matches Thailand Krung Thep official local time (timeanddate.com/worldclock/thailand/bangkok)
 *
 * Rules:
 * - 2D Morning: Result at 12:30 PM ICT, Cutoff strictly at 12:00 PM ICT
 * - 2D Evening: Result at 04:30 PM ICT, Cutoff strictly at 04:00 PM ICT
 * - All comparisons use UTC epoch milliseconds with explicit +07:00 offsets,
 *   making it completely immune to server OS timezone or client device timezone.
 */

const TIMEZONE = 'Asia/Bangkok';

/**
 * Returns exact Bangkok calendar & clock components for any Date
 * @param {Date|number} [date=new Date()]
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, second: number, dateStr: string, time24: string, time12: string }}
 */
function getBangkokComponents(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);

  const formatter24 = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter24.formatToParts(d);
  const map = {};
  for (const p of parts) map[p.type] = p.value;

  const formatter12 = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour: parseInt(map.hour, 10),
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10),
    dateStr: `${map.year}-${map.month}-${map.day}`,
    time24: `${map.hour}:${map.minute}:${map.second}`,
    time12: formatter12.format(d)
  };
}

/**
 * Returns 'YYYY-MM-DD' in Bangkok timezone
 */
function getBangkokDateStr(date = new Date()) {
  return getBangkokComponents(date).dateStr;
}

/**
 * Returns formatted readable string in Bangkok timezone
 */
function formatBangkokDateTime(date = new Date()) {
  const bkk = getBangkokComponents(date);
  return `${bkk.dateStr} ${bkk.time12} (Bangkok ICT, UTC+7)`;
}

/**
 * Returns current timestamp & Bangkok components
 */
function getBangkokNow() {
  const now = new Date();
  const bkk = getBangkokComponents(now);
  return {
    timestamp: now.getTime(),
    ...bkk
  };
}

/**
 * Check if a session is currently open for agent betting.
 * @param {object} session
 * @param {Date|number} [now=new Date()]
 * @returns {{ canBet: boolean, reason?: string, remainingSeconds: number, cutoffTime: string, resultTime: string }}
 */
function checkSessionBettingAllowed(session, now = new Date()) {
  if (!session) {
    return { canBet: false, reason: 'ပွဲစဉ် မရှိပါ', remainingSeconds: 0, cutoffTime: '', resultTime: '' };
  }

  if (session.status !== 'open') {
    return { canBet: false, reason: 'ဤပွဲစဉ်သည် ပိတ်သိမ်းပြီး သို့မဟုတ် စာရင်းရှင်းပြီး ဖြစ်ပါသည်', remainingSeconds: 0, cutoffTime: '', resultTime: '' };
  }

  const nowDate = now instanceof Date ? now : new Date(now);
  const nowMs = nowDate.getTime();
  const bkk = getBangkokComponents(nowDate);
  const todayDateStr = bkk.dateStr;

  // 3D Handling
  if (session.lottery_type === '3D') {
    if (session.close_time) {
      const closeIso = session.close_time.includes('+') || session.close_time.includes('Z')
        ? session.close_time
        : `${session.close_time}+07:00`;
      const closeMs = new Date(closeIso).getTime();
      const remainingSec = Math.floor((closeMs - nowMs) / 1000);
      if (remainingSec <= 0) {
        return { canBet: false, reason: '3D ပွဲပိတ်ချိန် ကျော်လွန်သွားပါပြီ', remainingSeconds: 0, cutoffTime: '', resultTime: '' };
      }
      return { canBet: true, remainingSeconds: remainingSec, cutoffTime: '', resultTime: '' };
    }
    return { canBet: true, remainingSeconds: 86400, cutoffTime: '', resultTime: '' };
  }

  // 2D Session Cutoff Logic
  const sessionName = (session.session_name || '').toLowerCase();
  const isMorning = sessionName.includes('12:00') || sessionName.includes('12:30') || sessionName.includes('မနက်');
  const isEvening = sessionName.includes('04:00') || sessionName.includes('4:00') || sessionName.includes('04:30') || sessionName.includes('4:30') || sessionName.includes('ညနေ');

  const sessionDateStr = session.session_date || todayDateStr;

  // Past dates
  if (sessionDateStr < todayDateStr) {
    return {
      canBet: false,
      reason: 'ယခင်ရက်က ပွဲစဉ်ဖြစ်၍ ပိတ်ပြီးဖြစ်ပါသည်',
      remainingSeconds: 0,
      cutoffTime: isMorning ? '12:00 PM' : '04:00 PM',
      resultTime: isMorning ? '12:30 PM' : '04:30 PM'
    };
  }

  let cutoffTimeLabel = '12:00 PM';
  let resultTimeLabel = '12:30 PM';
  let defaultCloseIso = `${sessionDateStr}T12:00:00+07:00`;

  if (isEvening) {
    cutoffTimeLabel = '04:00 PM';
    resultTimeLabel = '04:30 PM';
    defaultCloseIso = `${sessionDateStr}T16:00:00+07:00`;
  }

  let finalCloseIso = session.close_time || defaultCloseIso;
  if (!finalCloseIso.includes('+') && !finalCloseIso.includes('Z')) {
    finalCloseIso = `${finalCloseIso}+07:00`;
  }

  const cutoffMs = new Date(finalCloseIso).getTime();
  const remainingSeconds = Math.floor((cutoffMs - nowMs) / 1000);

  if (remainingSeconds <= 0) {
    return {
      canBet: false,
      reason: `ပွဲပိတ်ချိန် (${cutoffTimeLabel} Bangkok Time) ကျော်လွန်သွားပါပြီ! အထိုးစာရင်းများ လက်မခံတော့ပါ။ (ထွက်ဂဏန်း ${resultTimeLabel} တွင် ထွက်မည်)`,
      remainingSeconds: 0,
      cutoffTime: cutoffTimeLabel,
      resultTime: resultTimeLabel
    };
  }

  return {
    canBet: true,
    remainingSeconds,
    cutoffTime: cutoffTimeLabel,
    resultTime: resultTimeLabel
  };
}

module.exports = {
  TIMEZONE,
  getBangkokComponents,
  getBangkokDateStr,
  formatBangkokDateTime,
  getBangkokNow,
  checkSessionBettingAllowed
};
