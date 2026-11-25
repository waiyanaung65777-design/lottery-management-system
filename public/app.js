// State
let currentUser = null;
let allUsers = [];
let sessions = [];
let currentLotteryType = '2D';
let currentParsedItems = [];
let parseDebounceTimer = null;

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  await loadUsers();
  await loadSessions();
  setupEventListeners();
  switchRole();
});

// Event Listeners
function setupEventListeners() {
  const userSelect = document.getElementById('userSelector');
  userSelect.addEventListener('change', (e) => {
    const userId = parseInt(e.target.value, 10);
    currentUser = allUsers.find(u => u.id === userId);
    switchRole();
  });

  const textInput = document.getElementById('betTextInput');
  textInput.addEventListener('input', () => {
    clearTimeout(parseDebounceTimer);
    parseDebounceTimer = setTimeout(triggerParse, 200);
  });

  const sessionSelect = document.getElementById('agentSessionSelect');
  sessionSelect.addEventListener('change', () => {
    triggerParse();
  });
}

// Switch between Banker and Agent views
function switchRole() {
  if (!currentUser) return;

  const roleBadge = document.getElementById('roleBadge');
  const agentSection = document.getElementById('agentSection');
  const bankerSection = document.getElementById('bankerSection');

  if (currentUser.role === 'banker') {
    roleBadge.textContent = '👑 ဒိုင်ချုပ် (Banker)';
    roleBadge.className = 'text-xs px-2.5 py-1 rounded-md font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30';
    agentSection.classList.add('hidden');
    bankerSection.classList.remove('hidden');
    loadBankerDashboard();
  } else {
    roleBadge.textContent = `👤 ကော်မရှင် (${currentUser.commission_rate}% Comm)`;
    roleBadge.className = 'text-xs px-2.5 py-1 rounded-md font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    bankerSection.classList.add('hidden');
    agentSection.classList.remove('hidden');
    document.getElementById('previewCommLabel').textContent = `ကော်မရှင် (${currentUser.commission_rate}%):`;
    triggerParse();
  }
}

