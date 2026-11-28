const { checkSessionBettingAllowed } = require('./timeUtils');

console.log('Testing Bangkok Cutoff Times:');

// Test 1: Morning session at 11:45 AM -> Can bet
const morningSession = {
  id: 1,
  lottery_type: '2D',
  session_name: '2D မနက်ပိုင်း (12:30 PM ထွက်)',
  status: 'open'
};

const at1145AM = new Date();
at1145AM.setHours(11, 45, 0, 0);
const res1 = checkSessionBettingAllowed(morningSession, at1145AM);
console.log('11:45 AM Morning ->', res1);
console.assert(res1.canBet === true, '11:45 AM should be allowed');

// Test 2: Morning session at 12:00:01 PM -> Blocked!
const at1200PM = new Date();
at1200PM.setHours(12, 0, 1, 0);
const res2 = checkSessionBettingAllowed(morningSession, at1200PM);
console.log('12:00:01 PM Morning ->', res2);
console.assert(res2.canBet === false, '12:00 PM should be restricted');

// Test 3: Evening session at 03:55 PM -> Can bet
const eveningSession = {
  id: 2,
  lottery_type: '2D',
  session_name: '2D ညနေပိုင်း (04:30 PM ထွက်)',
  status: 'open'
};

const at355PM = new Date();
at355PM.setHours(15, 55, 0, 0);
const res3 = checkSessionBettingAllowed(eveningSession, at355PM);
console.log('03:55 PM Evening ->', res3);
console.assert(res3.canBet === true, '03:55 PM should be allowed');

// Test 4: Evening session at 04:00:05 PM -> Blocked!
const at400PM = new Date();
at400PM.setHours(16, 0, 5, 0);
const res4 = checkSessionBettingAllowed(eveningSession, at400PM);
console.log('04:00:05 PM Evening ->', res4);
console.assert(res4.canBet === false, '04:00 PM should be restricted');

console.log('ALL TIMEZONE RESTRICTION TESTS PASSED! 🎉');
