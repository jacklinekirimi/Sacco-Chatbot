const BACKEND_URL = 'http://localhost:3000';

let chatlogsData = [];
 
// ── Init ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const role = localStorage.getItem('userRole');
  const firstName = localStorage.getItem('userFirstName') || 'Admin';
 
  if (role !== 'admin') {
    window.location.href = '/chat.html';
    return;
  }
 
  const initial = firstName.charAt(0).toUpperCase();
  document.getElementById('adminAvatar').textContent = initial;
  document.getElementById('adminName').textContent = firstName;
 
  loadStats();
  loadRecentChats();
});
 
// ── Navigation ────────────────────────────────────────────
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
 
  document.getElementById(`section-${name}`).classList.add('active');
 
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.getAttribute('onclick') && n.getAttribute('onclick').includes(name)) {
      n.classList.add('active');
    }
  });
 
  const titles = {
    overview: 'Overview',
    members: 'Members',
    loans: 'Loans',
    loantypes: 'Loan Types',
    chatlogs: 'Chat Logs'
  };
  document.getElementById('pageTitle').textContent = titles[name] || name;
 
  if (name === 'members') loadMembers();
  if (name === 'loans') loadLoans();
  if (name === 'loantypes') loadLoanTypes();
  if (name === 'chatlogs') loadChatlogs();
}
 
function openModal(id) {
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}
 
// ── Load Stats ────────────────────────────────────────────
async function loadStats() {
  try {
    const res = await fetch(`${BACKEND_URL}/admin/stats`);
    const data = await res.json();
 
    document.getElementById('statMembers').textContent = data.totalMembers;
    document.getElementById('statLoans').textContent = data.totalLoans;
    document.getElementById('statSavings').textContent =
      'KES ' + parseFloat(data.totalSavings).toLocaleString();
    document.getElementById('statChats').textContent = data.totalChats;
  } catch (err) {
    console.error('Stats error:', err);
  }
}
 
// ── Load Recent Chats (overview) ──────────────────────────
async function loadRecentChats() {
  try {
    const res = await fetch(`${BACKEND_URL}/admin/chatlogs`);
    const data = await res.json();
    const container = document.getElementById('recentChats');
 
    if (data.length === 0) {
      container.innerHTML = '<p class="text-slate-400 text-sm">No chat logs yet.</p>';
      return;
    }
 
    const recent = data.slice(0, 5);
    container.innerHTML = recent.map(log => `
      <div class="chat-card bg-slate-50 rounded-xl p-4 mb-3">
        <div class="flex items-center justify-between mb-2">
          <span class="font-medium text-slate-700 text-sm">${log.first_name} ${log.last_name}</span>
          <span class="text-xs text-slate-400">${new Date(log.created_at).toLocaleString()}</span>
        </div>
        <p class="text-xs text-indigo-600 font-medium mb-1">Intent: ${log.intent_name || 'N/A'}</p>
        <p class="text-xs text-slate-500">👤 ${log.user_message}</p>
        <p class="text-xs text-slate-600 mt-1">🤖 ${log.bot_response.substring(0, 100)}${log.bot_response.length > 100 ? '...' : ''}</p>
      </div>
    `).join('');
  } catch (err) {
    console.error('Recent chats error:', err);
  }
}
 
