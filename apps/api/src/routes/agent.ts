import { Router, Response } from 'express';
import axios from 'axios';
import { supabase } from '../config/supabase';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getBalance } from '../services/wallet';
import { getCachedRate } from '../services/muon';
import { randomUUID } from 'crypto';

const router = Router();

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

async function generateAgentCompletion(merchantId: string, userMessage: string, historyOffset = 15): Promise<string> {
  const { data: merchant, error } = await supabase.from('Merchant').select('*').eq('id', merchantId).single();
  if (error || !merchant) {
    throw new Error('Merchant not found');
  }

  const balance = await getBalance(merchant.walletAddress);
  const currency = merchant.country === 'KE' ? 'KES' : 'NGN';
  const rateData = await getCachedRate(currency);
  const rate = rateData.rate;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: todayTransactions } = await supabase.from('Transaction')
    .select('amountLocal')
    .eq('merchantId', merchantId)
    .eq('direction', 'in')
    .gte('createdAt', todayStart.toISOString());

  let todayEarningsLocal = 0;
  if (todayTransactions) {
    for (const tx of todayTransactions) {
      todayEarningsLocal += tx.amountLocal || 0;
    }
  }
  const todayEarningsCusd = todayEarningsLocal / rate;

  const { data: recentTransactions } = await supabase.from('Transaction')
    .select('*')
    .eq('merchantId', merchantId)
    .order('createdAt', { ascending: false })
    .limit(5);

  const txSummary = (recentTransactions || []).map(tx => (
    `- Type: ${tx.type}, Method: ${tx.method}, Direction: ${tx.direction}, Amount: ${tx.amountLocal} ${tx.currencyLocal} (${tx.amountCusd} cUSD), Status: ${tx.status}, Date: ${tx.createdAt}`
  )).join('\n');

  const systemInstruction = `You are SokoPay AI Financial Agent, a smart, friendly, and extremely helpful back-office financial assistant built for market merchants and shop owners in Africa.
LANGUAGE RULE — CRITICAL:
Detect the language of the CURRENT message only. Ignore what language was used in previous messages.
If this message is in English → respond in English.
If this message is in Yoruba → respond in Yoruba (mixed with English naturally).
If this message is in Igbo → respond in Igbo (mixed with English naturally, e.g. "Nna, balance bụ 0.87 cUSD. Ọ dị mma!").
If this message is in Pidgin → respond in Pidgin (e.g. "How body? You make NGN 5,000 today.").
If this message is in Hausa → respond in Hausa (mixed with English, e.g. "Sannu, balance ɗinka shine 0.87 cUSD").
If this message is in Swahili → respond in Swahili (mixed with English, e.g. "Habari, balance yako ni 0.87 cUSD").
If this message is in Kikuyu, Luo, or any other language → warm attempt mixing their language with English.
Do NOT carry language preference from previous messages. Each message is independent for language detection.
Default to English if the language of the current message is unclear.
NEVER say you cannot speak a language. NEVER admit language limits. A warm attempt is always better than refusing.

Here is the LIVE context of the merchant you are serving:
- Merchant Name: ${merchant.businessName}
- Country Code: ${merchant.country}
- Wallet Address: ${merchant.walletAddress}
- Current Balance: ${balance.cusd} cUSD (≈ ${(Number(balance.cusd) * rate).toFixed(2)} ${currency})
- Today's Sales Earnings: ${todayEarningsLocal.toFixed(2)} ${currency} (${todayEarningsCusd.toFixed(2)} cUSD)
- Active Muon Network FX Rate: 1 cUSD = ${rate.toFixed(2)} ${currency}
- Recent Transactions:
${txSummary || 'No recent transactions recorded.'}

Guidelines:
1. Speak concisely and directly. Merchants are busy running shops and stalls.
2. NEVER make up or hallucinate financial details. Use the exact numbers provided in this prompt.
3. Keep responses conversational and under 4-5 sentences unless explaining something detailed.
3a. NEVER use markdown formatting — no asterisks, no bold (**text**), no italics, no bullet points with -, no headers with #. Write plain conversational text only. Wrong: **0.87 cUSD** Correct: 0.87 cUSD.
3b. NEVER mention CELO balance. Merchants only care about cUSD and local currency. CELO is only an internal gas token, never visible to merchants.
4. If the merchant asks to pay someone or transfer funds:
   - If they specify the name, amount, and recipient wallet address (which must be a valid Celo address starting with 0x), explain that you will trigger a transfer approval card for them and append the payment approval tag at the VERY end of your message.
   - Format: [PAYMENT_APPROVAL] { "recipientAddress": "0x...", "recipientName": "Name", "amountCusd": X, "notes": "..." }
   - If they did not provide a Celo address, ask them to provide the address (e.g., "Please send the recipient's wallet address so I can generate the payment card for you").
5. If the merchant asks to withdraw money:
   - Ask them how much they want to withdraw (if they did not specify) and resolve whether they want to withdraw to their default linked account.
   - Once the amount is known, explain that you will trigger the withdrawal preview card for them and append the withdrawal approval tag at the VERY end of your message.
   - Format: [WITHDRAW_APPROVAL] { "amountCusd": X, "accountType": "bank" }
6. If the merchant tells you about an offline sale (e.g. "I just sell yam for 2000"), tell them they can log it instantly by tapping "Record Cash" on their dashboard, or answer their questions about sales.`;

  const { data: dbHistory } = await supabase.from('Conversation')
    .select('*')
    .eq('merchantId', merchantId)
    .order('createdAt', { ascending: true })
    .limit(historyOffset);

  const contents = (dbHistory || []).map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

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

