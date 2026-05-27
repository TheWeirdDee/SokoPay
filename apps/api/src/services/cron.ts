import { prisma } from '../config/db';
import { transferCusdFromMerchant, getBalance } from './wallet';
import axios from 'axios';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

export function startCronDaemon() {
  console.log('[CRON DAEMON] Starting SokoPay scheduled payment check daemon...');
  
  // Check payments immediately on startup
  checkPendingPayments();
  
  // Run autonomous alerts check on startup
  checkAutonomousAlerts();

  // Run daily and weekly reports check on startup
  checkDailyAndWeeklyReports();

  // Run check every 60 seconds for scheduled payments
  setInterval(checkPendingPayments, 60000);

  // Run alerts and reports check every 5 minutes (300000 ms)
  setInterval(() => {
    checkAutonomousAlerts();
    checkDailyAndWeeklyReports();
  }, 300000);
}

/**
 * Scheduled payments processor
 */
async function checkPendingPayments() {
  const now = new Date();
  
  try {
    const pendingPayments = await prisma.scheduledPayment.findMany({
      where: {
        executed: false,
        scheduledAt: {
          lte: now
        }
      },
      include: {
        merchant: true
      }
    });

    if (pendingPayments.length === 0) return;

    console.log(`[CRON DAEMON] Found ${pendingPayments.length} pending scheduled payments to process at ${now.toISOString()}`);

    for (const payment of pendingPayments) {
      try {
        let recipientWallet = payment.recipientAddress;
        
        // Resolve recipient wallet if address is not explicitly set (e.g. they provided a merchant ID or phone number)
        if (!recipientWallet) {
          const targetMerchant = await prisma.merchant.findFirst({
            where: {
              OR: [
                { id: payment.recipient },
                { phone: payment.recipient }
              ]
            }
          });
          
          if (targetMerchant) {
            recipientWallet = targetMerchant.walletAddress;
          }
        }

        if (!recipientWallet) {
          throw new Error(`Could not resolve wallet address for recipient: ${payment.recipient}`);
        }

        console.log(`[CRON DAEMON] Executing payment ${payment.id}: ${payment.amountCusd} cUSD from merchant ${payment.merchantId} to ${recipientWallet}`);

        // Perform on-chain transfer
        const txHash = await transferCusdFromMerchant(
          payment.merchant.encryptedPrivateKey,
          recipientWallet,
          payment.amountCusd.toFixed(6)
        );

        // Record transaction in history
        await prisma.transaction.create({
          data: {
            merchantId: payment.merchantId,
            type: 'outgoing',
            direction: 'out',
            amountCusd: payment.amountCusd,
            txHash,
            method: 'x402',
            status: 'confirmed',
            counterpart: payment.recipient,
            notes: `Scheduled Payment: ${payment.description || 'N/A'}`
          }
        });

        // Set execution statuses and handle recurrence rollover
        if (payment.recurrence) {
          // Calculate next execution date
          const nextDate = new Date(payment.scheduledAt);
          if (payment.recurrence === 'daily') {
            nextDate.setDate(nextDate.getDate() + 1);
          } else if (payment.recurrence === 'weekly') {
            nextDate.setDate(nextDate.getDate() + 7);
          } else if (payment.recurrence === 'monthly') {
            nextDate.setMonth(nextDate.getMonth() + 1);
          }

          // Create the next rollover scheduled payment entry
          await prisma.scheduledPayment.create({
            data: {
              merchantId: payment.merchantId,
              recipient: payment.recipient,
              recipientAddress: payment.recipientAddress,
              amountCusd: payment.amountCusd,
              description: payment.description,
              scheduledAt: nextDate,
              recurrence: payment.recurrence
            }
          });

          console.log(`[CRON DAEMON] Rolled over recurring payment. Next schedule date: ${nextDate.toISOString()}`);
        }

        // Mark current payment as executed
        await prisma.scheduledPayment.update({
          where: { id: payment.id },
          data: {
            executed: true,
            txHash
          }
        });

        // Create user in-app notification
        await prisma.notification.create({
          data: {
            merchantId: payment.merchantId,
            type: 'payout',
            title: 'Scheduled Payment Executed',
            body: `Successfully sent ${payment.amountCusd} cUSD to ${payment.recipient}.`
          }
        });

      } catch (err: any) {
        console.error(`[CRON DAEMON] Failed to execute scheduled payment ${payment.id}:`, err);
        
        // Push notification of failure to user
        await prisma.notification.create({
          data: {
            merchantId: payment.merchantId,
            type: 'alert',
            title: 'Scheduled Payment Failed',
            body: `Scheduled payment to ${payment.recipient} failed: ${err.message || 'Unknown error'}`
          }
        });
      }
    }
  } catch (error) {
    console.error('[CRON DAEMON] Error running scheduled checks:', error);
  }
}

