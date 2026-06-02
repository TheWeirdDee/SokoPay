import { supabase } from '../config/supabase';
import { transferCusdFromMerchant, getBalance, decryptPrivateKey } from './wallet';
import axios from 'axios';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

export function startCronDaemon() {
  console.log('[CRON DAEMON] Starting SokoPay scheduled payment check daemon...');
  
  checkPendingPayments();
  checkAutonomousAlerts();
  checkDailyAndWeeklyReports();

  setInterval(checkPendingPayments, 60000);

  setInterval(() => {
    checkAutonomousAlerts();
    checkDailyAndWeeklyReports();
  }, 300000);
}

async function checkPendingPayments() {
  const now = new Date();
  
  try {
    const { data: pendingPayments, error } = await supabase.from('ScheduledPayment')
      .select('*')
      .eq('executed', false)
      .lte('scheduledAt', now.toISOString());

    if (error || !pendingPayments || pendingPayments.length === 0) return;

    console.log(`[CRON DAEMON] Found ${pendingPayments.length} pending scheduled payments to process at ${now.toISOString()}`);

    for (const payment of pendingPayments) {
      try {
        const { data: merchant } = await supabase.from('Merchant').select('*').eq('id', payment.merchantId).single();
        if (!merchant) throw new Error(`Merchant not found for payment ${payment.id}`);
        payment.merchant = merchant;

        let recipientWallet = payment.recipientAddress;
        
        if (!recipientWallet) {
          const { data: targetMerchant } = await supabase.from('Merchant')
            .select('*')
            .or(`id.eq.${payment.recipient},phone.eq.${payment.recipient}`)
            .limit(1)
            .maybeSingle();
          
          if (targetMerchant) {
            recipientWallet = targetMerchant.walletAddress;
          }
        }

        if (!recipientWallet) {
          throw new Error(`Could not resolve wallet address for recipient: ${payment.recipient}`);
        }

        console.log(`[CRON DAEMON] Executing payment ${payment.id}: ${payment.amountCusd} cUSD from merchant ${payment.merchantId} to ${recipientWallet}`);

        const decryptedKey = decryptPrivateKey(payment.merchant.encryptedPrivateKey);
        const txHash = await transferCusdFromMerchant(
          decryptedKey,
          recipientWallet,
          payment.amountCusd.toFixed(6)
        );

        await supabase.from('Transaction').insert({
          merchantId: payment.merchantId,
          type: 'outgoing',
          direction: 'out',
          amountCusd: payment.amountCusd,
          txHash,
          method: 'x402',
          status: 'confirmed',
          counterpart: payment.recipient,
          notes: `Scheduled Payment: ${payment.description || 'N/A'}`
        });

        if (payment.recurrence) {
          const nextDate = new Date(payment.scheduledAt);
          if (payment.recurrence === 'daily') {
            nextDate.setDate(nextDate.getDate() + 1);
          } else if (payment.recurrence === 'weekly') {
            nextDate.setDate(nextDate.getDate() + 7);
          } else if (payment.recurrence === 'monthly') {
            nextDate.setMonth(nextDate.getMonth() + 1);
          }

          await supabase.from('ScheduledPayment').insert({
            merchantId: payment.merchantId,
            recipient: payment.recipient,
            recipientAddress: payment.recipientAddress,
            amountCusd: payment.amountCusd,
            description: payment.description,
            scheduledAt: nextDate.toISOString(),
            recurrence: payment.recurrence
          });

          console.log(`[CRON DAEMON] Rolled over recurring payment. Next schedule date: ${nextDate.toISOString()}`);
        }

        await supabase.from('ScheduledPayment').update({
          executed: true,
          txHash
        }).eq('id', payment.id);

        await supabase.from('Notification').insert({
          merchantId: payment.merchantId,
          type: 'payout',
          title: 'Scheduled Payment Executed',
          body: `Successfully sent ${payment.amountCusd} cUSD to ${payment.recipient}.`
        });

      } catch (err: any) {
        console.error(`[CRON DAEMON] Failed to execute scheduled payment ${payment.id}:`, err);
        
        await supabase.from('Notification').insert({
          merchantId: payment.merchantId,
          type: 'alert',
          title: 'Scheduled Payment Failed',
          body: `Scheduled payment to ${payment.recipient} failed: ${err.message || 'Unknown error'}`
        });
      }
    }
  } catch (error) {
    console.error('[CRON DAEMON] Error running scheduled checks:', error);
  }
}