router.get('/history', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });

    console.log(`[HISTORY] Fetching conversation for merchantId: ${merchantId}`);

    const { data: history, error } = await supabase.from('Conversation')
      .select('*')
      .eq('merchantId', merchantId)
      .order('createdAt', { ascending: true });

    if (error) {
      console.error('[HISTORY] Supabase error:', error.message);
      throw error;
    }

    console.log(`[HISTORY] Returning ${history?.length ?? 0} messages for merchant ${merchantId}`);

    const normalized = (history || []).map(msg => ({
      ...msg,
      wasVoice: msg.wasVoice ?? false,
    }));

    res.json({ success: true, history: normalized });
  } catch (error: any) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch history' });
  }
});

router.post('/message', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });

    const { message, isInit } = req.body;

    if (isInit || message === '__INIT__') {
      const { data: merchant, error: merError } = await supabase.from('Merchant').select('*').eq('id', merchantId).single();
      if (merError || !merchant) return res.status(404).json({ error: 'Merchant not found' });

      const balance = await getBalance(merchant.walletAddress);
      const currency = merchant.country === 'KE' ? 'KES' : 'NGN';
      const rateData = await getCachedRate(currency);
      const rate = rateData.rate;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: todayTransactions } = await supabase.from('Transaction').select('amountLocal').eq('merchantId', merchantId).eq('direction', 'in').gte('createdAt', todayStart.toISOString());
      let todayEarningsLocal = 0;
      if (todayTransactions) {
        for (const tx of todayTransactions) todayEarningsLocal += tx.amountLocal || 0;
      }

      const yesterdayStart = new Date();
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      yesterdayStart.setHours(0, 0, 0, 0);
      const yesterdayEnd = new Date(yesterdayStart);
      yesterdayEnd.setHours(23, 59, 59, 999);
      
      const { data: yesterdayTransactions } = await supabase.from('Transaction').select('amountLocal').eq('merchantId', merchantId).eq('direction', 'in').gte('createdAt', yesterdayStart.toISOString()).lte('createdAt', yesterdayEnd.toISOString());
      let yesterdayEarningsLocal = 0;
      if (yesterdayTransactions) {
        for (const tx of yesterdayTransactions) yesterdayEarningsLocal += tx.amountLocal || 0;
      }

      const greetingPrompt = `Write a personalized, friendly, warm, and highly engaging greeting to start a chat with the merchant. 
      Merchant Business Name: ${merchant.businessName}
      Merchant Country: ${merchant.country}
      Current Balance: ${balance.cusd} cUSD
      Today's Earnings: ${todayEarningsLocal.toFixed(2)} ${currency}
      Yesterday's Earnings: ${yesterdayEarningsLocal.toFixed(2)} ${currency}
      Exchange Rate: 1 cUSD = ${rate.toFixed(2)} ${currency}

      Guidelines:
      - Use standard Pidgin English (if country is NG) or standard English/Swahili (if country is KE). 
      - If yesterday's earnings was 0, say something motivational like: "Good morning ${merchant.businessName}! You made 0 ${currency} yesterday. Let's change that today!" or similar Pidgin variant like "Body dey? You make 0 Naira yesterday. Make we change am today! Let's get that paper!".
      - NEVER use emojis or markdown formatting in the greeting.
      - Keep it short (1-2 sentences), natural, warm, specific and memorable. Do not sound like a generic robot.
      - Output ONLY the greeting text. Do not add any tags, headers, quotes, or JSON code formatting.`;

      const response = await axios.post(
        `${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
        { contents: [{ role: 'user', parts: [{ text: greetingPrompt }] }] }
      );

      let greeting = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || `Good morning ${merchant.businessName}! Let's make some sales today!`;
      greeting = greeting.replace(/^["']|["']$/g, '');

      await supabase.from('Conversation').insert({ id: randomUUID(), merchantId, role: 'assistant', content: greeting, createdAt: new Date().toISOString() });

      return res.json({ success: true, reply: greeting });
    }

    if (!message || message.trim() === '') return res.status(400).json({ error: 'Message content is required' });

    const now = new Date().toISOString();
    await supabase.from('Conversation').insert({ id: randomUUID(), merchantId, role: 'user', content: message.trim(), wasVoice: false, createdAt: now });
    const agentReply = await generateAgentCompletion(merchantId, message.trim());
    await supabase.from('Conversation').insert({ id: randomUUID(), merchantId, role: 'assistant', content: agentReply, createdAt: new Date().toISOString() });

    res.json({ success: true, reply: agentReply });

  } catch (error: any) {
    if (error?.response?.status === 429) {
      return res.status(429).json({ error: 'AI agent is busy — Gemini rate limit reached. Wait a moment and try again.' });
    }
    console.error('Error in agent message handler:', error?.response?.status, error?.message);
    res.status(500).json({ error: error.message || 'AI completions failed' });
  }
});