// ── Load Members ──────────────────────────────────────────
async function loadMembers() {
  try {
    const res = await fetch(`${BACKEND_URL}/admin/members`);
    const data = await res.json();
    const tbody = document.getElementById('membersTable');
    document.getElementById('membersCount').textContent = `${data.length} members`;
 
    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-8 text-center text-slate-400">No members found.</td></tr>';
      return;
    }
 
    tbody.innerHTML = data.map(m => `
      <tr class="table-row border-b border-slate-50">
        <td class="px-6 py-4">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
              ${m.first_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p class="font-medium text-slate-700">${m.first_name} ${m.last_name}</p>
              <p class="text-xs text-slate-400">ID: ${m.id}</p>
            </div>
          </div>
        </td>
        <td class="px-6 py-4 text-slate-600">${m.membership_number}</td>
        <td class="px-6 py-4 text-slate-500 text-xs">${m.email}</td>
        <td class="px-6 py-4 text-slate-700 font-medium">
          KES ${m.savings_balance ? parseFloat(m.savings_balance).toLocaleString() : '0'}
        </td>
        <td class="px-6 py-4">
          ${m.loan_status === 'active'
            ? `<span class="badge-loan px-2 py-1 rounded-full text-xs font-medium">Active Loan</span>`
            : `<span class="badge-no-loan px-2 py-1 rounded-full text-xs font-medium">No Loan</span>`
          }
        </td>
        <td class="px-6 py-4 text-slate-400 text-xs">${new Date(m.created_at).toLocaleDateString()}</td>
        <td class="px-6 py-4">
          <div class="flex items-center gap-2">
            <button onclick='viewMember(${JSON.stringify(m)})'
                    class="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded-lg hover:bg-indigo-50 transition">
              View
            </button>
            <button onclick="confirmDelete('member', ${m.id}, '${m.first_name} ${m.last_name}')"
                    class="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded-lg hover:bg-red-50 transition">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Members error:', err);
    document.getElementById('membersTable').innerHTML =
      '<tr><td colspan="7" class="px-6 py-8 text-center text-red-400">Failed to load members.</td></tr>';
  }
}
 
// ── View Member Details ───────────────────────────────────
function viewMember(m) {
  const content = document.getElementById('memberDetailsContent');
  content.innerHTML = `
    <div class="flex items-center gap-4 mb-5 pb-5 border-b border-slate-100">
      <div class="w-14 h-14 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xl">
        ${m.first_name.charAt(0).toUpperCase()}
      </div>
      <div>
        <p class="font-semibold text-slate-800 text-lg">${m.first_name} ${m.last_name}</p>
        <p class="text-xs text-slate-400">Member ID: ${m.id}</p>
      </div>
    </div>
    <div class="space-y-3 text-sm">
      <div class="flex justify-between">
        <span class="text-slate-500">Membership No.</span>
        <span class="font-medium text-slate-700">${m.membership_number}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-slate-500">Email</span>
        <span class="font-medium text-slate-700">${m.email}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-slate-500">Savings Balance</span>
        <span class="font-medium text-slate-700">KES ${m.savings_balance ? parseFloat(m.savings_balance).toLocaleString() : '0'}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-slate-500">Loan Status</span>
        <span class="${m.loan_status === 'active' ? 'badge-loan' : 'badge-no-loan'} px-2 py-0.5 rounded-full text-xs font-medium">
          ${m.loan_status === 'active' ? 'Active Loan' : 'No Loan'}
        </span>
      </div>
      ${m.outstanding_balance ? `
      <div class="flex justify-between">
        <span class="text-slate-500">Outstanding Balance</span>
        <span class="font-medium text-red-600">KES ${parseFloat(m.outstanding_balance).toLocaleString()}</span>
      </div>` : ''}
      <div class="flex justify-between">
        <span class="text-slate-500">Date Joined</span>
        <span class="font-medium text-slate-700">${new Date(m.created_at).toLocaleDateString()}</span>
      </div>
    </div>
  `;
  openModal('viewMemberModal');
}
 
// ── Load Loans ────────────────────────────────────────────
async function loadLoans() {
  try {
    const res = await fetch(`${BACKEND_URL}/admin/loans`);
    const data = await res.json();
    const tbody = document.getElementById('loansTable');
    document.getElementById('loansCount').textContent = `${data.length} loans`;
 
    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-8 text-center text-slate-400">No loans found.</td></tr>';
      return;
    }
 
    tbody.innerHTML = data.map(l => `
      <tr class="table-row border-b border-slate-50">
        <td class="px-6 py-4">
          <div>
            <p class="font-medium text-slate-700">${l.first_name} ${l.last_name}</p>
            <p class="text-xs text-slate-400">${l.membership_number}</p>
          </div>
        </td>
        <td class="px-6 py-4 text-slate-600">${l.loan_type_name}</td>
        <td class="px-6 py-4 text-slate-700 font-medium">KES ${parseFloat(l.principal_amount).toLocaleString()}</td>
        <td class="px-6 py-4 text-red-600 font-medium">KES ${parseFloat(l.outstanding_balance).toLocaleString()}</td>
        <td class="px-6 py-4 text-slate-600">${l.repayment_period_months} months</td>
        <td class="px-6 py-4">
          <span class="badge-${l.status} px-2 py-1 rounded-full text-xs font-medium">${l.status}</span>
        </td>
        <td class="px-6 py-4 text-slate-400 text-xs">${new Date(l.due_date).toLocaleDateString()}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Loans error:', err);
    document.getElementById('loansTable').innerHTML =
      '<tr><td colspan="7" class="px-6 py-8 text-center text-red-400">Failed to load loans.</td></tr>';
  }
}
 
