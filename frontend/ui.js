// ui.js — DOM helpers, message rendering, cards, profile tracker

// ── DOM: ADD MESSAGES ──────────────────────────────────
function addBot(text, chips=[], extra=null) {
  const c = document.getElementById('msgs');
  const row = document.createElement('div');
  row.className = 'msg-row bot';
  let extraHTML = '';
  if (extra?.type === 'prediction') extraHTML = buildPredCard(extra.data);
  if (extra?.type === 'emi')        extraHTML = buildEMICard(extra.data);
  row.innerHTML = `
    <div class="av bot">🤖</div>
    <div class="msg-col">
      <div class="sender">LOANBOT AI</div>
      <div class="bubble bot">${md(text)}</div>
      ${extraHTML}
      ${chips.length ? `<div class="chips">${chips.map(c=>`<button class="chip" onclick="qs('${esc(c)}')">${c}</button>`).join('')}</div>` : ''}
    </div>`;
  c.appendChild(row);
  c.scrollTop = c.scrollHeight;
}

function addUser(text) {
  const c = document.getElementById('msgs');
  const row = document.createElement('div');
  row.className = 'msg-row user';
  row.innerHTML = `
    <div class="av user">👤</div>
    <div class="msg-col">
      <div class="sender">YOU</div>
      <div class="bubble user">${escHTML(text)}</div>
    </div>`;
  c.appendChild(row);
  c.scrollTop = c.scrollHeight;
}

function showTyping() {
  const c = document.getElementById('msgs');
  const row = document.createElement('div');
  row.className = 'msg-row bot'; row.id = 'tRow';
  row.innerHTML = `<div class="av bot">🤖</div><div class="msg-col"><div class="sender">LOANBOT AI</div><div class="bubble bot"><div class="typing-bub"><div class="td"></div><div class="td"></div><div class="td"></div></div></div></div>`;
  c.appendChild(row);
  c.scrollTop = c.scrollHeight;
}

function removeTyping() {
  const t = document.getElementById('tRow');
  if (t) t.remove();
}

// ── BUILD PREDICTION CARD ─────────────────────────────
function buildPredCard(d) {
  const ok   = d.approved;
  const prob = ok ? d.prob_approved : d.prob_rejected;
  const dti  = d.dti || Math.round(d.loan_amnt / d.person_income * 100);
  return `
<div class="pred-card">
  <div class="pred-header ${ok?'approved':'rejected'}">
    <div class="pred-verdict">
      <span class="verdict-icon">${ok?'✅':'❌'}</span>
      <div>
        <div class="verdict-label ${ok?'ok':'no'}">${d.label}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">Based on 45K training records</div>
      </div>
    </div>
    <div class="pred-prob">
      <div class="prob-num ${ok?'ok':'no'}">${Math.round(prob)}%</div>
      <div class="prob-lbl">${ok?'Approval':'Rejection'} Probability</div>
    </div>
  </div>
  <div class="pred-body">
    <div class="pred-row"><span class="pk">Loan Amount</span><span class="pv">$${Math.round(d.loan_amnt).toLocaleString()}</span></div>
    <div class="pred-row"><span class="pk">Annual Income</span><span class="pv">$${Math.round(d.person_income).toLocaleString()}</span></div>
    <div class="pred-row"><span class="pk">Debt-to-Income</span><span class="pv" style="color:${dti<20?'var(--green)':dti<35?'var(--orange)':'var(--red)'}">${dti}%</span></div>
    <div class="pred-row"><span class="pk">Interest Rate</span><span class="pv">${d.loan_int_rate}%</span></div>
    <div class="pred-row"><span class="pk">Credit Score</span><span class="pv">${d.credit_score}</span></div>
    <div class="pred-row"><span class="pk">Home Ownership</span><span class="pv">${d.person_home_ownership}</span></div>
    <div class="pred-row"><span class="pk">Loan Intent</span><span class="pv">${d.loan_intent}</span></div>
    <div class="pred-row"><span class="pk">Prev Defaults</span><span class="pv" style="color:${d.previous_loan_defaults_on_file==='Yes'?'var(--red)':'var(--green)'}">${d.previous_loan_defaults_on_file}</span></div>
    <div style="margin-top:4px">
      <div style="font-size:10px;color:var(--text3);margin-bottom:4px;">Confidence</div>
      <div class="pred-bar"><div class="pred-fill ${ok?'fill-ok':'fill-no'}" style="width:${Math.round(prob)}%"></div></div>
    </div>
  </div>
</div>`;
}

