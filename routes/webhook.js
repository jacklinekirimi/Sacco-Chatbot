const express = require('express');
const router = express.Router();
const mysql = require('mysql2');

// Database connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'kammy@2004',
  database: 'amini_assist'
});

db.connect((err) => {
  if (err) {
    console.error('Webhook DB connection failed:', err);
  } else {
    console.log('Webhook connected to MySQL!');
  }
});

// Main webhook handler
router.post('/', (req, res) => {
  try {
    const intentName = req.body.queryResult.intent.displayName;
    const parameters = req.body.queryResult.parameters;
    let userMessage = req.body.queryResult.queryText;
    if (intentName === 'Loan Eligibility') userMessage = 'Loan eligibility check';
    if (intentName === 'Loan Top-up') userMessage = 'Loan top-up request';
    const session = req.body.session;
    const sessionParts = session.split('/');
    const memberId = sessionParts[sessionParts.length - 1];

    console.log('Intent triggered:', intentName);
    console.log('Parameters received:', JSON.stringify(parameters));

    if (intentName === 'Check Loan Balance') {
      checkLoanBalance(memberId, res, intentName, userMessage); 
    } else if (intentName === 'Check Savings Balance') {
      checkSavingsBalance(memberId, res, intentName, userMessage); 
    } else if (intentName === 'Loan Eligibility') {
      checkEligibility(memberId, res, parameters, intentName, userMessage); 
    } else if (intentName === 'Loan Top-up') {
      calculateTopUp(memberId, res, intentName, userMessage, parameters); 
    } else {
      res.json({
        fulfillmentText: "I'm sorry, I didn't understand that. Please try rephrasing."
      });
    }
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(200).json({
      fulfillmentText: "Sorry, something went wrong on my end. Please try again."
    });
  }
});

// ─── Intent Handlers ───────────────────────────────────────────

// ── Get loan type ID from name ─────────────────────────
function getLoanTypeId(loanProduct) {
  const product = loanProduct.toLowerCase().replace(' loan', '').trim();
  if (product.includes('emergency')) return 2;
  if (product.includes('school')) return 3;
  if (product.includes('quick')) return 4;
  return 1; // default to Normal
}

function checkLoanBalance(memberId, res, intentName, userMessage) {
  const query = `SELECT outstanding_balance, due_date FROM loans WHERE member_id = ?`;
  db.query(query, [memberId], (err, results) => {
    if (err || results.length === 0) {
      const reply = "I couldn't find your loan details. Please make sure you are logged in.";
      saveChatLog(memberId, intentName, userMessage, reply);
      return res.json({ fulfillmentText: reply });
    }
    const loan = results[0];
    const reply = `Your outstanding loan balance is KES ${loan.outstanding_balance}. Your next due date is ${new Date(loan.due_date).toDateString()}.`;
    saveChatLog(memberId, intentName, userMessage, reply);
    res.json({ fulfillmentText: reply });
  });
}

function checkSavingsBalance(memberId, res, intentName, userMessage) {
  const query = `SELECT savings_balance, monthly_contribution FROM savings WHERE member_id = ?`;
  db.query(query, [memberId], (err, results) => {
    if (err || results.length === 0) {
      const reply = "I couldn't find your savings details. Please make sure you are logged in.";
      saveChatLog(memberId, intentName, userMessage, reply);
      return res.json({ fulfillmentText: reply });
    }
    const savings = results[0];
    const reply = `Your current savings balance is KES ${savings.savings_balance}. Your monthly contribution is KES ${savings.monthly_contribution}.`;
    saveChatLog(memberId, intentName, userMessage, reply);
    res.json({ fulfillmentText: reply });
  });
}