// Load Users
async function loadUsers() {
  try {
    const res = await fetch('/api/users');
    const json = await res.json();
    if (json.success) {
      allUsers = json.data;
      const select = document.getElementById('userSelector');
      select.innerHTML = '';
      allUsers.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.name} (${u.role === 'banker' ? 'ဒိုင်' : 'ကော်မရှင်'})`;
        select.appendChild(opt);
      });
      currentUser = allUsers[0];
    }
  } catch (err) {
    showToast('Failed to load users: ' + err.message, 'error');
  }
}

// Load Sessions
async function loadSessions() {
  try {
    const res = await fetch('/api/sessions');
    const json = await res.json();
    if (json.success) {
      sessions = json.data;
      const agentSelect = document.getElementById('agentSessionSelect');
      const settleSelect = document.getElementById('settleSessionSelect');
      
      agentSelect.innerHTML = '';
      settleSelect.innerHTML = '';

      sessions.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `[${s.lottery_type}] ${s.session_name} (${s.status === 'open' ? '🟢 ဖွင့်လှစ်ဆဲ' : '🔴 ပြီးဆုံး'})`;
        agentSelect.appendChild(opt);

        const opt2 = document.createElement('option');
        opt2.value = s.id;
        opt2.textContent = `[${s.lottery_type}] ${s.session_name} - ${s.status}`;
        settleSelect.appendChild(opt2);
      });
    }
  } catch (err) {
    showToast('Failed to load sessions', 'error');
  }
}

// Bet Type Switcher
function setBetType(type) {
  currentLotteryType = type;
  const btn2D = document.getElementById('btnType2D');
  const btn3D = document.getElementById('btnType3D');

  if (type === '2D') {
    btn2D.className = 'py-2 rounded-xl text-xs font-bold border border-emerald-500 bg-emerald-500/20 text-emerald-300';
    btn3D.className = 'py-2 rounded-xl text-xs font-bold border border-slate-700 bg-slate-800 text-slate-400 hover:text-white';
  } else {
    btn3D.className = 'py-2 rounded-xl text-xs font-bold border border-cyan-500 bg-cyan-500/20 text-cyan-300';
    btn2D.className = 'py-2 rounded-xl text-xs font-bold border border-slate-700 bg-slate-800 text-slate-400 hover:text-white';
  }
  triggerParse();
}

// Quick Template Insertion
function insertTemplate(snippet) {
  const input = document.getElementById('betTextInput');
  const current = input.value.trim();
  if (current) {
    input.value = current + '\n' + snippet;
  } else {
    input.value = snippet;
  }
  triggerParse();
  input.focus();
}

function clearInput() {
  document.getElementById('betTextInput').value = '';
  triggerParse();
}

// Live Parse Bets API Call
async function triggerParse() {
  const text = document.getElementById('betTextInput').value;
  const sessionId = document.getElementById('agentSessionSelect').value;
  const chipsContainer = document.getElementById('previewChipsContainer');
  const countBadge = document.getElementById('previewCountBadge');
  const totalAmtEl = document.getElementById('previewTotalAmt');
  const commAmtEl = document.getElementById('previewCommAmt');
  const netBankerEl = document.getElementById('previewNetBanker');
  const errorBox = document.getElementById('parseErrors');
  const submitBtn = document.getElementById('btnSubmitBet');

  if (!text.trim()) {
    currentParsedItems = [];
    chipsContainer.innerHTML = `<div class="text-xs text-slate-600 italic py-4 w-full text-center">စာသားရိုက်ထည့်ပါက ဤနေရာတွင် အော်တို ဂဏန်းများ ဖြန့်ပေါ်လာပါမည်။</div>`;
    countBadge.textContent = '0 ကွက်';
    totalAmtEl.textContent = '0 Ks';
    commAmtEl.textContent = '+0 Ks';
    netBankerEl.textContent = '0 Ks';
    errorBox.classList.add('hidden');
    submitBtn.disabled = true;
    submitBtn.className = 'w-full py-3 rounded-xl font-bold text-sm bg-slate-800 text-slate-500 cursor-not-allowed flex items-center justify-center gap-2';
    return;
  }

  try {
    const res = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        lottery_type: currentLotteryType,
        session_id: sessionId
      })
    });
    const data = await res.json();

    if (data.success) {
      currentParsedItems = data.items;
      countBadge.textContent = `${data.itemCount} ကွက်`;
      totalAmtEl.textContent = `${data.totalAmount.toLocaleString()} Ks`;

      // Commission calculations
      const commRate = currentUser ? currentUser.commission_rate : 15;
      const commAmt = (data.totalAmount * commRate) / 100;
      const netToBanker = data.totalAmount - commAmt;

      commAmtEl.textContent = `+${commAmt.toLocaleString()} Ks`;
      netBankerEl.textContent = `${netToBanker.toLocaleString()} Ks`;

      // Render Chips
      if (data.items.length === 0) {
        chipsContainer.innerHTML = `<div class="text-xs text-amber-500 py-3 w-full text-center">ဂဏန်းမရှိသေးပါ သို့မဟုတ် ပုံစံမမှန်ပါ</div>`;
      } else {
        chipsContainer.innerHTML = data.items.map(it => {
          let badgeClass = 'bg-slate-800 border-slate-700 text-slate-200';
          let warningTag = '';

          if (it.isBlocked) {
            badgeClass = 'bg-red-950/80 border-red-600 text-red-300';
            warningTag = '<span class="text-[10px] text-red-400 font-bold ml-1">🚫 ပိတ်</span>';
          } else if (it.warning) {
            badgeClass = 'bg-amber-950/80 border-amber-600 text-amber-300';
            warningTag = '<span class="text-[10px] text-amber-400 font-bold ml-1">⚠️ Limit</span>';
          }

          return `
            <div class="badge-chip inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${badgeClass}">
              <span class="text-amber-400 font-mono font-bold">${it.number}</span>
              <span class="text-slate-400">/</span>
              <span>${it.amount.toLocaleString()} Ks</span>
              ${warningTag}
            </div>
          `;
        }).join('');
      }

      // Errors & Warnings
      const hasBlocked = data.items.some(i => i.isBlocked);
      if (data.errors.length > 0 || hasBlocked) {
        errorBox.classList.remove('hidden');
        let errorHtml = data.errors.map(e => `<div>⚠️ ${e}</div>`).join('');
        if (hasBlocked) {
          errorHtml += `<div class="font-bold text-red-400">🚫 ဒိုင်ပိတ်ထားသော ဂဏန်းများ ပါဝင်နေသောကြောင့် တင်၍ မရပါ!</div>`;
        }
        errorBox.innerHTML = errorHtml;
      } else {
        errorBox.classList.add('hidden');
      }

      // Enable/Disable submit
      if (data.items.length > 0 && !hasBlocked) {
        submitBtn.disabled = false;
        submitBtn.className = 'w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-slate-950 shadow-lg cursor-pointer flex items-center justify-center gap-2';
      } else {
        submitBtn.disabled = true;
        submitBtn.className = 'w-full py-3 rounded-xl font-bold text-sm bg-slate-800 text-slate-500 cursor-not-allowed flex items-center justify-center gap-2';
      }
    }
  } catch (err) {
    console.error('Parse error:', err);
  }
}

// Submit Bet Slip
async function submitBetSlip() {
  if (currentParsedItems.length === 0) return;

  const sessionId = document.getElementById('agentSessionSelect').value;
  const customerName = document.getElementById('customerNameInput').value.trim() || 'ထိုးသား (Telegram)';
  const rawText = document.getElementById('betTextInput').value;

  try {
    const res = await fetch('/api/slips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: currentUser.id,
        session_id: sessionId,
        customer_name: customerName,
        raw_text: rawText,
        lottery_type: currentLotteryType,
        items: currentParsedItems
      })
    });
    const data = await res.json();

    if (data.success) {
      showToast('✅ ဒိုင်ဆီသို့ စလစ် တင်ပြီးပါပြီ!', 'success');
      
      // Open Telegram Receipt Modal
      openTelegramSlipModal({
        slipId: data.slipId,
        customerName,
        sessionName: document.getElementById('agentSessionSelect').selectedOptions[0].text,
        items: currentParsedItems,
        totalAmount: data.totalAmount
      });

      // Reset
      document.getElementById('betTextInput').value = '';
      document.getElementById('customerNameInput').value = '';
      triggerParse();
      loadAgentSlips();
    } else {
      showToast(data.error || 'စာရင်းတင်၍ မအောင်မြင်ပါ', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// Telegram Receipt Modal
function openTelegramSlipModal(slip) {
  const modal = document.getElementById('slipModal');
  const textarea = document.getElementById('telegramSlipText');

  const lines = [
    `🧾 【 2D/3D ထိုးစာရင်း စလစ် #${slip.slipId} 】`,
    `👤 ထိုးသား: ${slip.customerName}`,
    `📅 ပွဲစဉ်: ${slip.sessionName}`,
    `⏰ အချိန်: ${new Date().toLocaleTimeString('my-MM')}`,
    `--------------------------------`,
    ...slip.items.map(i => `▫️ ${i.number}  ➜  ${i.amount.toLocaleString()} Ks`),
    `--------------------------------`,
    `💰 စုစုပေါင်းထိုးငွေ: ${slip.totalAmount.toLocaleString()} Ks`,
    `✅ ဒိုင်ဆီသို့ စာရင်းတင်သွင်းပြီးပါပြီ။`,
    `✨ ကံကောင်းပါစေခင်ဗျာ! ✨`
  ];

  textarea.value = lines.join('\n');
  modal.classList.remove('hidden');
  lucide.createIcons();
}

