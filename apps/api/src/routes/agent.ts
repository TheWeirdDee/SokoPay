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
LANGUAGE RULES:
- Detect whatever language the merchant writes in and respond in the same language.
- If they write in English → respond in English.
- If they write in Pidgin → respond in Pidgin (e.g. "How body? You make NGN 5,000 today.").
- If they write in Igbo → respond in Igbo mixed with English naturally (e.g. "Nna, your balance bụ 0.87 cUSD. Ọ dị mma!"). Never refuse to try Igbo.
- If they write in Yoruba → respond in Yoruba mixed with English (e.g. "Balance rẹ jẹ 0.87 cUSD, ẹ káàárọ̀"). Never refuse to try Yoruba.
- If they write in Hausa → respond in Hausa mixed with English (e.g. "Sannu, balance ɗinka shine 0.87 cUSD"). Never refuse to try Hausa.
- If they write in Swahili → respond in Swahili mixed with English (e.g. "Habari, balance yako ni 0.87 cUSD").
- If they write in Kikuyu, Luo, or any other language → attempt a warm response mixing their language with English. Code-switching is normal and acceptable.
- NEVER say you cannot speak a language. NEVER say 'I no too sabi' or admit language limits.
- A warm attempt in their language mixed with English is always better than refusing.
- The goal is the merchant feels understood.

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

    const { data: history, error } = await supabase.from('Conversation')
      .select('*')
      .eq('merchantId', merchantId)
      .order('createdAt', { ascending: true });

    if (error) throw error;

    res.json({ success: true, history });
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

