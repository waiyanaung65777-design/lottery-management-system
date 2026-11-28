/**
 * Bangkok Timezone (Asia/Bangkok, UTC+7) Utilities & Session Scheduler
 * Thailand Time:
 * - 2D Morning: Result at 12:30 PM, Agent Bet Cutoff strictly at 12:00 PM
 * - 2D Evening: Result at 04:30 PM, Agent Bet Cutoff strictly at 04:00 PM
 */

const TIMEZONE = 'Asia/Bangkok';

function getBangkokNow() {
  const str = new Date().toLocaleString('en-US', { timeZone: TIMEZONE });
  return new Date(str);
}

function getBangkokDateStr(date = new Date()) {
  const bkk = new Date(date.toLocaleString('en-US', { timeZone: TIMEZONE }));
  const y = bkk.getFullYear();
  const m = String(bkk.getMonth() + 1).padStart(2, '0');
  const d = String(bkk.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatBangkokDateTime(date = new Date()) {
  return new Date(date).toLocaleString('my-MM', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

/**
 * Check if a session is currently open for agent betting.
 * @param {object} session
 * @param {Date} [now]
 * @returns {{ canBet: boolean, reason?: string, remainingSeconds: number, cutoffTime: string, resultTime: string }}
 */
function checkSessionBettingAllowed(session, now = getBangkokNow()) {
  if (!session) {
    return { canBet: false, reason: 'ပွဲစဉ် မရှိပါ', remainingSeconds: 0 };
  }

  if (session.status !== 'open') {
    return { canBet: false, reason: 'ဤပွဲစဉ်သည် ပိတ်သိမ်းပြီး သို့မဟုတ် စာရင်းရှင်းပြီး ဖြစ်ပါသည်', remainingSeconds: 0 };
  }

  // 3D handling
  if (session.lottery_type === '3D') {
    if (session.close_time) {
      const closeDate = new Date(session.close_time);
      const remainingMs = closeDate.getTime() - now.getTime();
      if (remainingMs <= 0) {
        return { canBet: false, reason: '3D ပွဲပိတ်ချိန် ကျော်လွန်သွားပါပြီ', remainingSeconds: 0 };
      }
      return { canBet: true, remainingSeconds: Math.floor(remainingMs / 1000) };
    }
    return { canBet: true, remainingSeconds: 86400 };
  }

  // 2D Sessions: Morning (12:00 PM cutoff) & Evening (04:00 PM cutoff)
  const sessionName = (session.session_name || '').toLowerCase();
  const isMorning = sessionName.includes('12:00') || sessionName.includes('12:30') || sessionName.includes('မနက်');
  const isEvening = sessionName.includes('04:00') || sessionName.includes('4:00') || sessionName.includes('04:30') || sessionName.includes('4:30') || sessionName.includes('ညနေ');

  const todayStr = getBangkokDateStr(now);
  const sessionDateStr = session.session_date || todayStr;

  // Compare dates: if session date is in the past, betting is closed
  if (sessionDateStr < todayStr) {
    return { canBet: false, reason: 'ယခင်ရက်က ပွဲစဉ်ဖြစ်၍ ပိတ်ပြီးဖြစ်ပါသည်', remainingSeconds: 0 };
  }

  let cutoffHour = 12;
  let cutoffMinute = 0;
  let cutoffLabel = '12:00 PM';
  let resultLabel = '12:30 PM';

  if (isEvening) {
    cutoffHour = 16;
    cutoffMinute = 0;
    cutoffLabel = '04:00 PM';
    resultLabel = '04:30 PM';
  }

  // If specific close_time is stored in ISO format
  if (session.close_time) {
    const closeDate = new Date(session.close_time);
    const diffMs = closeDate.getTime() - now.getTime();
    if (diffMs <= 0) {
      return {
        canBet: false,
        reason: `ပွဲပိတ်ချိန် (${cutoffLabel}) ကျော်လွန်သွားပါပြီ! အထိုးစာရင်းများ လက်မခံတော့ပါ။`,
        remainingSeconds: 0,
        cutoffTime: cutoffLabel,
        resultTime: resultLabel
      };
    }
    return {
      canBet: true,
      remainingSeconds: Math.floor(diffMs / 1000),
      cutoffTime: cutoffLabel,
      resultTime: resultLabel
    };
  }

  // Construct target cutoff date today in Bangkok
  const cutoffTime = new Date(now);
  cutoffTime.setHours(cutoffHour, cutoffMinute, 0, 0);

  const diffMs = cutoffTime.getTime() - now.getTime();
  if (diffMs <= 0) {
    return {
      canBet: false,
      reason: `အချိန်ကျော်လွန်သွားပါပြီ! (${cutoffLabel} တွင် အထိုးပိတ်ပါသည် - ထွက်ဂဏန်း ${resultLabel} တွင် ထွက်မည်)`,
      remainingSeconds: 0,
      cutoffTime: cutoffLabel,
      resultTime: resultLabel
    };
  }

  return {
    canBet: true,
    remainingSeconds: Math.floor(diffMs / 1000),
    cutoffTime: cutoffLabel,
    resultTime: resultLabel
  };
}

module.exports = {
  TIMEZONE,
  getBangkokNow,
  getBangkokDateStr,
  formatBangkokDateTime,
  checkSessionBettingAllowed
};