// ── BUILD EMI CARD ────────────────────────────────────
function buildEMICard(d) {
  const interest_pct = Math.round(d.total_interest / d.total_paid * 100);
  return `
<div class="emi-card">
  <div class="emi-title">📊 EMI Breakdown · ${d.tenure_years}-Year Loan</div>
  <div class="emi-main">$${d.emi.toLocaleString()}<span style="font-size:14px;color:var(--text2);font-family:var(--font-b);font-weight:400">/month</span></div>
  <div class="emi-grid">
    <div class="emi-item"><div class="el">Principal</div><div class="ev" style="color:var(--teal)">$${Math.round(d.principal).toLocaleString()}</div></div>
    <div class="emi-item"><div class="el">Total Interest</div><div class="ev" style="color:var(--red)">$${Math.round(d.total_interest).toLocaleString()}</div></div>
    <div class="emi-item"><div class="el">Total Paid</div><div class="ev">$${Math.round(d.total_paid).toLocaleString()}</div></div>
    <div class="emi-item"><div class="el">Interest Cost</div><div class="ev" style="color:var(--orange)">${interest_pct}%</div></div>
  </div>
</div>`;
}

// ── PROFILE TRACKER ────────────────────────────────────
const FIELDS = [
  {key:'person_income',label:'Income'}, {key:'loan_amnt',label:'Loan Amount'},
  {key:'loan_int_rate',label:'Interest Rate'}, {key:'credit_score',label:'Credit Score'},
  {key:'person_home_ownership',label:'Ownership'}, {key:'loan_intent',label:'Loan Intent'},
  {key:'previous_loan_defaults_on_file',label:'Prev Defaults'}
];

function updateProfile(data) {
  Object.assign(userProfile, data);
  const fl = document.getElementById('fieldList');
  let filled = 0;
  fl.innerHTML = FIELDS.map(f => {
    const v = userProfile[f.key];
    if (v !== undefined && v !== null && v !== '') {
      filled++;
      const disp = typeof v === 'number' ? (f.key.includes('income')||f.key.includes('loan_amnt') ? '$'+Math.round(v).toLocaleString() : v) : v;
      return `<div class="field-row filled"><span class="field-k">${f.label}</span><span class="field-v">${disp}</span></div>`;
    }
    return `<div class="field-row missing"><span class="field-k">${f.label}</span><span class="field-v">—</span></div>`;
  }).join('');
  const pct = Math.round(filled / FIELDS.length * 100);
  document.getElementById('compPct').textContent = pct + '%';
  document.getElementById('compBar').style.width = pct + '%';
}

// ── HELPERS ────────────────────────────────────────────
function md(t) {
  return escHTML(t)
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,'<em>$1</em>')
    .replace(/\n/g,'<br>');
}
function escHTML(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function esc(s){ return s.replace(/'/g,"\\'"); }

function setBusy(v){
  busy=v;
  const b=document.getElementById('sendBtn');
  if(b) b.disabled=v;
}
function handleKey(e){ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg();} }
function onInp(el){
  el.style.height='auto';
  el.style.height=Math.min(el.scrollHeight,120)+'px';
  updateCC(el.value);
}
function updateCC(v){ document.getElementById('cc').textContent=`${v.length}/600`; }
function qs(t){ document.getElementById('inp').value=t; sendMsg(); }

function clearChat(){
  history=[]; userProfile={};
  document.getElementById('msgs').innerHTML='';
  updateProfile({});
  showWelcome();
}

function exportReport(){
  const msgs = [...document.querySelectorAll('.bubble')].map(b=>b.innerText).join('\n\n---\n\n');
  const blob = new Blob([`LOANBOT AI - SESSION REPORT\nGenerated: ${new Date().toLocaleString()}\nTrained on: 45,000 loan applications\n\n${msgs}`],{type:'text/plain'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='loanbot-report.txt'; a.click();
}