/**
 * Autonomous Alerts System
 * Low balances & overdue invoices
 */
async function checkAutonomousAlerts() {
  console.log('[CRON DAEMON] Running autonomous alerts check...');
  try {
    const merchants = await prisma.merchant.findMany();
    
    for (const merchant of merchants) {
      // 1. Low Wallet Balance Alert
      const balance = await getBalance(merchant.walletAddress);
      const cusdVal = parseFloat(balance.cusd);
      const threshold = merchant.lowBalanceThreshold || 5.0;

      if (cusdVal < threshold) {
        // Check if low balance alert was created in the last 24 hours (to prevent spamming)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const existingAlert = await prisma.notification.findFirst({
          where: {
            merchantId: merchant.id,
            type: 'low_balance_alert',
            createdAt: {
              gte: yesterday
            }
          }
        });

        if (!existingAlert) {
          await prisma.notification.create({
            data: {
              merchantId: merchant.id,
              type: 'low_balance_alert',
              title: 'Low Wallet Balance Alert',
              body: `Your SokoPay wallet balance is low: ${cusdVal.toFixed(2)} cUSD (Threshold is ${threshold} cUSD). Please top up to ensure scheduled payouts continue to execute successfully.`
            }
          });
          console.log(`[CRON DAEMON] Low balance alert created for merchant ${merchant.id}`);
        }
      }

      // 2. Overdue Invoice Alert (Invoice/PaymentRequest pending and past due date by 3+ days)
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const overdueInvoices = await prisma.paymentRequest.findMany({
        where: {
          merchantId: merchant.id,
          status: 'pending',
          dueDate: {
            lte: threeDaysAgo
          }
        }
      });

      for (const invoice of overdueInvoices) {
        // Check if notification already exists for this specific invoice ID to prevent duplicate alert creation
        const searchPattern = `Invoice #${invoice.id}`;
        const existingAlert = await prisma.notification.findFirst({
          where: {
            merchantId: merchant.id,
            type: 'overdue_invoice_alert',
            body: {
              contains: searchPattern
            }
          }
        });

        if (!existingAlert) {
          const formattedAmount = invoice.amountLocal.toLocaleString('en-US', { minimumFractionDigits: 2 });
          await prisma.notification.create({
            data: {
              merchantId: merchant.id,
              type: 'overdue_invoice_alert',
              title: 'Overdue Invoice Warning',
              body: `Invoice #${invoice.id} issued to "${invoice.customerName || 'Customer'}" for ${invoice.currencyLocal} ${formattedAmount} is overdue by 3+ days (Due date: ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A'}). Tap to follow up.`
            }
          });
          console.log(`[CRON DAEMON] Overdue invoice alert created for merchant ${merchant.id}, Invoice ${invoice.id}`);
        }
      }
    }
  } catch (error) {
    console.error('[CRON DAEMON] Error running autonomous alerts check:', error);
  }
}

/**
 * Daily & Weekly Summaries
 */