function detectLanguage(text: string): string {
  const igboMarkers = /\b(ọ|ụ|ị|nna|nne|biko|daalu|kedu|eze|obi|chi|aku)\b/i;
  const yorubaMarkers = /\b(ẹ|ọ|ṣ|gbọ|ẹjọ|pẹlẹ|ẹ káàárọ̀|odabo|bawo|jẹ|kí)\b/i;
  const hausaMarkers = /\b(ina|yaya|sannu|nagode|Allah|kai|malam|ƙ|ɗ|'yan)\b/i;
  const swahiliMarkers = /\b(habari|asante|karibu|pole|sawa|ndio|hapana|mama|baba|rafiki)\b/i;
  const kikuyuMarkers = /\b(ũ|ĩ|nĩ|mũ|wĩ|tũ|gũ|kũ|thĩ|mwĩ)\b/i;
  const luoMarkers = /\b(ber|adhi|erokamano|oyawore|idhi|bende|kod)\b/i;

  if (igboMarkers.test(text)) return 'igbo';
  if (yorubaMarkers.test(text)) return 'yoruba';
  if (hausaMarkers.test(text)) return 'hausa';
  if (swahiliMarkers.test(text)) return 'swahili';
  if (kikuyuMarkers.test(text)) return 'kikuyu';
  if (luoMarkers.test(text)) return 'luo';
  return 'english';
}


router.post('/voice', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const merchantId = req.merchantId;
    if (!merchantId) return res.status(401).json({ error: 'Unauthorized: missing merchant ID' });

    const { audio } = req.body;
    if (!audio) return res.status(400).json({ error: 'Audio data is required' });

    let mimeType = 'audio/webm';
    let base64Data = audio;
    if (audio.startsWith('data:')) {
      const parts = audio.split(';base64,');
      mimeType = parts[0].split(':')[1];
      base64Data = parts[1];
    }

    const transcriptionRes = await axios.post(
      `${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType, data: base64Data } },
              { text: 'Transcribe the spoken audio in this file. Output ONLY the plain transcription text. Do not add any greeting, comments, explanations, formatting, or quotes.' }
            ]
          }
        ]
      }
    );

    const transcript = transcriptionRes.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!transcript) return res.status(400).json({ error: 'Could not transcribe voice note. Please speak clearly.' });

    await supabase.from('Conversation').insert({ id: randomUUID(), merchantId, role: 'user', content: transcript, wasVoice: true, createdAt: new Date().toISOString() });
    const agentReply = await generateAgentCompletion(merchantId, transcript);
    await supabase.from('Conversation').insert({ id: randomUUID(), merchantId, role: 'assistant', content: agentReply, createdAt: new Date().toISOString() });

    res.json({ success: true, transcript, reply: agentReply });

  } catch (error: any) {
    if (error?.response?.status === 429) {
      return res.status(429).json({ error: 'Agent is busy, please wait a moment and try again.' });
    }
    console.error('Error in agent voice handler:', error);
    res.status(500).json({ error: error.message || 'Voice transcription/AI processing failed' });
  }
});


export { router as agentRouter };