function makeSpeakable(text: string, lang?: string): string {
  let result = text;
  result = result.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ọ/g, 'o').replace(/Ọ/g, 'O').replace(/ụ/g, 'u').replace(/Ụ/g, 'U')
    .replace(/ị/g, 'i').replace(/Ị/g, 'I').replace(/ẹ/g, 'e').replace(/Ẹ/g, 'E')
    .replace(/ṣ/g, 's').replace(/Ṣ/g, 'S').replace(/ƙ/g, 'k').replace(/Ƙ/g, 'K')
    .replace(/ɗ/g, 'd').replace(/Ɗ/g, 'D').replace(/ũ/g, 'u').replace(/Ũ/g, 'U')
    .replace(/ĩ/g, 'i').replace(/Ĩ/g, 'I').replace(/ã/g, 'a').replace(/Ã/g, 'A');

  result = result.replace(/\bbiko\b/gi, 'beeko').replace(/\bdaalu\b/gi, 'daalu').replace(/\bkedu\b/gi, 'kedu').replace(/\bnna\b/gi, 'nna').replace(/\bnne\b/gi, 'nne').replace(/\bchi\b/gi, 'chi').replace(/\beze\b/gi, 'ezeh').replace(/\bogi\b/gi, 'ogi').replace(/\bndi\b/gi, 'ndi');
  result = result.replace(/\bpele\b/gi, 'peleh').replace(/\bbawo\b/gi, 'bah-wo').replace(/\bodabo\b/gi, 'oh-dah-bo').replace(/\bekaaro\b/gi, 'eh-kah-ro').replace(/\bekaasan\b/gi, 'eh-kah-sahn').replace(/\bekaaale\b/gi, 'eh-kah-leh').replace(/\bese\b/gi, 'eh-seh').replace(/\beni\b/gi, 'eni').replace(/\bkabiyesi\b/gi, 'kah-bi-yeh-si');
  result = result.replace(/\bsannu\b/gi, 'sannu').replace(/\bnagode\b/gi, 'nah-go-deh').replace(/\byadaya\b/gi, 'yah-dah-yah').replace(/\bkai\b/gi, 'kai').replace(/\bmalam\b/gi, 'mah-lam').replace(/\binna wuni\b/gi, 'inna wooni').replace(/\bsai anjima\b/gi, 'sai an-jima').replace(/\bina kwana\b/gi, 'ina kwana');
  result = result.replace(/\bhabari\b/gi, 'ha-ba-ri').replace(/\basante\b/gi, 'ah-san-teh').replace(/\bkaribu\b/gi, 'ka-ri-bu').replace(/\bpole\b/gi, 'po-leh').replace(/\bsawa\b/gi, 'sah-wah').replace(/\bndio\b/gi, 'n-dio').replace(/\bhapana\b/gi, 'ha-pa-na').replace(/\btwende\b/gi, 'twen-deh').replace(/\bnzuri\b/gi, 'n-zoo-ri').replace(/\bkwaheri\b/gi, 'kwa-heh-ri').replace(/\bshukrani\b/gi, 'shu-kra-ni').replace(/\brafiki\b/gi, 'ra-fi-ki').replace(/\bmambo\b/gi, 'mam-bo').replace(/\bvipi\b/gi, 'vi-pi').replace(/\bpoa\b/gi, 'po-ah').replace(/\bninahitaji\b/gi, 'ni-na-hi-ta-ji');
  result = result.replace(/\bwangu\b/gi, 'wan-gu').replace(/\bniwe\b/gi, 'ni-weh').replace(/\btigwo\b/gi, 'tig-wo').replace(/\btuika\b/gi, 'tu-i-ka');
  result = result.replace(/\berokamano\b/gi, 'e-ro-ka-ma-no').replace(/\boyawore\b/gi, 'o-ya-wo-reh').replace(/\bnyasaye\b/gi, 'n-ya-sa-yeh');
  result = result.replace(/₦/g, 'Naira ').replace(/KSh/g, 'Kenya shillings ').replace(/KES/g, 'Kenya shillings ').replace(/cUSD/g, 'see you ess dee').replace(/0x[a-fA-F0-9]{4,}/g, 'a blockchain address').replace(/\bTx\b/gi, 'transaction').replace(/\btx\b/g, 'transaction').replace(/\bQR\b/g, 'Q R code').replace(/\bOTP\b/g, 'O T P').replace(/\bPIN\b/g, 'pin').replace(/[*_#`~]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[\u{1F300}-\u{1F9FF}]/gu, '').replace(/[\u{2600}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim();
  return result;
}

router.get('/speak/test', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (process.env.GOOGLE_TTS_ENABLED !== 'true') return res.status(400).json({ error: 'GOOGLE_TTS_ENABLED is not set to true in .env' });
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });

    const testText = 'Hello, welcome to SokoPay. Your finances are in good hands.';
    const ttsResponse = await axios.post(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`,
      {
        input: { text: testText },
        voice: { languageCode: 'en-NG', name: 'en-NG-Wavenet-A', ssmlGender: 'FEMALE' },
        audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95 }
      }
    );

    const audioContent = ttsResponse.data?.audioContent;
    if (!audioContent) return res.status(500).json({ error: 'Google TTS returned empty audio' });
    res.json({ success: true, message: 'TTS is working correctly.', audioContentLength: audioContent.length, audioContent });
  } catch (error: any) {
    const gErr = error?.response?.data?.error;
    res.status(500).json({ error: gErr?.message || error.message || 'TTS test failed', status: gErr?.status, details: gErr?.details });
  }
});

router.post('/speak', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    console.log('[TTS] ElevenLabs key:', apiKey ? `EXISTS (${apiKey.slice(0, 8)}...)` : 'MISSING');

    if (!apiKey) {
      console.warn('[TTS] ELEVENLABS_API_KEY not set in .env — TTS disabled');
      return res.json({ audio: null, fallback: true, reason: 'no_key' });
    }

    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'No text' });

    const speakableText = makeSpeakable(text, 'english').substring(0, 500);
    console.log('[TTS] Speaking text length:', speakableText.length, 'chars');

    // eleven_turbo_v2_5 works on all ElevenLabs plans including free tier
    const response = await fetch(
      'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM',
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({
          text: speakableText,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            speed: 0.9
          }
        })
      }
    );

    console.log('[TTS] ElevenLabs response status:', response.status);

    if (!response.ok) {
      const err = await response.text();
      console.error('[TTS] ElevenLabs error body:', err);
      return res.json({ audio: null, fallback: true, reason: `elevenlabs_${response.status}`, detail: err });
    }

    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');
    console.log('[TTS] Audio generated, size:', audioBuffer.byteLength, 'bytes');

    return res.json({ success: true, audio: audioBase64 });

  } catch (error: any) {
    console.error('[TTS] Unexpected error:', error.message);
    return res.json({ audio: null, fallback: true, reason: 'exception' });
  }
});

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