// ── Load Loan Types ───────────────────────────────────────
async function loadLoanTypes() {
  try {
    const res = await fetch(`${BACKEND_URL}/admin/loantypes`);
    const data = await res.json();
    const tbody = document.getElementById('loanTypesTable');
 
    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="px-6 py-8 text-center text-slate-400">No loan types found.</td></tr>';
      return;
    }
 
    tbody.innerHTML = data.map(lt => `
      <tr class="table-row border-b border-slate-50">
        <td class="px-6 py-4 font-medium text-slate-700">${lt.loan_type_name}</td>
        <td class="px-6 py-4 text-slate-600">${lt.interest_rate}% p.a.</td>
        <td class="px-6 py-4 text-slate-700 font-medium">KES ${parseFloat(lt.max_amount).toLocaleString()}</td>
        <td class="px-6 py-4 text-slate-600">${lt.max_period_months} months</td>
        <td class="px-6 py-4">
          <div class="flex items-center gap-2">
            <button onclick='openEditLoanTypeModal(${JSON.stringify(lt)})'
                    class="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded-lg hover:bg-indigo-50 transition">
              Edit
            </button>
            <button onclick="confirmDelete('loantype', ${lt.loan_type_id}, '${lt.loan_type_name}')"
                    class="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded-lg hover:bg-red-50 transition">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Loan types error:', err);
  }
}
 
// ── Add Loan Type Modal ───────────────────────────────────
function openAddLoanTypeModal() {
  document.getElementById('loanTypeModalTitle').textContent = 'Add Loan Type';
  document.getElementById('loanTypeId').value = '';
  document.getElementById('ltName').value = '';
  document.getElementById('ltRate').value = '';
  document.getElementById('ltMaxAmount').value = '';
  document.getElementById('ltMaxPeriod').value = '';
  openModal('loanTypeModal');
}
 
// ── Edit Loan Type Modal ──────────────────────────────────
function openEditLoanTypeModal(lt) {
  document.getElementById('loanTypeModalTitle').textContent = 'Edit Loan Type';
  document.getElementById('loanTypeId').value = lt.loan_type_id;
  document.getElementById('ltName').value = lt.loan_type_name;
  document.getElementById('ltRate').value = lt.interest_rate;
  document.getElementById('ltMaxAmount').value = lt.max_amount;
  document.getElementById('ltMaxPeriod').value = lt.max_period_months;
  openModal('loanTypeModal');
}
 
// ── Save Loan Type (Add or Edit) ──────────────────────────
async function saveLoanType() {
  const id = document.getElementById('loanTypeId').value;
  const body = {
    loan_type_name: document.getElementById('ltName').value.trim(),
    interest_rate: parseFloat(document.getElementById('ltRate').value),
    max_amount: parseFloat(document.getElementById('ltMaxAmount').value),
    max_period_months: parseInt(document.getElementById('ltMaxPeriod').value)
  };
 
  if (!body.loan_type_name || !body.interest_rate || !body.max_amount || !body.max_period_months) {
    alert('Please fill in all fields.');
    return;
  }
 
  try {
    const url = id
      ? `${BACKEND_URL}/admin/loantypes/${id}`
      : `${BACKEND_URL}/admin/loantypes`;
    const method = id ? 'PUT' : 'POST';
 
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
 
    const data = await res.json();
    if (res.ok) {
      closeModal('loanTypeModal');
      loadLoanTypes();
    } else {
      alert(data.message || 'Something went wrong.');
    }
  } catch (err) {
    console.error('Save loan type error:', err);
    alert('Server error. Please try again.');
  }
}
 
// ── Confirm Delete ────────────────────────────────────────
function confirmDelete(type, id, name) {
  const messages = {
    member: `Are you sure you want to delete member "${name}"? This will also delete their savings and chat logs.`,
    loantype: `Are you sure you want to delete loan type "${name}"?`,
    chatlog: `Are you sure you want to delete this chat log?`
  };
 
  document.getElementById('deleteMessage').textContent = messages[type];
 
  const btn = document.getElementById('confirmDeleteBtn');
  btn.onclick = () => executeDelete(type, id);
 
  openModal('deleteModal');
}
 
// ── Execute Delete ────────────────────────────────────────
async function executeDelete(type, id) {
  const urls = {
    member: `${BACKEND_URL}/admin/members/${id}`,
    loantype: `${BACKEND_URL}/admin/loantypes/${id}`,
    chatlog: `${BACKEND_URL}/admin/chatlogs/${id}`
  };
 
  try {
    const res = await fetch(urls[type], { method: 'DELETE' });
    const data = await res.json();
 
    closeModal('deleteModal');
 
    if (res.ok) {
      // Reload the relevant section
      if (type === 'member') loadMembers();
      if (type === 'loantype') loadLoanTypes();
      if (type === 'chatlog') loadChatlogs();
      loadStats(); // refresh stat cards
    } else {
      alert(data.message || 'Delete failed.');
    }
  } catch (err) {
    console.error('Delete error:', err);
    alert('Server error. Please try again.');
  }
}
 
// ── Load Chat Logs ────────────────────────────────────────
async function loadChatlogs() {
  try {
    const res = await fetch(`${BACKEND_URL}/admin/chatlogs`);
    const data = await res.json();
    chatlogsData = data;
    const container = document.getElementById('chatlogsContainer');
    document.getElementById('chatlogsCount').textContent = `${data.length} recent logs`;
 
    if (data.length === 0) {
      container.innerHTML = '<p class="text-slate-400 text-sm">No chat logs yet.</p>';
      return;
    }
 
    container.innerHTML = data.map(log => `
      <div class="chat-card bg-slate-50 rounded-xl p-4">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold">
              ${log.first_name.charAt(0).toUpperCase()}
            </div>
            <span class="font-medium text-slate-700 text-sm">${log.first_name} ${log.last_name}</span>
            <span class="bg-indigo-50 text-indigo-600 text-xs px-2 py-0.5 rounded-full font-medium">
              ${log.intent_name || 'N/A'}
            </span>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-xs text-slate-400">${new Date(log.created_at).toLocaleString()}</span>
            <button onclick="confirmDelete('chatlog', ${log.chat_id}, '')"
                    class="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded-lg hover:bg-red-50 transition">
              Delete
            </button>
            <button onclick="viewChatlog(${log.chat_id})"
        class="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded-lg hover:bg-indigo-50 transition">
  View
</button>
          </div>
        </div>
        <div class="mt-2 space-y-1">
          <p class="text-xs text-slate-500">
            <span class="font-medium text-slate-600">👤 Member:</span> ${log.user_message}
          </p>
          <p class="text-xs text-slate-500">
            <span class="font-medium text-slate-600">🤖 Bot:</span> ${log.bot_response.substring(0, 150)}${log.bot_response.length > 150 ? '...' : ''}
          </p>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Chatlogs error:', err);
    document.getElementById('chatlogsContainer').innerHTML =
      '<p class="text-red-400 text-sm">Failed to load chat logs.</p>';
  }
}
 
