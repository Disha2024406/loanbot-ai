// chat.js — Send message, process AI reply, demo mode replies, UI helpers

// ── SEND MESSAGE ───────────────────────────────────────
async function sendMsg() {
  const el = document.getElementById('inp');
  const text = el.value.trim();
  if (!text || busy) return;
  el.value = ''; el.style.height = 'auto';
  updateCC('');
  addUser(text);
  history.push({ role:'user', content:text });
  setBusy(true);
  showTyping();
  const reply = await getReply();
  removeTyping();
  processReply(reply);
  history.push({ role:'assistant', content:reply });
  setBusy(false);
}

async function getReply() {
  if (demoMode) return buildDemoReply(history[history.length-1].content);
  if (!apiKey) return '⚠️ Please set your API key — click the 🔑 button in the top right.';
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:'llama-3.3-70b-versatile',
        max_tokens:2048,
        messages: [
          { role:'system', content: SYSTEM },
          ...history
        ]
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content;
  } catch(e) {
    return `⚠️ Error: ${e.message}. Please check your API key.`;
  }
}

// ── PROCESS AI REPLY ────────────────────────────────────
function processReply(text) {
  let display = text;
  let predExtra = null;
  let emiExtra  = null;
  let chips = [];

  const pm = text.match(/\[PREDICT:(\{[\s\S]*?\})\]/);
  if (pm) {
    try {
      const pd = JSON.parse(pm[1]);
      Object.assign(userProfile, pd);
      const result = runLocalModel(pd);
      display = display.replace(/\[PREDICT:[\s\S]*?\]/, '').trim();
      predExtra = { type:'prediction', data:{ ...pd, ...result } };
      chips = ['Show improvement tips', 'Calculate EMI for this loan', 'How do I improve my chances?'];
      updateProfile(pd);
    } catch(e) { console.warn('PREDICT parse error:', e); }
  }

  const em = text.match(/\[EMI:(\{[\s\S]*?\})\]/);
  if (em) {
    try {
      const ed = JSON.parse(em[1]);
      const emiData = calcEMI(ed.principal, ed.rate, ed.tenure_years);
      display = display.replace(/\[EMI:[\s\S]*?\]/, '').trim();
      emiExtra = { type:'emi', data:{ ...ed, ...emiData } };
    } catch(e) { console.warn('EMI parse error:', e); }
  }

  if (!chips.length) chips = ['Tell me more about my options', 'What can I do to improve my chances?'];

  addBot(display.trim(), chips, predExtra || emiExtra);

  if (predExtra && emiExtra) {
    const c = document.getElementById('msgs');
    const div = document.createElement('div');
    div.className = 'msg-row bot';
    div.innerHTML = `<div class="av bot">🤖</div><div class="msg-col">${buildEMICard(emiExtra.data)}</div>`;
    c.appendChild(div);
    c.scrollTop = c.scrollHeight;
  }
}

