import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { supabase } from '../config/supabase';
import { getBalance, decryptPrivateKey, transferCusdFromMerchant } from '../services/wallet';
import { getCachedRate } from '../services/muon';
import { privateKeyToAccount } from 'viem/accounts';

// SokoPay MCP server. Tools reuse the EXISTING backend services (wallet.ts,
// muon rate service, Supabase) — no logic is reimplemented here. Exposed over
// Streamable HTTP so 8004scan can health-check a public URL.

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sokopay.vercel.app';
const WALLET_RE = /^0x[0-9a-fA-F]{40}$/;

function text(obj: unknown) {
  return { content: [{ type: 'text' as const, text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] };
}
function errText(message: string) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }, null, 2) }], isError: true };
}

async function findMerchantByWallet(walletAddress: string) {
  const { data } = await supabase
    .from('Merchant')
    .select('id, businessName, country, walletAddress, encryptedPrivateKey')
    .ilike('walletAddress', walletAddress)
    .limit(1);
  return data?.[0] || null;
}

// Register through a non-generic signature. registerTool's generics infer
// callback arg types from the Zod inputSchema, which makes tsc's type checker
// run out of memory. Casting collapses that inference; Zod still validates at
// runtime. Handler args are typed explicitly below.
type RegisterTool = (
  name: string,
  config: { title?: string; description?: string; inputSchema?: Record<string, z.ZodTypeAny> },
  cb: (args: any) => Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }>
) => unknown;