// ── View Chatlog Details ──────────────────────────────────
function viewChatlog(chatId) {
  const log = chatlogsData.find(l => l.chat_id === chatId);
  if (!log) return;
  const content = document.getElementById('chatlogDetailsContent');
  content.innerHTML = `
    <div class="flex items-center gap-4 mb-5 pb-5 border-b border-slate-100">
      <div class="w-14 h-14 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xl">
        ${log.first_name.charAt(0).toUpperCase()}
      </div>
      <div>
        <p class="font-semibold text-slate-800 text-lg">${log.first_name} ${log.last_name}</p>
        <p class="text-xs text-slate-400">${new Date(log.created_at).toLocaleString()}</p>
      </div>
    </div>
    <div class="space-y-4 text-sm">
      <div class="flex justify-between">
        <span class="text-slate-500">Intent</span>
        <span class="bg-indigo-50 text-indigo-600 text-xs px-2 py-0.5 rounded-full font-medium">${log.intent_name || 'N/A'}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-slate-500">Chat ID</span>
        <span class="font-medium text-slate-700">#${log.chat_id}</span>
      </div>
      <div class="pt-2 border-t border-slate-100">
        <p class="text-slate-500 font-medium mb-1">👤 Member Message</p>
        <p class="text-slate-700 bg-slate-50 rounded-lg p-3 leading-relaxed">${log.user_message}</p>
      </div>
      <div>
        <p class="text-slate-500 font-medium mb-1">🤖 Bot Response</p>
        <p class="text-slate-700 bg-slate-50 rounded-lg p-3 leading-relaxed whitespace-pre-wrap">${log.bot_response}</p>
      </div>
    </div>
  `;
  openModal('viewChatlogModal');
}

// ── Logout ────────────────────────────────────────────────
function logout() {
  localStorage.removeItem('userId');
  localStorage.removeItem('userFirstName');
  localStorage.removeItem('userRole');
  localStorage.removeItem('chatHistory');
  window.location.href = 'auth/log-in.html';
}