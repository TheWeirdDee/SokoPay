import { Router, Response } from 'express';
import axios from 'axios';
import { prisma } from '../config/db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getBalance } from '../services/wallet';
import { getCachedRate } from '../services/muon';

const router = Router();

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

// Helper to construct Gemini system instructions and call the model
async function generateAgentCompletion(merchantId: string, userMessage: string, historyOffset = 15): Promise<string> {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId }
  });

  if (!merchant) {
    throw new Error('Merchant not found');
  }

  // Gather live financial context
  const balance = await getBalance(merchant.walletAddress);
  const currency = merchant.country === 'KE' ? 'KES' : 'NGN';
  const rateData = await getCachedRate(currency);
  const rate = rateData.rate;

  // Calculate today's earnings
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayTransactions = await prisma.transaction.findMany({
    where: {
      merchantId,
      direction: 'in',
      createdAt: { gte: todayStart }
    }
  });

  let todayEarningsLocal = 0;
  for (const tx of todayTransactions) {
    todayEarningsLocal += tx.amountLocal || 0;
  }
  const todayEarningsCusd = todayEarningsLocal / rate;

  // Fetch recent 5 transactions
  const recentTransactions = await prisma.transaction.findMany({
    where: { merchantId },
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  const txSummary = recentTransactions.map(tx => (
    `- Type: ${tx.type}, Method: ${tx.method}, Direction: ${tx.direction}, Amount: ${tx.amountLocal} ${tx.currencyLocal} (${tx.amountCusd} cUSD), Status: ${tx.status}, Date: ${tx.createdAt.toISOString()}`
  )).join('\n');

  // Build the system prompt
  const systemInstruction = `You are SokoPay AI Financial Agent, a smart, friendly, and extremely helpful back-office financial assistant built for market merchants and shop owners in Africa.
You communicate in standard English, Nigerian Pidgin English (e.g. "How body? You make NGN 5,000 today."), and Swahili depending on the dialect or language the merchant uses. Always respond using the same language/dialect as the merchant. If they speak Pidgin, speak Pidgin back. If they speak Swahili, speak Swahili.

Here is the LIVE context of the merchant you are serving:
- Merchant Name: ${merchant.businessName}
- Country Code: ${merchant.country}
- Wallet Address: ${merchant.walletAddress}
- Current Balances:
  * cUSD (stablecoin): ${balance.cusd} cUSD
  * CELO: ${balance.celo} CELO
  * Estimated Local Valuation: ${(Number(balance.cusd) * rate).toFixed(2)} ${currency}
- Today's Sales Earnings: ${todayEarningsLocal.toFixed(2)} ${currency} (${todayEarningsCusd.toFixed(2)} cUSD)
- Active Muon Network FX Rate: 1 cUSD = ${rate.toFixed(2)} ${currency}
- Recent Transactions:
${txSummary || 'No recent transactions recorded.'}

Guidelines:
1. Speak concisely and directly. Merchants are busy running shops and stalls.
2. NEVER make up or hallucinate financial details. Use the exact numbers provided in this prompt.
3. Keep responses conversational and under 4-5 sentences unless explaining something detailed.
4. If the merchant asks to pay someone or transfer funds:
   - If they specify the name, amount, and recipient wallet address (which must be a valid Celo address starting with 0x), explain that you will trigger a transfer approval card for them and append the payment approval tag at the VERY end of your message.
   - Format: [PAYMENT_APPROVAL] { "recipientAddress": "0x...", "recipientName": "Name", "amountCusd": X, "notes": "..." }
   - If they did not provide a Celo address, ask them to provide the address (e.g., "Please send the recipient's wallet address so I can generate the payment card for you").
5. If the merchant asks to withdraw money:
   - Ask them how much they want to withdraw (if they did not specify) and resolve whether they want to withdraw to their default linked account.
   - Once the amount is known, explain that you will trigger the withdrawal preview card for them and append the withdrawal approval tag at the VERY end of your message.
   - Format: [WITHDRAW_APPROVAL] { "amountCusd": X, "accountType": "bank" }
6. If the merchant tells you about an offline sale (e.g. "I just sell yam for 2000"), tell them they can log it instantly by tapping "Record Cash" on their dashboard, or answer their questions about sales.`;

  // Fetch conversation history
  const dbHistory = await prisma.conversation.findMany({
    where: { merchantId },
    orderBy: { createdAt: 'asc' },
    take: historyOffset
  });

  // Map history to Gemini payload
  const contents = dbHistory.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  // Append new message
  contents.push({
    role: 'user',
    parts: [{ text: userMessage }]
  });

  const response = await axios.post(
    `${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
    {
      contents,
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      }
    }
  );

  const candidate = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!candidate) {
    throw new Error('Gemini API returned an empty response');
  }

  return candidate.trim();
}

// GET /agent/history - Get chat log
router.get('/history', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    }

    const history = await prisma.conversation.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'asc' }
    });

    res.json({
      success: true,
      history
    });
  } catch (error: any) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch history' });
  }
});

// POST /agent/message - Send chat message
router.post('/message', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    }

    const { message } = req.body;
    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message content is required' });
    }

    // Save user message to database
    await prisma.conversation.create({
      data: {
        merchantId,
        role: 'user',
        content: message.trim(),
        wasVoice: false
      }
    });

    // Generate completion
    const agentReply = await generateAgentCompletion(merchantId, message.trim());

    // Save assistant reply
    await prisma.conversation.create({
      data: {
        merchantId,
        role: 'assistant',
        content: agentReply
      }
    });

    res.json({
      success: true,
      reply: agentReply
    });

  } catch (error: any) {
    console.error('Error in agent message handler:', error);
    res.status(500).json({ error: error.message || 'AI completions failed' });
  }
});

// POST /agent/voice - Handle voice recording uploads, transcribe & respond
router.post('/voice', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) {
      return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });
    }

    const { audio } = req.body; // Base64 data
    if (!audio) {
      return res.status(400).json({ error: 'Audio data is required' });
    }

    // Parse base64 and mime type
    let mimeType = 'audio/webm';
    let base64Data = audio;
    if (audio.startsWith('data:')) {
      const parts = audio.split(';base64,');
      mimeType = parts[0].split(':')[1];
      base64Data = parts[1];
    }

    // Call Gemini multimodal to transcribe audio
    console.log(`[AGENT VOICE] Transcribing base64 audio with mime type: ${mimeType}`);
    const transcriptionRes = await axios.post(
      `${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Data
                }
              },
              {
                text: 'Transcribe the spoken audio in this file. Output ONLY the plain transcription text. Do not add any greeting, comments, explanations, formatting, or quotes.'
              }
            ]
          }
        ]
      }
    );

    const transcript = transcriptionRes.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!transcript) {
      return res.status(400).json({ error: 'Could not transcribe voice note. Please speak clearly.' });
    }

    console.log(`[AGENT VOICE] Transcript: "${transcript}"`);

    // Save user voice message transcript
    await prisma.conversation.create({
      data: {
        merchantId,
        role: 'user',
        content: transcript,
        wasVoice: true
      }
    });

    // Generate response using transcript
    const agentReply = await generateAgentCompletion(merchantId, transcript);

    // Save assistant reply
    await prisma.conversation.create({
      data: {
        merchantId,
        role: 'assistant',
        content: agentReply
      }
    });

    res.json({
      success: true,
      transcript,
      reply: agentReply
    });

  } catch (error: any) {
    console.error('Error in agent voice handler:', error);
    res.status(500).json({ error: error.message || 'Voice transcription/AI processing failed' });
  }
});

export { router as agentRouter };