export function buildMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'sokopay-mcp', version: '1.0.0' },
    {
      capabilities: { tools: {} },
      instructions:
        'SokoPay MCP server — cUSD balances, live NGN/KES FX rates, payments, ' +
        'transaction history, and payment links for African merchants on Celo mainnet.'
    }
  );

  const registerTool = (server.registerTool as unknown as RegisterTool).bind(server);

  // 1. get_merchant_balance — cUSD balance + local-currency equivalent at live rate
  registerTool(
    'get_merchant_balance',
    {
      title: 'Get merchant balance',
      description: "Get a wallet's cUSD balance plus its NGN and KES equivalent at the current live exchange rate.",
      inputSchema: { walletAddress: z.string().describe('Celo wallet address (0x + 40 hex chars)') }
    },
    async ({ walletAddress }: { walletAddress: string }) => {
      if (!WALLET_RE.test(walletAddress)) return errText('Invalid wallet address — expected 0x followed by 40 hex characters.');
      const balance = await getBalance(walletAddress);
      const [ngn, kes] = await Promise.all([getCachedRate('NGN'), getCachedRate('KES')]);
      const merchant = await findMerchantByWallet(walletAddress);
      const cusd = Number(balance.cusd);
      return text({
        walletAddress,
        businessName: merchant?.businessName ?? null,
        country: merchant?.country ?? null,
        balance: {
          cusd: balance.cusd,
          ngn: (cusd * ngn.rate).toFixed(2),
          kes: (cusd * kes.rate).toFixed(2)
        },
        rates: { ngnPerCusd: ngn.rate, kesPerCusd: kes.rate }
      });
    }
  );

  // 2. get_exchange_rate — live cUSD conversion rate
  registerTool(
    'get_exchange_rate',
    {
      title: 'Get exchange rate',
      description: 'Get the current live cUSD conversion rate for a supported currency (NGN or KES).',
      inputSchema: { currency: z.enum(['NGN', 'KES']).describe('Target currency: NGN or KES') }
    },
    async ({ currency }: { currency: 'NGN' | 'KES' }) => {
      const rateData = await getCachedRate(currency);
      return text({ currency, rate: rateData.rate, pair: `1 cUSD = ${rateData.rate.toFixed(2)} ${currency}`, timestamp: rateData.timestamp });
    }
  );

  // 3. send_payment — real on-chain cUSD transfer (authorization-gated)
  registerTool(
    'send_payment',
    {
      title: 'Send payment',
      description:
        'Send a real on-chain cUSD payment from one SokoPay merchant wallet to another wallet, ' +
        'denominated in local currency (converted at the live rate). Requires an operator authorization token.',
      inputSchema: {
        fromWallet: z.string().describe('Sender SokoPay merchant wallet address'),
        toWallet: z.string().describe('Recipient Celo wallet address'),
        amountLocal: z.number().positive().describe('Amount in local currency to send'),
        currency: z.enum(['NGN', 'KES']).describe('Local currency of amountLocal'),
        authToken: z.string().optional().describe('Operator authorization token required to execute a live transfer')
      }
    },
    async ({ fromWallet, toWallet, amountLocal, currency, authToken }: { fromWallet: string; toWallet: string; amountLocal: number; currency: 'NGN' | 'KES'; authToken?: string }) => {
      if (!WALLET_RE.test(fromWallet) || !WALLET_RE.test(toWallet)) return errText('Invalid wallet address format.');
      if (!(amountLocal > 0)) return errText('amountLocal must be a positive number.');

      // Safety gate: this is a public endpoint. Real transfers only execute with a
      // valid operator token, so the capability is detectable without being drainable.
      const secret = process.env.MCP_PAYMENT_SECRET;
      if (!secret || authToken !== secret) {
        return errText('Authorization required: send_payment only executes with a valid operator authToken. The capability is declared but disabled for unauthenticated callers.');
      }

      const merchant = await findMerchantByWallet(fromWallet);
      if (!merchant) return errText('Sender wallet is not a known SokoPay merchant.');

      const rateData = await getCachedRate(currency);
      const amountCusd = (amountLocal / rateData.rate).toFixed(6);

      const decryptedKey = decryptPrivateKey(merchant.encryptedPrivateKey);
      const signer = privateKeyToAccount(decryptedKey).address;
      if (signer.toLowerCase() !== merchant.walletAddress.toLowerCase()) return errText('Signer/address mismatch — transfer aborted.');

      const txHash = await transferCusdFromMerchant(decryptedKey, toWallet, amountCusd);
      return text({ success: true, txHash, fromWallet, toWallet, amountLocal, currency, amountCusd, explorer: `https://celoscan.io/tx/${txHash}` });
    }
  );

  // 4. get_transaction_history — recent transactions for a merchant wallet
  registerTool(
    'get_transaction_history',
    {
      title: 'Get transaction history',
      description: 'Get the recent SokoPay transactions for a merchant wallet address.',
      inputSchema: {
        walletAddress: z.string().describe('Merchant wallet address'),
        limit: z.number().int().min(1).max(50).optional().describe('Max number of transactions (default 10)')
      }
    },
    async ({ walletAddress, limit }: { walletAddress: string; limit?: number }) => {
      if (!WALLET_RE.test(walletAddress)) return errText('Invalid wallet address format.');
      const merchant = await findMerchantByWallet(walletAddress);
      if (!merchant) return errText('Wallet is not a known SokoPay merchant.');
      const { data: txs } = await supabase
        .from('Transaction')
        .select('type, direction, amountCusd, amountLocal, currencyLocal, method, status, txHash, counterpart, createdAt')
        .eq('merchantId', merchant.id)
        .order('createdAt', { ascending: false })
        .limit(limit ?? 10);
      return text({ walletAddress, businessName: merchant.businessName, count: txs?.length ?? 0, transactions: txs ?? [] });
    }
  );

  // 5. create_payment_link — shareable SokoPay payment link for a merchant
  registerTool(
    'create_payment_link',
    {
      title: 'Create payment link',
      description: 'Create a shareable SokoPay payment link for a merchant, optionally suggesting an amount.',
      inputSchema: {
        merchantId: z.string().describe('SokoPay merchant id'),
        amount: z.number().positive().optional().describe('Suggested amount in local currency'),
        currency: z.enum(['NGN', 'KES']).optional().describe('Currency of the suggested amount')
      }
    },
    async ({ merchantId, amount, currency }: { merchantId: string; amount?: number; currency?: 'NGN' | 'KES' }) => {
      const { data: merchant } = await supabase
        .from('Merchant')
        .select('id, businessName, country')
        .eq('id', merchantId)
        .maybeSingle();
      if (!merchant) return errText('Merchant not found.');
      const link = `${FRONTEND_URL}/p/${merchant.id}`;
      return text({
        success: true,
        paymentLink: link,
        merchant: { id: merchant.id, businessName: merchant.businessName, country: merchant.country },
        suggestedAmount: amount ?? null,
        currency: currency ?? (merchant.country === 'KE' ? 'KES' : 'NGN')
      });
    }
  );

  return server;
}

export const MCP_TOOL_NAMES = [
  'get_merchant_balance',
  'get_exchange_rate',
  'send_payment',
  'get_transaction_history',
  'create_payment_link'
];