function closeSlipModal() {
  document.getElementById('slipModal').classList.add('hidden');
}

function copyTelegramSlip() {
  const textarea = document.getElementById('telegramSlipText');
  textarea.select();
  navigator.clipboard.writeText(textarea.value);
  showToast('📋 Telegram စလစ်စာသား ကော်ပီကူးယူပြီးပါပြီ!', 'success');
}

// Agent Tabs
function switchAgentTab(tab) {
  const tabEntry = document.getElementById('agentTabEntry');
  const tabSlips = document.getElementById('agentTabSlips');
  const tabLedger = document.getElementById('agentTabLedger');

  const btnEntry = document.getElementById('tabBtnAgentEntry');
  const btnSlips = document.getElementById('tabBtnAgentSlips');
  const btnLedger = document.getElementById('tabBtnAgentLedger');

  tabEntry.classList.add('hidden');
  tabSlips.classList.add('hidden');
  tabLedger.classList.add('hidden');

  btnEntry.className = 'pb-3 px-2 text-sm font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center gap-2';
  btnSlips.className = 'pb-3 px-2 text-sm font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center gap-2';
  btnLedger.className = 'pb-3 px-2 text-sm font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center gap-2';

  if (tab === 'entry') {
    tabEntry.classList.remove('hidden');
    btnEntry.className = 'pb-3 px-2 text-sm font-bold border-b-2 border-emerald-500 text-emerald-400 flex items-center gap-2';
  } else if (tab === 'slips') {
    tabSlips.classList.remove('hidden');
    btnSlips.className = 'pb-3 px-2 text-sm font-bold border-b-2 border-emerald-500 text-emerald-400 flex items-center gap-2';
    loadAgentSlips();
  } else if (tab === 'ledger') {
    tabLedger.classList.remove('hidden');
    btnLedger.className = 'pb-3 px-2 text-sm font-bold border-b-2 border-emerald-500 text-emerald-400 flex items-center gap-2';
    loadAgentLedger();
  }
}