// ── DEMO MODE REPLIES ──────────────────────────────────
function buildDemoReply(input) {
  const lower = input.toLowerCase();
  const nums  = extractNumbers(input);

  // 1. Has income + loan → run eligibility
  if (nums.income && nums.loan) {
    const income    = nums.income;
    const loan      = nums.loan;
    const rate      = nums.rate   || 10.5;
    const tenure    = nums.tenure || 3;
    const credit    = nums.creditScore || 640;
    const ownership = nums.ownership || 'RENT';
    const intent    = nums.intent    || 'PERSONAL';
    const defaults  = nums.defaults  || 'No';
    const dti       = loan / income;
    const dtiPct    = Math.round(dti * 100);

    const profile = {
      person_age: 30, person_income: income, person_emp_exp: 5,
      loan_amnt: loan, loan_int_rate: rate,
      loan_percent_income: dti,
      cb_person_cred_hist_length: 4,
      credit_score: credit,
      person_gender: 'male',
      person_education: 'Bachelor',
      person_home_ownership: ownership,
      loan_intent: intent,
      previous_loan_defaults_on_file: defaults,
    };
    updateProfile(profile);
    const result = runLocalModel(profile);

    let dtiBand, dtiApproval;
    if (dtiPct < 10)      { dtiBand = '<10%';   dtiApproval = 88.2; }
    else if (dtiPct < 20) { dtiBand = '10-20%'; dtiApproval = 82.4; }
    else if (dtiPct < 30) { dtiBand = '20-30%'; dtiApproval = 55.2; }
    else if (dtiPct < 40) { dtiBand = '30-40%'; dtiApproval = 27.4; }
    else                  { dtiBand = '>40%';   dtiApproval = 24.6; }

    let incomeApproval;
    if (income < 30000)       incomeApproval = 43.8;
    else if (income < 50000)  incomeApproval = 67.3;
    else if (income < 80000)  incomeApproval = 79.9;
    else if (income < 120000) incomeApproval = 86.5;
    else                      incomeApproval = 91.2;

    const emiData = calcEMI(loan, rate, tenure);
    const defaultsFlag = defaults === 'Yes';

    const tips = [];
    if (dtiPct >= 20) tips.push(`Reduce loan amount to $${Math.round(income * 0.19).toLocaleString()} to bring DTI below 20% (82.4% approval band)`);
    if (rate > 10)    tips.push(`A lower interest rate (under 10%) improves approval signal significantly (r=0.33 with rejection)`);
    if (ownership === 'RENT') tips.push(`Home owners see **92.5%** approval vs your current **67.6%** as a renter — consider secured loan alternatives`);
    if (intent === 'PERSONAL' || !nums.intent) tips.push(`Switching intent to EDUCATION or VENTURE gives 83-85.6% approval vs PERSONAL's 79.9% in our dataset`);
    if (credit < 660) tips.push(`Boosting your credit score above 660 moves you to the Very Good band`);
    if (tips.length === 0) tips.push(`Your profile is strong! Maintain clean payment history to stay above 80%+ approval zone`);

    const predBlock = `[PREDICT:${JSON.stringify(profile)}]`;
    const emiBlock  = `[EMI:{"principal":${loan},"rate":${rate},"tenure_years":${tenure}}]`;

    return `Got it! Analysing your profile against our **45,000 training records** right now…

${predBlock}
${emiBlock}

**Your Profile Summary:**
- 💰 Annual Income: **$${income.toLocaleString()}**
- 💵 Loan Amount: **$${loan.toLocaleString()}**
- 📉 Interest Rate: **${rate}%**${nums.rate ? '' : ' *(assumed — dataset avg)*'}
- 📊 Debt-to-Income: **${dtiPct}%** → ${dtiBand} band → **${dtiApproval}%** approval rate in dataset
- 🏠 Ownership: **${ownership}** → **${DS.byOwnership[ownership] || 67.6}%** approval rate
- 💳 Income Band: **$${income.toLocaleString()}** → **${incomeApproval}%** approval rate

**Monthly EMI would be: $${emiData.emi.toLocaleString()}** over ${tenure} year${tenure>1?'s':''}${nums.tenure ? '' : ' *(assumed 3yr — tell me your preferred tenure)*'}

${defaultsFlag ? '⚠️ **CRITICAL: Previous defaults detected — this is a 100% rejection signal in our training data.**' : '✅ No previous defaults — this is your strongest positive factor.'}

**Top ${tips.length} improvement tip${tips.length>1?'s':''}:**
${tips.slice(0,3).map((t,i)=>`${i+1}. ${t}`).join('\n')}`;
  }

  // 2. Has only rate
  if (nums.rate && !nums.income && !nums.loan) {
    return `I see an interest rate of **${nums.rate}%**. In our 45K dataset, the average approved loan carries **11.01%** — yours is ${nums.rate < 11 ? 'below average ✅' : 'above average ⚠️'}.

To give you a full eligibility prediction, I also need:
- 💰 Your **annual income** (e.g., $75,000)
- 💵 The **loan amount** you need (e.g., $15,000)

Just share those two and I'll predict your approval probability instantly!`;
  }

  // 3. Has only income
  if (nums.income && !nums.loan) {
    const incomeApproval = nums.income < 30000 ? 43.8 : nums.income < 50000 ? 67.3 : nums.income < 80000 ? 79.9 : nums.income < 120000 ? 86.5 : 91.2;
    return `Your income of **$${nums.income.toLocaleString()}** puts you in the **${incomeApproval}% approval bracket** from our dataset.

Now I need the **loan amount** you're requesting. Based on your income, keeping the loan under **$${Math.round(nums.income * 0.20).toLocaleString()}** (20% of income) gives you the best approval odds — **82%+** in our data.

What loan amount are you looking for?`;
  }

  // 4. Has only loan
  if (nums.loan && !nums.income) {
    return `I see you need a loan of **$${nums.loan.toLocaleString()}**. In our 45K dataset, the average approved loan is **$9,583**.

To predict your eligibility I need your **annual income** — this determines your Debt-to-Income ratio, which is the **strongest predictor** in our model (r=0.38).

What is your annual income?`;
  }

  // 5. EMI calculation
  if ((lower.includes('emi') || lower.includes('monthly payment') || lower.includes('installment')) && nums.loan && nums.rate) {
    const P = nums.loan, r = nums.rate, t = nums.tenure || 5;
    const emiData = calcEMI(P, r, t);
    return `Here's your EMI calculation!
[EMI:{"principal":${P},"rate":${r},"tenure_years":${t}}]

**Monthly EMI: $${emiData.emi.toLocaleString()}** for ${t} years
- Total Interest: $${emiData.total_interest.toLocaleString()} (${Math.round(emiData.total_interest/P*100)}% of principal)
- Total Paid: $${emiData.total_paid.toLocaleString()}

💡 In our **45K dataset**, applicants whose EMI exceeds 20% of monthly income face a **55%+ rejection** rate. Your safe monthly income for this EMI is **$${Math.round(emiData.emi / 0.20).toLocaleString()}+/year**.`;
  }

  // 6. Credit score
  if (lower.includes('credit') || lower.includes('cibil') || lower.includes('score')) {
    return `Based on our **45,000 loan records**, credit score alone is surprisingly weak:

📊 **Approved avg:** 633 | **Rejected avg:** 632 — barely different!

Credit score bands (approval rate):
- Poor <580 → **77.7%** approval
- Fair 580-620 → **77.1%** approval
- Good 620-660 → **77.8%** approval
- Very Good 660-700 → **78.1%** approval
- Excellent 700+ → **78.9%** approval

The real differentiators (from dataset correlations):
1. **Debt-to-Income ratio** (r=0.38) — most powerful
2. **Interest rate** (r=0.33) — 2nd strongest
3. **Previous defaults** → 100% rejection in our data
4. **Annual income** (r=-0.14)

*Focus on your DTI and income far more than credit score!*`;
  }

  // 7. Home ownership
  if (lower.includes('own') || lower.includes('rent') || lower.includes('mortgage') || lower.includes('home')) {
    return `**Home ownership impact** in our 45K dataset:

| Status    | Approval Rate |
|-----------|--------------|
| 🏠 Own    | **92.5%** ✅ |
| 🏦 Mortgage | **88.4%** ✅ |
| 🏢 Rent   | **67.6%** ⚠️ |
| Other     | **66.7%** ⚠️ |

Renters see a **24.9% lower** approval rate than owners. This signals lower financial stability to lenders.

**If you rent**, you can offset this by:
- Keeping DTI under 10% (gives 88.2% approval regardless of ownership)
- Applying for EDUCATION or VENTURE loans (83-85.6% approval rates)
- Providing income proof above $80K (86.5% approval band)`;
  }

  // 8. Default history
  if (lower.includes('default') || lower.includes('bad credit') || lower.includes('missed payment')) {
    return `⚠️ **This is the most critical factor in our dataset.**

In our **45,000 training records**:
- Applicants **with** previous defaults → **100% REJECTION** (every single one)
- Applicants **without** defaults → **54.8% approval**

If you have defaults on file, lenders will almost certainly reject the application regardless of income or credit score.

**What you can do:**
1. **Wait 2-3 years** — defaults age off credit reports
2. **Apply for secured loans** (backed by collateral) — different risk model
3. **Rebuild credit** with a secured credit card for 12+ months
4. **Seek credit unions** — they use alternative scoring models
5. **Consider a co-applicant** with a clean credit history

Do you want me to calculate what your profile would look like *without* the defaults flag?`;
  }

  // 9. Best loan intent
  if (lower.includes('intent') || lower.includes('purpose') || lower.includes('best loan') || lower.includes('type')) {
    return `**Loan approval rates by intent** from our 45K dataset:

| Loan Type          | Approval Rate | Count  |
|--------------------|--------------|--------|
| 🚀 Venture         | **85.6%** ✅  | 7,819  |
| 📚 Education       | **83.0%** ✅  | 9,153  |
| 💼 Personal        | **79.9%**     | 7,552  |
| 🏠 Home Improvement| **73.7%**     | 4,783  |
| 🏥 Medical         | **72.2%**     | 8,548  |
| 💳 Debt Consolidation| **69.7%** ⚠️ | 7,145  |

**VENTURE** and **EDUCATION** loans see 15+ percentage points higher approval than debt consolidation. If your use case fits, framing it as one of these maximises approval odds!`;
  }

  // 10. Generic / greeting
  return `I'm LoanBot, trained on **45,000 real loan applications** (Gradient Boosting, ~88% accuracy).

To give you a **personalised eligibility prediction** with an approval probability, just share:
- 💰 **Income** — e.g., *"income 80000"* or *"I earn $80k"*
- 💵 **Loan amount** — e.g., *"loan 15000"* or *"need $15,000"*
- 📉 **Interest rate** — e.g., *"rate 9%"* or *"at 8.5%"* *(optional — I'll use dataset average if not given)*

You gave me: **"${input}"**
${nums.income ? `✅ Income detected: $${nums.income.toLocaleString()}` : '❓ Income: not found yet'}
${nums.loan   ? `✅ Loan detected: $${nums.loan.toLocaleString()}`   : '❓ Loan amount: not found yet'}
${nums.rate   ? `✅ Rate detected: ${nums.rate}%`                    : '❓ Rate: not found yet'}

Just add the missing pieces and I'll run the prediction instantly!`;
}