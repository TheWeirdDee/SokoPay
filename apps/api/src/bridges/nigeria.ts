import crypto from 'crypto';
import { prisma } from '../config/db';

export interface PaymentDetails {
  accountNumber?: string;
  bankName?: string;
  qrCodeUrl?: string;
  mpesaTill?: string;
  paymentLink: string;
}

export interface PaymentEvent {
  amount: number;
  currency: string;
  merchantId: string;
  reference: string;
  paidAt: Date;
}

export interface CountryBridge {
  country: string;
  currency: string;
  createMerchantAccount(merchantId: string): Promise<PaymentDetails>;
  handleWebhook(payload: any): Promise<PaymentEvent>;
  verifyWebhook(headers: any, body: any): boolean;
}

export class NigeriaBridge implements CountryBridge {
  country = 'NG';
  currency = 'NGN';

  async createMerchantAccount(merchantId: string): Promise<PaymentDetails> {
    const clientId = process.env.PROVIDUS_CLIENT_ID;
    const clientSecret = process.env.PROVIDUS_CLIENT_SECRET;
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const paymentLink = `${frontendUrl}/p/${merchantId}`;

    if (!clientId || !clientSecret) {
      console.warn(`[NigeriaBridge] PROVIDUS_CLIENT_ID or PROVIDUS_CLIENT_SECRET is missing. Generating mock Providus Account.`);
      const randomAcc = '99' + Math.floor(10000000 + Math.random() * 90000000).toString();
      return {
        accountNumber: randomAcc,
        bankName: 'Providus Bank',
        paymentLink
      };
    }

    try {
      const timestamp = new Date().toISOString();
      const signature = crypto.createHmac('sha256', clientSecret)
        .update(`${clientId}.${timestamp}`)
        .digest('hex');

      const response = await fetch('https://api.providusbank.com/provicore/createAccount', {
        method: 'POST',
        headers: {
          'Client-Id': clientId,
          'X-Auth-Signature': signature,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          account_name: `SokoPay/${merchantId}`,
          bvn: ''
        })
      });

      if (!response.ok) {
        throw new Error(`Providus API responded with status ${response.status}`);
      }

      const data = await response.json() as any;

      return {
        accountNumber: data.account_number,
        bankName: 'Providus Bank',
        paymentLink
      };
    } catch (error) {
      console.error('[NigeriaBridge] Failed to create virtual account on Providus, using mock fallback:', error);
      const randomAcc = '99' + Math.floor(10000000 + Math.random() * 90000000).toString();
      return {
        accountNumber: randomAcc,
        bankName: 'Providus Bank',
        paymentLink
      };
    }
  }

  verifyWebhook(headers: any, body: any): boolean {
    const signature = headers['x-auth-signature'];
    const secret = process.env.PROVIDUS_WEBHOOK_SECRET;

    if (!secret) {
      console.warn(`[NigeriaBridge] PROVIDUS_WEBHOOK_SECRET is missing. Webhook verification bypassed for testing.`);
      return true;
    }

    const expected = crypto.createHmac('sha256', secret)
      .update(JSON.stringify(body))
      .digest('hex');

    return signature === expected;
  }

  async handleWebhook(payload: any): Promise<PaymentEvent> {
    const { account_number, amount, transaction_reference, transaction_date } = payload;
    if (!account_number || !amount) {
      throw new Error('Invalid Providus webhook payload');
    }

    const paymentAccount = await prisma.paymentAccount.findFirst({
      where: {
        accountNumber: String(account_number),
        type: 'bank'
      }
    });

    if (!paymentAccount) {
      throw new Error(`Payment account not found for number ${account_number}`);
    }

    return {
      amount: parseFloat(amount),
      currency: 'NGN',
      merchantId: paymentAccount.merchantId,
      reference: transaction_reference || crypto.randomBytes(8).toString('hex'),
      paidAt: transaction_date ? new Date(transaction_date) : new Date()
    };
  }
}