async function checkAutonomousAlerts() {
  console.log('[CRON DAEMON] Running autonomous alerts check...');
  try {
    const { data: merchants } = await supabase.from('Merchant').select('*');
    if (!merchants) return;
    
    for (const merchant of merchants) {
      const balance = await getBalance(merchant.walletAddress);
      const cusdVal = parseFloat(balance.cusd);
      const threshold = merchant.lowBalanceThreshold || 5.0;

      if (cusdVal < threshold) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const { data: existingAlert } = await supabase.from('Notification')
          .select('*')
          .eq('merchantId', merchant.id)
          .eq('type', 'low_balance_alert')
          .gte('createdAt', yesterday.toISOString())
          .limit(1)
          .maybeSingle();

        if (!existingAlert) {
          await supabase.from('Notification').insert({
            merchantId: merchant.id,
            type: 'low_balance_alert',
            title: 'Low Wallet Balance Alert',
            body: `Your SokoPay wallet balance is low: ${cusdVal.toFixed(2)} cUSD (Threshold is ${threshold} cUSD). Please top up to ensure scheduled payouts continue to execute successfully.`
          });
          console.log(`[CRON DAEMON] Low balance alert created for merchant ${merchant.id}`);
        }
      }

      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const { data: overdueInvoices } = await supabase.from('PaymentRequest')
        .select('*')
        .eq('merchantId', merchant.id)
        .eq('status', 'pending')
        .lte('dueDate', threeDaysAgo.toISOString());

      if (overdueInvoices) {
        for (const invoice of overdueInvoices) {
          const searchPattern = `Invoice #${invoice.id}`;
          const { data: existingAlert } = await supabase.from('Notification')
            .select('*')
            .eq('merchantId', merchant.id)
            .eq('type', 'overdue_invoice_alert')
            .ilike('body', `%${searchPattern}%`)
            .limit(1)
            .maybeSingle();

          if (!existingAlert) {
            const formattedAmount = invoice.amountLocal.toLocaleString('en-US', { minimumFractionDigits: 2 });
            await supabase.from('Notification').insert({
              merchantId: merchant.id,
              type: 'overdue_invoice_alert',
              title: 'Overdue Invoice Warning',
              body: `Invoice #${invoice.id} issued to "${invoice.customerName || 'Customer'}" for ${invoice.currencyLocal} ${formattedAmount} is overdue by 3+ days (Due date: ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A'}). Tap to follow up.`
            });
            console.log(`[CRON DAEMON] Overdue invoice alert created for merchant ${merchant.id}, Invoice ${invoice.id}`);
          }
        }
      }
    }
  } catch (error) {
    console.error('[CRON DAEMON] Error running autonomous alerts check:', error);
  }
}

async function checkDailyAndWeeklyReports() {
  const now = new Date();
  const currentHour = now.getHours();

  console.log(`[CRON DAEMON] Running daily/weekly report check (Current local hour: ${currentHour})...`);

  if (currentHour >= 8) {
    try {
      const { data: merchants } = await supabase.from('Merchant').select('*');
      if (merchants) {
        for (const merchant of merchants) {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);

          const { data: existingReport } = await supabase.from('Notification')
            .select('*')
            .eq('merchantId', merchant.id)
            .eq('type', 'daily_report')
            .gte('createdAt', todayStart.toISOString())
            .limit(1)
            .maybeSingle();

          if (!existingReport) {
            console.log(`[CRON DAEMON] Compiling daily report for merchant ${merchant.businessName}...`);
            
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            const { data: txs } = await supabase.from('Transaction')
              .select('*')
              .eq('merchantId', merchant.id)
              .gte('createdAt', yesterday.toISOString());

            let inflow = 0;
            let outflow = 0;
            let cashSales = 0;
            const currency = merchant.country === 'KE' ? 'KES' : 'NGN';

            if (txs) {
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

            await supabase.from('Notification').insert({
              merchantId: merchant.id,
              type: 'daily_report',
              title: 'Daily Business Summary',
              body: summary
            });

            console.log(`[CRON DAEMON] Daily report notification created for merchant ${merchant.id}`);
          }
        }
      }
    } catch (err) {
      console.error('[CRON DAEMON] Failed to compile daily reports:', err);
    }
  }

  const isSunday = now.getDay() === 0;
  if (isSunday && currentHour >= 9) {
    try {
      const { data: merchants } = await supabase.from('Merchant').select('*');
      if (merchants) {
        for (const merchant of merchants) {
          const sixDaysAgo = new Date();
          sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);

          const { data: existingReport } = await supabase.from('Notification')
            .select('*')
            .eq('merchantId', merchant.id)
            .eq('type', 'weekly_report')
            .gte('createdAt', sixDaysAgo.toISOString())
            .limit(1)
            .maybeSingle();

          if (!existingReport) {
            console.log(`[CRON DAEMON] Compiling weekly report for merchant ${merchant.businessName}...`);
            
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const { data: txs } = await supabase.from('Transaction')
              .select('*')
              .eq('merchantId', merchant.id)
              .gte('createdAt', sevenDaysAgo.toISOString());

            let inflow = 0;
            let outflow = 0;
            let cashSales = 0;
            const currency = merchant.country === 'KE' ? 'KES' : 'NGN';

            if (txs) {
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

            await supabase.from('Notification').insert({
              merchantId: merchant.id,
              type: 'weekly_report',
              title: 'Weekly Performance Report',
              body: summary
            });

            console.log(`[CRON DAEMON] Weekly report notification created for merchant ${merchant.id}`);
          }
        }
      }
    } catch (err) {
      console.error('[CRON DAEMON] Failed to compile weekly reports:', err);
    }
  }
}

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

  if (isNigeria) {
    return `Daily Report for ${businessName}: You get total inflow of ${currency} ${inflow.toFixed(2)}, total outflow of ${currency} ${outflow.toFixed(2)}, and cash sales of ${currency} ${cashSales.toFixed(2)}. Make we push harder tomorrow!`;
  } else {
    return `Daily Report for ${businessName}: Total inflow is ${currency} ${inflow.toFixed(2)}, total outflow is ${currency} ${outflow.toFixed(2)}, and cash sales of ${currency} ${cashSales.toFixed(2)}. Kazi njema!`;
  }
}
