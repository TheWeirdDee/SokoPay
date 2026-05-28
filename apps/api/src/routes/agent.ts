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

    const { message, isInit } = req.body;

    if (isInit || message === '__INIT__') {
      // Data-driven opening greeting generation
      const merchant = await prisma.merchant.findUnique({
        where: { id: merchantId }
      });
      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
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

      // Calculate yesterday's earnings
      const yesterdayStart = new Date();
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      yesterdayStart.setHours(0, 0, 0, 0);
      const yesterdayEnd = new Date(yesterdayStart);
      yesterdayEnd.setHours(23, 59, 59, 999);
      const yesterdayTransactions = await prisma.transaction.findMany({
        where: {
          merchantId,
          direction: 'in',
          createdAt: { gte: yesterdayStart, lte: yesterdayEnd }
        }
      });
      let yesterdayEarningsLocal = 0;
      for (const tx of yesterdayTransactions) {
        yesterdayEarningsLocal += tx.amountLocal || 0;
      }

      // Construct customized system greeting prompt
      const greetingPrompt = `Write a personalized, friendly, warm, and highly engaging greeting to start a chat with the merchant. 
      Merchant Business Name: ${merchant.businessName}
      Merchant Country: ${merchant.country}
      Current Balance: ${balance.cusd} cUSD
      Today's Earnings: ${todayEarningsLocal.toFixed(2)} ${currency}
      Yesterday's Earnings: ${yesterdayEarningsLocal.toFixed(2)} ${currency}
      Exchange Rate: 1 cUSD = ${rate.toFixed(2)} ${currency}

      Guidelines:
      - Use standard Pidgin English (if country is NG) or standard English/Swahili (if country is KE). 
      - If yesterday's earnings was 0, say something motivational like: "Good morning ${merchant.businessName}! You made 0 ${currency} yesterday. Let's change that today! 💪" or similar Pidgin variant like "Body dey? You make 0 Naira yesterday. Make we change am today! Let's get that paper! 🚀".
      - Keep it short (1-2 sentences), natural, warm, specific and memorable. Do not sound like a generic robot.
      - Output ONLY the greeting text. Do not add any tags, headers, quotes, or JSON code formatting.`;

      const response = await axios.post(
        `${GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
        {
          contents: [{ role: 'user', parts: [{ text: greetingPrompt }] }]
        }
      );

      let greeting = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || `Good morning ${merchant.businessName}! Let's make some sales today!`;
      greeting = greeting.replace(/^["']|["']$/g, '');

      // Save assistant reply
      await prisma.conversation.create({
        data: {
          merchantId,
          role: 'assistant',
          content: greeting
        }
      });

      return res.json({
        success: true,
        reply: greeting
      });
    }

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

// Detect language from text content
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

  // STEP 1 — Strip ALL diacritics universally
  result = result
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // combining marks
    .replace(/ọ/g, 'o').replace(/Ọ/g, 'O')
    .replace(/ụ/g, 'u').replace(/Ụ/g, 'U')
    .replace(/ị/g, 'i').replace(/Ị/g, 'I')
    .replace(/ẹ/g, 'e').replace(/Ẹ/g, 'E')
    .replace(/ṣ/g, 's').replace(/Ṣ/g, 'S')
    .replace(/ƙ/g, 'k').replace(/Ƙ/g, 'K')
    .replace(/ɗ/g, 'd').replace(/Ɗ/g, 'D')
    .replace(/ũ/g, 'u').replace(/Ũ/g, 'U')
    .replace(/ĩ/g, 'i').replace(/Ĩ/g, 'I')
    .replace(/ã/g, 'a').replace(/Ã/g, 'A');

  // STEP 2 — Language-specific word substitutions
  // IGBO
  result = result
    .replace(/\bbiko\b/gi, 'beeko')
    .replace(/\bdaalu\b/gi, 'daalu')
    .replace(/\bkedu\b/gi, 'kedu')
    .replace(/\bnna\b/gi, 'nna')
    .replace(/\bnne\b/gi, 'nne')
    .replace(/\bchi\b/gi, 'chi')
    .replace(/\beze\b/gi, 'ezeh')
    .replace(/\bogi\b/gi, 'ogi')
    .replace(/\bndi\b/gi, 'ndi');

  // YORUBA
  result = result
    .replace(/\bpele\b/gi, 'peleh')
    .replace(/\bbawo\b/gi, 'bah-wo')
    .replace(/\bodabo\b/gi, 'oh-dah-bo')
    .replace(/\bekaaro\b/gi, 'eh-kah-ro')
    .replace(/\bekaasan\b/gi, 'eh-kah-sahn')
    .replace(/\bekaaale\b/gi, 'eh-kah-leh')
    .replace(/\bese\b/gi, 'eh-seh')
    .replace(/\beni\b/gi, 'eni')
    .replace(/\bkabiyesi\b/gi, 'kah-bi-yeh-si');

  // HAUSA
  result = result
    .replace(/\bsannu\b/gi, 'sannu')
    .replace(/\bnagode\b/gi, 'nah-go-deh')
    .replace(/\byadaya\b/gi, 'yah-dah-yah')
    .replace(/\bkai\b/gi, 'kai')
    .replace(/\bmalam\b/gi, 'mah-lam')
    .replace(/\binna wuni\b/gi, 'inna wooni')
    .replace(/\bsai anjima\b/gi, 'sai an-jima')
    .replace(/\bina kwana\b/gi, 'ina kwana');

  // SWAHILI (Kenya)
  result = result
    .replace(/\bhabari\b/gi, 'ha-ba-ri')
    .replace(/\basante\b/gi, 'ah-san-teh')
    .replace(/\bkaribu\b/gi, 'ka-ri-bu')
    .replace(/\bpole\b/gi, 'po-leh')
    .replace(/\bsawa\b/gi, 'sah-wah')
    .replace(/\bndio\b/gi, 'n-dio')
    .replace(/\bhapana\b/gi, 'ha-pa-na')
    .replace(/\btwende\b/gi, 'twen-deh')
    .replace(/\bnzuri\b/gi, 'n-zoo-ri')
    .replace(/\bkwaheri\b/gi, 'kwa-heh-ri')
    .replace(/\bshukrani\b/gi, 'shu-kra-ni')
    .replace(/\brafiki\b/gi, 'ra-fi-ki')
    .replace(/\bmambo\b/gi, 'mam-bo')
    .replace(/\bvipi\b/gi, 'vi-pi')
    .replace(/\bpoa\b/gi, 'po-ah')
    .replace(/\bninahitaji\b/gi, 'ni-na-hi-ta-ji');

  // KIKUYU (Kenya)
  result = result
    .replace(/\bwangu\b/gi, 'wan-gu')
    .replace(/\bniwe\b/gi, 'ni-weh')
    .replace(/\btigwo\b/gi, 'tig-wo')
    .replace(/\btuika\b/gi, 'tu-i-ka');

  // LUO (Kenya)
  result = result
    .replace(/\berokamano\b/gi, 'e-ro-ka-ma-no')
    .replace(/\boyawore\b/gi, 'o-ya-wo-reh')
    .replace(/\bnyasaye\b/gi, 'n-ya-sa-yeh');

  // STEP 3 — Universal fixes for all languages
  result = result
    .replace(/₦/g, 'Naira ')
    .replace(/KSh/g, 'Kenya shillings ')
    .replace(/KES/g, 'Kenya shillings ')
    .replace(/cUSD/g, 'see you ess dee')
    .replace(/0x[a-fA-F0-9]{4,}/g, 'a blockchain address')
    .replace(/\bTx\b/gi, 'transaction')
    .replace(/\btx\b/g, 'transaction')
    .replace(/\bQR\b/g, 'Q R code')
    .replace(/\bOTP\b/g, 'O T P')
    .replace(/\bPIN\b/g, 'pin')
    .replace(/[*_#`~]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  return result;
}

function getTTSVoice(
  merchantCountry: string,
  detectedLang: string
): { languageCode: string; name: string } {
  if (merchantCountry === 'KE') {
    if (detectedLang === 'swahili') {
      return { languageCode: 'sw-KE', name: 'sw-KE-Standard-A' };
    }
    return { languageCode: 'en-NG', name: 'en-NG-Wavenet-A' };
  }
  return { languageCode: 'en-NG', name: 'en-NG-Wavenet-A' };
}

// POST /agent/speak - Synthesize voice reply via Google Cloud TTS REST API
router.post('/speak', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured' });
    }

    const merchantId = req.merchantId;
    let country = 'NG';
    if (merchantId) {
      const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
      if (merchant) {
        country = merchant.country;
      }
    }

    const detectedLang = detectLanguage(text);
    const voice = getTTSVoice(country, detectedLang);
    const speakableText = makeSpeakable(text, detectedLang);

    console.log(`[AGENT SPEAK] Google Cloud TTS Rest Synthesis: lang=${detectedLang}, voice=${voice.name}, text="${speakableText.substring(0, 45)}..."`);

    const ttsResponse = await axios.post(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`,
      {
        input: { text: speakableText },
        voice: {
          languageCode: voice.languageCode,
          name: voice.name
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: 0.92,
          pitch: 0.8,
          effectsProfileId: ['small-bluetooth-speaker-class-device']
        }
      }
    );

    const audioContent = ttsResponse.data?.audioContent;
    if (!audioContent) {
      return res.status(500).json({ error: 'Google TTS synthesis returned empty audio' });
    }

    res.json({
      success: true,
      audioContent,
      audio: audioContent,
      detectedLang
    });
  } catch (error: any) {
    console.error('Google Cloud TTS API Error:', error?.response?.data || error.message);
    res.status(500).json({ error: error?.response?.data?.error?.message || error.message || 'Google Cloud TTS Synthesize failed' });
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
