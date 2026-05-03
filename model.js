// model.js — Local rule-based model, EMI calculator, number extractor

// ── LOCAL RULE-BASED MODEL (for demo mode + instant feedback) ──
function runLocalModel(d) {
  let score = 0;
  const reasons = [];
  const dti = d.loan_amnt / d.person_income;

  // DTI — strongest predictor (r=0.38)
  if (dti < 0.10)      { score += 30; reasons.push({ t:'DTI <10%', ok:true }); }
  else if (dti < 0.20) { score += 20; reasons.push({ t:'DTI 10-20%', ok:true }); }
  else if (dti < 0.30) { score += 5;  reasons.push({ t:'DTI 20-30%', ok:false }); }
  else                 { score -= 15; reasons.push({ t:'DTI >30%', ok:false }); }

  // Interest rate (r=0.33)
  if (d.loan_int_rate < 8)       { score += 25; }
  else if (d.loan_int_rate < 11) { score += 15; }
  else if (d.loan_int_rate < 14) { score += 5;  }
  else                           { score -= 10; }

  // Previous defaults — CRITICAL
  if (d.previous_loan_defaults_on_file === 'Yes') { score = -100; reasons.push({ t:'Previous defaults', ok:false }); }
  else                                             { score += 15;  reasons.push({ t:'No defaults', ok:true }); }

  // Income
  if (d.person_income >= 120000)     { score += 20; }
  else if (d.person_income >= 80000) { score += 14; }
  else if (d.person_income >= 50000) { score += 8;  }
  else                               { score += 0;  }

  // Home ownership
  const ownMap = { OWN:20, MORTGAGE:15, RENT:0, OTHER:-5 };
  score += (ownMap[d.person_home_ownership] || 0);

  // Credit score
  if (d.credit_score >= 700)      { score += 12; }
  else if (d.credit_score >= 660) { score += 8;  }
  else if (d.credit_score >= 620) { score += 4;  }
  else                            { score += 0;  }

  // Loan intent
  const intentMap = { VENTURE:10, EDUCATION:8, PERSONAL:6, HOMEIMPROVEMENT:4, MEDICAL:2, DEBTCONSOLIDATION:0 };
  score += (intentMap[d.loan_intent] || 0);

  // Employment
  if (d.person_emp_exp >= 5)      { score += 8; }
  else if (d.person_emp_exp >= 2) { score += 4; }

  // Normalize to probability
  const rawProb = Math.max(0, Math.min(100, 45 + score));
  const approved = rawProb >= 50 && d.previous_loan_defaults_on_file !== 'Yes';
  return {
    approved,
    prob_approved: approved ? rawProb : 100 - rawProb,
    prob_rejected: approved ? 100 - rawProb : rawProb,
    label: approved ? 'APPROVED' : 'REJECTED',
    dti: Math.round(dti * 100),
    reasons,
  };
}

// ── EMI CALCULATOR ─────────────────────────────────────
function calcEMI(P, annualRate, years) {
  const r = annualRate / 100 / 12;
  const n = years * 12;
  const emi = r === 0 ? P/n : P * r * Math.pow(1+r,n) / (Math.pow(1+r,n)-1);
  return {
    emi: Math.round(emi*100)/100,
    total_paid: Math.round(emi * n * 100)/100,
    total_interest: Math.round((emi * n - P) * 100)/100,
  };
}

// ── SMART NUMBER EXTRACTOR ─────────────────────────────
function extractNumbers(input) {
  const lower = input.toLowerCase();
  const out = {};

  // income
  const incomePatterns = [
    /(?:income|salary|earn(?:ing)?s?|annual\s+income|yearly\s+income)[^\d$]*\$?([\d,]+(?:\.\d+)?)\s*(k|lakh|lac|l\b|cr)?/i,
    /\$?([\d,]+(?:\.\d+)?)\s*(k|lakh|lac|l\b|cr)?\s+(?:income|salary|annual)/i,
  ];
  for (const p of incomePatterns) {
    const m = input.match(p);
    if (m) { out.income = parseAmt(m[1], m[2]); break; }
  }

  // loan amount
  const loanPatterns = [
    /(?:loan\s+(?:amount|amnt|amou?nt?)|borrow(?:ing)?|need(?:ed)?|want)[^\d$]*\$?([\d,]+(?:\.\d+)?)\s*(k|lakh|lac|l\b|cr)?/i,
    /\$?([\d,]+(?:\.\d+)?)\s*(k|lakh|lac|l\b|cr)?\s+(?:loan|borrow)/i,
    /loan[^\d$:]*:?\s*\$?([\d,]+(?:\.\d+)?)\s*(k|lakh|lac|l\b|cr)?/i,
  ];
  for (const p of loanPatterns) {
    const m = input.match(p);
    if (m) { out.loan = parseAmt(m[1], m[2]); break; }
  }

  // interest rate
  const ratePatterns = [
    /(?:rate|interest|int\.?)[^\d]*(\d+(?:\.\d+)?)\s*%/i,
    /(\d+(?:\.\d+)?)\s*%\s*(?:rate|interest|p\.?a\.?)/i,
    /(?:at|@)\s*(\d+(?:\.\d+)?)\s*%/i,
    /rate\s*[=:]\s*(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*%/,
  ];
  for (const p of ratePatterns) {
    const m = input.match(p);
    if (m) { const v = parseFloat(m[1]); if (v >= 1 && v <= 30) { out.rate = v; break; } }
  }

  // tenure
  const tenurePatterns = [
    /(\d+)\s*(?:year|yr|years|yrs)/i,
    /(?:tenure|term|period)[^\d]*(\d+)/i,
  ];
  for (const p of tenurePatterns) {
    const m = input.match(p);
    if (m) { out.tenure = parseInt(m[1]); break; }
  }

  // credit score
  const creditM = input.match(/(?:credit\s*score|cibil|fico)[^\d]*(\d{3})/i) ||
                  input.match(/score[^\d]*(\d{3})/i);
  if (creditM) out.creditScore = parseInt(creditM[1]);

  // home ownership
  if (/\b(own|owner)\b/i.test(lower) && !/ownership/i.test(lower)) out.ownership = 'OWN';
  else if (/\brent(ing|er)?\b/i.test(lower)) out.ownership = 'RENT';
  else if (/\bmortgage\b/i.test(lower)) out.ownership = 'MORTGAGE';

  // loan intent
  const intentMap = {
    'education|student|study|tuition': 'EDUCATION',
    'medical|health|hospital|treatment': 'MEDICAL',
    'personal|personal use': 'PERSONAL',
    'venture|business|startup|invest': 'VENTURE',
    'debt|consolidat': 'DEBTCONSOLIDATION',
    'home.?improvement|renovation|repair': 'HOMEIMPROVEMENT',
  };
  for (const [pat, intent] of Object.entries(intentMap)) {
    if (new RegExp(pat, 'i').test(input)) { out.intent = intent; break; }
  }

  // previous defaults
  if (/no\s+default|never\s+default|clean\s+record|no\s+prev/i.test(lower)) out.defaults = 'No';
  else if (/default|missed\s+payment|overdue/i.test(lower)) out.defaults = 'Yes';

  return out;
}

function parseAmt(numStr, unit) {
  let v = parseFloat(String(numStr).replace(/,/g, ''));
  if (!unit) return v;
  const u = unit.toLowerCase();
  if (u === 'k')                           return v * 1_000;
  if (u === 'lakh' || u === 'lac' || u === 'l') return v * 100_000;
  if (u === 'cr')                          return v * 10_000_000;
  return v;
}