async function checkDailyAndWeeklyReports() {
  const now = new Date();
  const currentHour = now.getHours();

  console.log(`[CRON DAEMON] Running daily/weekly report check (Current local hour: ${currentHour})...`);

  // 1. Daily Summary (runs if time is between 8:00 AM and 11:59 PM local)
  if (currentHour >= 8) {
    try {
      const merchants = await prisma.merchant.findMany();
      for (const merchant of merchants) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // Check if daily report already exists for today
        const existingReport = await prisma.notification.findFirst({
          where: {
            merchantId: merchant.id,
            type: 'daily_report',
            createdAt: {
              gte: todayStart
            }
          }
        });

        if (!existingReport) {
          console.log(`[CRON DAEMON] Compiling daily report for merchant ${merchant.businessName}...`);
          
          // Fetch transactions from the last 24 hours
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);

          const txs = await prisma.transaction.findMany({
            where: {
              merchantId: merchant.id,
              createdAt: {
                gte: yesterday
              }
            }
          });

          let inflow = 0;
          let outflow = 0;
          let cashSales = 0;
          const currency = merchant.country === 'KE' ? 'KES' : 'NGN';

          for (const tx of txs) {
            const amount = tx.amountLocal || 0;
            if (tx.type === 'cash') {
              cashSales += amount;
            } else if (tx.direction === 'in') {
              inflow += amount;
            } else if (tx.direction === 'out') {
              outflow += amount;
            }
          }

          const summary = await generateReportWithGemini(
            merchant.businessName,
            merchant.country,
            'daily',
            inflow,
            outflow,
            cashSales,
            currency
          );

          await prisma.notification.create({
            data: {
              merchantId: merchant.id,
              type: 'daily_report',
              title: 'Daily Business Summary',
              body: summary
            }
          });

          console.log(`[CRON DAEMON] Daily report notification created for merchant ${merchant.id}`);
        }
      }
    } catch (err) {
      console.error('[CRON DAEMON] Failed to compile daily reports:', err);
    }
  }

  // 2. Weekly Report (runs on Sunday if time is between 9:00 AM and 11:59 PM local)
  const isSunday = now.getDay() === 0;
  if (isSunday && currentHour >= 9) {
    try {
      const merchants = await prisma.merchant.findMany();
      for (const merchant of merchants) {
        // Check if weekly report was sent in the last 6 days
        const sixDaysAgo = new Date();
        sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);

        const existingReport = await prisma.notification.findFirst({
          where: {
            merchantId: merchant.id,
            type: 'weekly_report',
            createdAt: {
              gte: sixDaysAgo
            }
          }
        });

        if (!existingReport) {
          console.log(`[CRON DAEMON] Compiling weekly report for merchant ${merchant.businessName}...`);
          
          // Fetch transactions from the last 7 days
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

          const txs = await prisma.transaction.findMany({
            where: {
              merchantId: merchant.id,
              createdAt: {
                gte: sevenDaysAgo
              }
            }
          });

          let inflow = 0;
          let outflow = 0;
          let cashSales = 0;
          const currency = merchant.country === 'KE' ? 'KES' : 'NGN';

          for (const tx of txs) {
            const amount = tx.amountLocal || 0;
            if (tx.type === 'cash') {
              cashSales += amount;
            } else if (tx.direction === 'in') {
              inflow += amount;
            } else if (tx.direction === 'out') {
              outflow += amount;
            }
          }

          const summary = await generateReportWithGemini(
            merchant.businessName,
            merchant.country,
            'weekly',
            inflow,
            outflow,
            cashSales,
            currency
          );

          await prisma.notification.create({
            data: {
              merchantId: merchant.id,
              type: 'weekly_report',
              title: 'Weekly Performance Report',
              body: summary
            }
          });

          console.log(`[CRON DAEMON] Weekly report notification created for merchant ${merchant.id}`);
        }
      }
    } catch (err) {
      console.error('[CRON DAEMON] Failed to compile weekly reports:', err);
    }
  }
}

/**
 * Gemini report compiler helper
 */
async function generateReportWithGemini(
  businessName: string,
  country: string,
  type: 'daily' | 'weekly',
  inflow: number,
  outflow: number,
  cashSales: number,
  currency: string
): Promise<string> {
  const isNigeria = country === 'NG';
  const languagePrompt = isNigeria 
    ? "Write in standard Nigerian Pidgin English (e.g. 'How body? You do well today...'). Make it sound like a friendly, encouraging local financial agent."
    : "Write in a mix of Swahili and English (e.g. 'Mambo! Habari ya leo...'). Make it sound like a friendly, encouraging local financial agent.";

  const systemInstruction = `You are SokoPay AI Financial Agent, a smart, friendly, and extremely helpful back-office financial assistant built for market merchants and shop owners in Africa.
Your task is to write a brief business performance summary.
Guidelines:
1. Speak concisely. Keep the summary under 3 sentences.
2. Use the language/dialect style requested: ${languagePrompt}.
3. Reference the exact numbers provided.
4. Be encouraging and end with a positive word of motivation for tomorrow/next week.`;

  const userPrompt = `Generate a ${type} report for my business "${businessName}".
Here are the stats:
- Total Inflows: ${inflow.toFixed(2)} ${currency}
- Total Outflows: ${outflow.toFixed(2)} ${currency}
- Cash Sales Logged: ${cashSales.toFixed(2)} ${currency}
`;

  try {
    const response = await axios.post(
      `${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }]
          }
        ],
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        }
      },
      { timeout: 8000 }
    );

    const candidate = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (candidate) {
      return candidate.trim();
    }
  } catch (error: any) {
    console.error(`Error calling Gemini for ${type} report:`, error.message);
  }

  // Fallback if Gemini fails
  if (isNigeria) {
    return `Daily Report for ${businessName}: You get total inflow of ${currency} ${inflow.toFixed(2)}, total outflow of ${currency} ${outflow.toFixed(2)}, and cash sales of ${currency} ${cashSales.toFixed(2)}. Make we push harder tomorrow!`;
  } else {
    return `Daily Report for ${businessName}: Total inflow is ${currency} ${inflow.toFixed(2)}, total outflow is ${currency} ${outflow.toFixed(2)}, and cash sales of ${currency} ${cashSales.toFixed(2)}. Kazi njema!`;
  }
}