function checkEligibility(memberId, res, parameters, intentName, userMessage) {
  const loanProduct = parameters.loan_product || 'Normal';
  const loanTypeId = getLoanTypeId(loanProduct);
  const basicSalary = parameters.basic_salary;
  const netSalary = parameters.net_salary;
  const loanAmount = Array.isArray(parameters.loan_amount)
    ? parameters.loan_amount[0]
    : parameters.loan_amount;
  const repaymentData = Array.isArray(parameters.repayment_period)
    ? parameters.repayment_period[0]
    : parameters.repayment_period;

  let repaymentMonths;
  if (repaymentData.unit === 'yr') {
    repaymentMonths = repaymentData.amount * 12;
  } else {
    repaymentMonths = repaymentData.amount;
  }

  if (!basicSalary || !netSalary || !loanAmount || !repaymentMonths) {
    const reply = "I'm missing some information. Please try again.";
    saveChatLog(memberId, intentName, userMessage, reply);
    return res.json({ fulfillmentText: reply });
  }

 const query = `
    SELECT m.first_name, s.savings_balance, lt.interest_rate, lt.max_amount, lt.max_period_months
    FROM members m
    LEFT JOIN savings s ON m.id = s.member_id
    LEFT JOIN loan_types lt ON lt.loan_type_id = ?
    WHERE m.id = ?
  `;

  db.query(query,  [loanTypeId, memberId], (err, results) => {
    if (err || results.length === 0) {
      const reply = "I couldn't verify your eligibility. Please make sure you are logged in.";
      saveChatLog(memberId, intentName, userMessage, reply);
      return res.json({ fulfillmentText: reply });
    }

    const member = results[0];
    const savingsBalance = member.savings_balance || 0;
    const annualRate = member.interest_rate || 12;
    const monthlyRate = annualRate / 100 / 12;
    const n = repaymentMonths;
    const P = loanAmount;

    // Max loan by deposits (4× savings)
    const maxLoanByDeposits = savingsBalance * 4;

    // One-third salary rule
    const maxMonthlyDeduction = basicSalary / 3;

    // Monthly installment (reducing balance formula)
    const installment = P * (monthlyRate * Math.pow(1 + monthlyRate, n)) /
                        (Math.pow(1 + monthlyRate, n) - 1);
    const installmentFormatted = Math.round(installment).toLocaleString();

    // Check all conditions
    const failedReasons = [];
    
    if (loanAmount > member.max_amount) {
     failedReasons.push(
    `• Requested amount (KES ${loanAmount.toLocaleString()}) exceeds the maximum allowed for ${loanProduct} loan (KES ${parseFloat(member.max_amount).toLocaleString()})`
    );
   }

    if (loanAmount > maxLoanByDeposits) {
      failedReasons.push(
        `• Requested amount (KES ${loanAmount.toLocaleString()}) exceeds deposit limit of KES ${maxLoanByDeposits.toLocaleString()} (4× savings)`
      );
    }

    if (installment > maxMonthlyDeduction) {
      failedReasons.push(
        `• Installment (KES ${installmentFormatted}) exceeds 1/3 of basic salary (KES ${Math.round(maxMonthlyDeduction).toLocaleString()})`
      );
    }

    if (installment > netSalary) {
      failedReasons.push(
        `• Installment (KES ${installmentFormatted}) exceeds your net salary (KES ${netSalary.toLocaleString()})`
      );
    }
    if (repaymentMonths > member.max_period_months) {
    failedReasons.push(
    `• Repayment period (${repaymentMonths} months) exceeds the maximum allowed for ${loanProduct} (${member.max_period_months} months)`
   );
    }

    let reply;

    if (failedReasons.length === 0) {
      // ✅ Eligible
      reply =
        `Hi ${member.first_name} ✅ You qualify for a loan of KES ${loanAmount.toLocaleString()}!\n\n` +
        `• Monthly installment: KES ${installmentFormatted}\n` +
        `• Repayment period: ${repaymentMonths} months\n\n` +
        `You can proceed with your loan application. Visit the office or contact staff.`;
    } else {
      // ❌ Not eligible
      // Calculate suitable loan amount based on 1/3 rule
const suitableLoan = maxMonthlyDeduction *
  (Math.pow(1 + monthlyRate, n) - 1) /
  (monthlyRate * Math.pow(1 + monthlyRate, n));
// Suitable loan must not exceed product max amount OR deposit limit
const productMaxAmount = parseFloat(member.max_amount);
const suitableLoanCapped = Math.min(suitableLoan, productMaxAmount, maxLoanByDeposits);
const suitableLoanFormatted = Math.floor(suitableLoanCapped / 1000) * 1000;

reply =
  `Hi ${member.first_name} ❌ You do not qualify for KES ${loanAmount.toLocaleString()}.\n\n` +
  `Reasons:\n` +
  failedReasons.join('\n') +
  `\n\n💡 A more suitable loan amount would be KES ${suitableLoanFormatted.toLocaleString()}.\n\n` +
  `Please visit the office or speak to a staff member for further guidance.`;
    }

    saveChatLog(memberId, intentName, userMessage, reply);
    res.json({ fulfillmentText: reply });
  });
}