// Load Agent Slips
async function loadAgentSlips() {
  if (!currentUser) return;
  try {
    const res = await fetch(`/api/slips?agent_id=${currentUser.id}`);
    const json = await res.json();
    const tbody = document.getElementById('agentSlipsTableBody');

    if (json.success && json.data.length > 0) {
      tbody.innerHTML = json.data.map(s => {
        let winBadge = `<span class="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-400">စောင့်ဆိုင်းဆဲ</span>`;
        if (s.session_status === 'settled') {
          if (s.winner_count > 0) {
            winBadge = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">🏆 ပေါက် (${s.total_win_amount.toLocaleString()} Ks)</span>`;
          } else {
            winBadge = `<span class="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-500">မပေါက်ပါ</span>`;
          }
        }

        return `
          <tr class="hover:bg-slate-800/40">
            <td class="p-3 font-mono font-bold text-emerald-400">#${s.id}</td>
            <td class="p-3 text-slate-400">${new Date(s.created_at).toLocaleTimeString('my-MM')}</td>
            <td class="p-3 font-semibold text-white">${s.customer_name}</td>
            <td class="p-3 text-slate-300">${s.session_name}</td>
            <td class="p-3 font-semibold text-white">${s.total_amount.toLocaleString()} Ks</td>
            <td class="p-3 text-emerald-400 font-bold">+${s.commission_amount.toLocaleString()} Ks</td>
            <td class="p-3 text-amber-400">${s.net_to_banker.toLocaleString()} Ks</td>
            <td class="p-3">${winBadge}</td>
            <td class="p-3 text-right">
              <button onclick="viewSlipDetails(${s.id})" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 font-semibold text-[11px]">
                စလစ်ကြည့်မည်
              </button>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-500">တင်ထားသော စလစ်မရှိသေးပါ</td></tr>`;
    }
  } catch (err) {
    console.error('Load slips error:', err);
  }
}

// Load Agent Ledger
async function loadAgentLedger() {
  if (!currentUser) return;
  try {
    const res = await fetch(`/api/slips?agent_id=${currentUser.id}`);
    const json = await res.json();
    if (json.success) {
      let totalBet = 0;
      let totalComm = 0;
      let totalNet = 0;
      let totalWin = 0;

      json.data.forEach(s => {
        totalBet += s.total_amount;
        totalComm += s.commission_amount;
        totalNet += s.net_to_banker;
        totalWin += (s.total_win_amount || 0);
      });

      document.getElementById('agentStatTotalBet').textContent = `${totalBet.toLocaleString()} Ks`;
      document.getElementById('agentStatComm').textContent = `+${totalComm.toLocaleString()} Ks`;
      document.getElementById('agentStatNetToBanker').textContent = `${totalNet.toLocaleString()} Ks`;
      document.getElementById('agentStatWinningPayout').textContent = `${totalWin.toLocaleString()} Ks`;
    }
  } catch (err) {
    console.error('Ledger error:', err);
  }
}

// View Single Slip Details
async function viewSlipDetails(slipId) {
  try {
    const res = await fetch(`/api/slips/${slipId}`);
    const json = await res.json();
    if (json.success) {
      openTelegramSlipModal({
        slipId: json.data.id,
        customerName: json.data.customer_name,
        sessionName: json.data.session_name,
        items: json.data.items,
        totalAmount: json.data.total_amount
      });
    }
  } catch (err) {
    showToast('Failed to load slip', 'error');
  }
}

// ==============================================
// BANKER FUNCTIONS
// ==============================================
function switchBankerTab(tab) {
  const tabs = ['Overview', 'Settle', 'Limits', 'Agents', 'AllSlips'];
  tabs.forEach(t => {
    const tabEl = document.getElementById(`bankerTab${t}`);
    const btnEl = document.getElementById(`tabBtnBanker${t}`);
    if (t.toLowerCase() === tab.toLowerCase()) {
      tabEl.classList.remove('hidden');
      btnEl.className = 'pb-3 px-2 text-sm font-bold border-b-2 border-amber-500 text-amber-400 flex items-center gap-2';
    } else {
      tabEl.classList.add('hidden');
      btnEl.className = 'pb-3 px-2 text-sm font-medium border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center gap-2';
    }
  });

  if (tab === 'overview') loadBankerDashboard();
  if (tab === 'limits') loadNumberLimits();
  if (tab === 'agents') loadBankerAgents();
  if (tab === 'allslips') loadBankerSlips();
}

async function loadBankerDashboard() {
  try {
    const res = await fetch('/api/stats/banker');
    const json = await res.json();
    if (json.success) {
      const s = json.summary;
      document.getElementById('bStatGrossBet').textContent = `${s.total_bet_amount.toLocaleString()} Ks`;
      document.getElementById('bStatSlipCount').textContent = `${s.total_slips} စလစ်`;
      document.getElementById('bStatCommission').textContent = `-${s.total_commission.toLocaleString()} Ks`;
      document.getElementById('bStatNetSales').textContent = `${s.total_net_sales.toLocaleString()} Ks`;
      document.getElementById('bStatPayout').textContent = `-${s.total_payout.toLocaleString()} Ks`;
      
      const profitEl = document.getElementById('bStatNetProfit');
      profitEl.textContent = `${s.net_profit >= 0 ? '+' : ''}${s.net_profit.toLocaleString()} Ks`;
      profitEl.className = `text-2xl font-bold mt-1 ${s.net_profit >= 0 ? 'text-emerald-400' : 'text-rose-500'}`;

      // Heatmap
      const heatmapEl = document.getElementById('bNumberHeatmap');
      if (json.numberBreakdown.length > 0) {
        heatmapEl.innerHTML = json.numberBreakdown.map(nb => `
          <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
            <span class="text-base font-bold font-mono text-amber-400">${nb.number}</span>
            <div class="text-right">
              <span class="text-xs font-semibold text-white block">${nb.total_amount.toLocaleString()} Ks</span>
              <span class="text-[10px] text-slate-500">${nb.bet_count} ကြိမ်</span>
            </div>
          </div>
        `).join('');
      } else {
        heatmapEl.innerHTML = `<div class="col-span-3 text-center text-slate-500 py-6 text-xs">အထိုးစာရင်း မရှိသေးပါ</div>`;
      }

      // Agent Breakdown
      const agentListEl = document.getElementById('bAgentBreakdownList');
      if (json.agentBreakdown.length > 0) {
        agentListEl.innerHTML = json.agentBreakdown.map(ab => `
          <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1.5">
            <div class="flex justify-between items-center text-xs">
              <span class="font-bold text-white">${ab.name}</span>
              <span class="text-emerald-400 font-semibold">${ab.commission_rate}% Comm</span>
            </div>
            <div class="flex justify-between text-xs text-slate-400">
              <span>အထိုး: ${ab.total_amount.toLocaleString()} Ks (${ab.slips_count} စလစ်)</span>
              <span class="text-amber-400">ဒိုင်ရ: ${ab.net_to_banker.toLocaleString()} Ks</span>
            </div>
          </div>
        `).join('');
      } else {
        agentListEl.innerHTML = `<div class="text-center text-slate-500 py-6 text-xs">အေးဂျင့် မရှိသေးပါ</div>`;
      }
    }
  } catch (err) {
    console.error('Banker stats error:', err);
  }
}

// Settle Winning Number
async function settleSession() {
  const sessionId = document.getElementById('settleSessionSelect').value;
  const winningNumber = document.getElementById('winningNumberInput').value.trim();

  if (!winningNumber) {
    showToast('ပေါက်ဂဏန်း ထည့်သွင်းပေးပါ', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/sessions/${sessionId}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winning_number: winningNumber })
    });
    const json = await res.json();
    if (json.success) {
      showToast(`🏆 ${json.message} (ပေါက်သူ: ${json.win_count} ဦး / စုစုပေါင်းလျော်ငွေ: ${json.total_win_payout.toLocaleString()} Ks)`, 'success');
      loadSessions();
      loadBankerDashboard();
    } else {
      showToast(json.error || 'စာရင်းရှင်းမအောင်မြင်ပါ', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// Limits / Blocked numbers
async function loadNumberLimits() {
  try {
    const res = await fetch('/api/limits');
    const json = await res.json();
    const tbody = document.getElementById('limitsTableBody');
    if (json.success && json.data.length > 0) {
      tbody.innerHTML = json.data.map(l => `
        <tr class="hover:bg-slate-800/40">
          <td class="p-2.5 font-bold text-amber-400">${l.lottery_type}</td>
          <td class="p-2.5 font-mono font-bold text-white text-sm">${l.number}</td>
          <td class="p-2.5">
            ${l.max_amount === 0 
              ? '<span class="px-2 py-0.5 bg-red-950 border border-red-800 text-red-300 rounded font-bold text-[10px]">🚫 လုံးဝပိတ်ဂဏန်း</span>' 
              : `<span class="text-amber-300 font-semibold">${l.max_amount.toLocaleString()} Ks Limit</span>`}
          </td>
          <td class="p-2.5 text-right">
            <button onclick="deleteLimit(${l.id})" class="text-red-400 hover:text-red-300 text-xs font-semibold">ဖျက်မည်</button>
          </td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-500">သတ်မှတ်ချက် မရှိသေးပါ</td></tr>`;
    }
  } catch (err) {
    console.error('Limits error:', err);
  }
}

async function addNumberLimit() {
  const type = document.getElementById('limitTypeSelect').value;
  const number = document.getElementById('limitNumberInput').value.trim();
  const maxAmount = document.getElementById('limitAmountInput').value;

  if (!number || maxAmount === '') {
    showToast('ဂဏန်းနှင့် Limit ပမာဏ ထည့်သွင်းပါ', 'error');
    return;
  }

  try {
    const res = await fetch('/api/limits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lottery_type: type,
        number,
        max_amount: parseFloat(maxAmount)
      })
    });
    const json = await res.json();
    if (json.success) {
      showToast('ဘရိတ်/ပိတ်ဂဏန်း သတ်မှတ်ပြီးပါပြီ', 'success');
      document.getElementById('limitNumberInput').value = '';
      document.getElementById('limitAmountInput').value = '';
      loadNumberLimits();
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function deleteLimit(id) {
  try {
    await fetch(`/api/limits/${id}`, { method: 'DELETE' });
    loadNumberLimits();
    showToast('ဖျက်ပြီးပါပြီ', 'success');
  } catch (err) {
    showToast('Delete error', 'error');
  }
}

// Banker Agents
async function loadBankerAgents() {
  try {
    const res = await fetch('/api/users');
    const json = await res.json();
    const tbody = document.getElementById('bankerAgentsTableBody');
    if (json.success) {
      const agents = json.data.filter(u => u.role === 'agent');
      tbody.innerHTML = agents.map(a => `
        <tr class="hover:bg-slate-800/40">
          <td class="p-2.5 font-bold text-white">${a.name}</td>
          <td class="p-2.5 text-slate-400 font-mono">${a.username}</td>
          <td class="p-2.5 text-emerald-400 font-bold">${a.commission_rate}%</td>
          <td class="p-2.5">
            <span class="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Active</span>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Agents load error:', err);
  }
}

async function createAgent() {
  const name = document.getElementById('newAgentName').value.trim();
  const username = document.getElementById('newAgentUsername').value.trim();
  const comm = parseFloat(document.getElementById('newAgentComm').value) || 15;

  if (!name || !username) {
    showToast('အမည်နှင့် Username ထည့်သွင်းပါ', 'error');
    return;
  }

  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, username, commission_rate: comm, role: 'agent' })
    });
    const json = await res.json();
    if (json.success) {
      showToast('အေးဂျင့်အကောင့် ဖွင့်ပေးပြီးပါပြီ!', 'success');
      document.getElementById('newAgentName').value = '';
      document.getElementById('newAgentUsername').value = '';
      await loadUsers();
      loadBankerAgents();
    } else {
      showToast(json.error || 'အကောင့်ဖွင့်မအောင်မြင်ပါ', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// Banker All Slips
async function loadBankerSlips() {
  try {
    const res = await fetch('/api/slips');
    const json = await res.json();
    const tbody = document.getElementById('bankerAllSlipsTableBody');
    if (json.success && json.data.length > 0) {
      tbody.innerHTML = json.data.map(s => `
        <tr class="hover:bg-slate-800/40">
          <td class="p-3 font-mono font-bold text-amber-400">#${s.id}</td>
          <td class="p-3 text-slate-400">${new Date(s.created_at).toLocaleTimeString('my-MM')}</td>
          <td class="p-3 font-bold text-emerald-400">${s.agent_name}</td>
          <td class="p-3 text-white font-medium">${s.customer_name}</td>
          <td class="p-3 text-slate-300">${s.session_name}</td>
          <td class="p-3 font-bold text-white">${s.total_amount.toLocaleString()} Ks</td>
          <td class="p-3 text-emerald-400">-${s.commission_amount.toLocaleString()} Ks</td>
          <td class="p-3 text-amber-300 font-bold">${s.net_to_banker.toLocaleString()} Ks</td>
          <td class="p-3">
            <span class="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">${s.session_status}</span>
          </td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-500">စလစ် မရှိသေးပါ</td></tr>`;
    }
  } catch (err) {
    console.error('All slips error:', err);
  }
}

// Toast Helper
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  toastMsg.textContent = message;

  if (type === 'success') {
    toast.className = 'fixed bottom-5 right-5 z-50 px-5 py-3 rounded-xl shadow-2xl border text-xs font-bold flex items-center gap-2 bg-emerald-950 border-emerald-600 text-emerald-200 transition-all';
  } else if (type === 'error') {
    toast.className = 'fixed bottom-5 right-5 z-50 px-5 py-3 rounded-xl shadow-2xl border text-xs font-bold flex items-center gap-2 bg-rose-950 border-rose-600 text-rose-200 transition-all';
  } else {
    toast.className = 'fixed bottom-5 right-5 z-50 px-5 py-3 rounded-xl shadow-2xl border text-xs font-bold flex items-center gap-2 bg-slate-800 border-slate-700 text-slate-200 transition-all';
  }

  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}