function calculateTopUp(memberId, res, intentName, userMessage, parameters) {
  const basicSalary = parameters.basic_salary;
  const netSalary = parameters.net_salary;
  const loanProduct = parameters.loan_product || 'Normal';
  const loanTypeId = getLoanTypeId(loanProduct);

  const requestedTopUp = Array.isArray(parameters.loan_amount)
    ? parameters.loan_amount[0]
    : parameters.loan_amount;

  const repaymentData = Array.isArray(parameters.repayment_period)
    ? parameters.repayment_period[0]
    : parameters.repayment_period;

  let repaymentMonths;
  if (repaymentData.unit === 'yr') {
    repaymentMonths = repaymentData.amount * 12;
  } else {
    repaymentMonths = repaymentData.amount;
  }

  if (!basicSalary || !netSalary || !requestedTopUp || !repaymentMonths) {
    const reply = "I'm missing some information. Please try again.";
    saveChatLog(memberId, intentName, userMessage, reply);
    return res.json({ fulfillmentText: reply });
  }

  const query = `
    SELECT m.first_name,
           s.savings_balance,
           l.outstanding_balance,
           l.principal_amount,
           l.repayment_period_months,
           lt.interest_rate,
           lt.max_amount,
           lt.max_period_months
    FROM members m
    LEFT JOIN savings s ON m.id = s.member_id
    LEFT JOIN loans l ON m.id = l.member_id AND l.status = 'active'
    LEFT JOIN loan_types lt ON lt.loan_type_id = ?
    WHERE m.id = ?
  `;

  db.query(query, [loanTypeId, memberId], (err, results) => {
    if (err || results.length === 0) {
      const reply = "I couldn't find your details. Please make sure you are logged in.";
      saveChatLog(memberId, intentName, userMessage, reply);
      return res.json({ fulfillmentText: reply });
    }

    const member = results[0];
    const savingsBalance = member.savings_balance || 0;
    const outstandingBalance = member.outstanding_balance || 0;
    const annualRate = member.interest_rate || 12;
    const monthlyRate = annualRate / 100 / 12;
    const n = repaymentMonths;
    const minimumRemainingSalary = 5000;
    const processingFeeRate = 0.01;

    // Check member has active loan
    if (outstandingBalance <= 0) {
      const reply = `Hi ${member.first_name}, you do not have an active loan. A top-up is only available for members with an existing loan. You may apply for a fresh loan instead.`;
      saveChatLog(memberId, intentName, userMessage, reply);
      return res.json({ fulfillmentText: reply });
    }

    // New loan = requested top-up + outstanding balance
const newLoan = parseFloat(requestedTopUp);
const processingFee = newLoan * processingFeeRate;
const takeHome = newLoan - outstandingBalance - processingFee;
const maxLoanByDeposits = savingsBalance * 4;
const productMaxAmount = parseFloat(member.max_amount);

    // Check all conditions
    const failedReasons = [];

    // Check 1: New loan vs deposit limit
    if (newLoan > maxLoanByDeposits) {
      failedReasons.push(
        `• New loan (KES ${newLoan.toLocaleString()}) exceeds deposit limit of KES ${maxLoanByDeposits.toLocaleString()} (4× savings of KES ${savingsBalance.toLocaleString()})`
      );
    }

    // Check 2: New loan vs product max amount
    if (newLoan > productMaxAmount) {
      failedReasons.push(
        `• New loan (KES ${newLoan.toLocaleString()}) exceeds maximum allowed for ${loanProduct} (KES ${productMaxAmount.toLocaleString()})`
      );
    }

    // Check 3: Repayment period vs product max period
    if (repaymentMonths > member.max_period_months) {
      failedReasons.push(
        `• Repayment period (${repaymentMonths} months) exceeds maximum allowed for ${loanProduct} (${member.max_period_months} months)`
      );
    }

    // Check 4: Take home must be positive
if (takeHome <= 0) {
  failedReasons.push(
    `• Requested top-up (KES ${newLoan.toLocaleString()}) is insufficient to cover your outstanding balance of KES ${outstandingBalance.toLocaleString()}. Take home would be negative.`
  );
}

    // Calculate monthly installment of new loan
    const installment = newLoan * (monthlyRate * Math.pow(1 + monthlyRate, n)) /
                        (Math.pow(1 + monthlyRate, n) - 1);
    const installmentFormatted = Math.round(installment).toLocaleString();

    // Check 5: 1/3 salary rule
    const maxDeduction = basicSalary / 3;
    if (installment > maxDeduction) {
      failedReasons.push(
        `• Installment (KES ${installmentFormatted}) exceeds 1/3 of basic salary (KES ${Math.round(maxDeduction).toLocaleString()})`
      );
    }

    // Check 6: Net salary check
    if (installment > netSalary) {
      failedReasons.push(
        `• Installment (KES ${installmentFormatted}) exceeds your net salary (KES ${netSalary.toLocaleString()})`
      );
    }

    // Check 7: Available salary after existing installment
    const existingRate = annualRate / 100 / 12;
    const existingN = member.repayment_period_months || 1;
    const existingP = member.principal_amount || 0;
    const existingInstallment = existingP > 0
      ? existingP * (existingRate * Math.pow(1 + existingRate, existingN)) /
        (Math.pow(1 + existingRate, existingN) - 1)
      : 0;

    const availableSalary = netSalary - existingInstallment;
    if (installment > availableSalary) {
      failedReasons.push(
        `• Installment (KES ${installmentFormatted}) exceeds available salary after existing deductions (KES ${Math.round(availableSalary).toLocaleString()})`
      );
    }

    // Check 8: Minimum remaining salary
    const remainingSalary = availableSalary - installment;
    if (remainingSalary < minimumRemainingSalary) {
      failedReasons.push(
        `• Remaining salary after deductions (KES ${Math.round(remainingSalary).toLocaleString()}) is below the minimum required (KES ${minimumRemainingSalary.toLocaleString()})`
      );
    }

    // Build response
    let reply;

    if (failedReasons.length > 0) {
      reply =
        `Hi ${member.first_name} ❌ Top-up declined.\n\n` +
        `Reasons:\n` +
        failedReasons.join('\n') +
        `\n\nPlease visit the office or speak to a staff member for further guidance.`;
    } else {
      reply =
  `Hi ${member.first_name} ✅ You qualify for a loan top-up!\n\n` +
  `• Top-up amount: KES ${newLoan.toLocaleString()}\n` +
  `• Outstanding balance deducted: KES ${outstandingBalance.toLocaleString()}\n` +
  `• Processing fee (1%): KES ${Math.round(processingFee).toLocaleString()}\n` +
  `• Take home amount: KES ${Math.round(takeHome).toLocaleString()}\n` +
  `• Monthly installment: KES ${installmentFormatted}\n` +
  `• Repayment period: ${repaymentMonths} months\n\n` +
  `You can proceed with your top-up application. Visit the office or contact staff.`;
    }

    saveChatLog(memberId, intentName, userMessage, reply);
    res.json({ fulfillmentText: reply });
  });
}
// ── Save chat log to database ──────────────────────────────
function saveChatLog(memberId, intentName, userMessage, botResponse) {
  // Only save if memberId is a valid number
  const id = parseInt(memberId);
  console.log('saveChatLog called - memberId:', memberId, 'parsed id:', id);
   if (!id || isNaN(id)) {
    console.log('Skipping save - invalid memberId'); 
    return;
  }

  const query = `
    INSERT INTO chat_logs (member_id, intent_name, user_message, bot_response)
    VALUES (?, ?, ?, ?)
  `;
  db.query(query, [id, intentName, userMessage, botResponse], (err) => {
    if (err) {
      console.error('Failed to save chat log:', err);
    } else {
      console.log('Chat log saved for member:', id);
    }
  });
}
module.exports = router;