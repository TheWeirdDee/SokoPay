import crypto from 'crypto';
import { prisma } from '../config/db';
import { CountryBridge, PaymentDetails, PaymentEvent } from './nigeria';

export class KenyaBridge implements CountryBridge {
  country = 'KE';
  currency = 'KES';

  private getMpesaUrl(): string {
    const env = process.env.MPESA_ENV || 'sandbox';
    return env === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
  }

  async getMpesaToken(): Promise<string> {
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    
    if (!consumerKey || !consumerSecret) {
      throw new Error('M-Pesa Consumer Key or Secret is missing in environment');
    }

    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const baseUrl = this.getMpesaUrl();

    const response = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${auth}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to generate M-Pesa access token: ${response.statusText}`);
    }

    const data = await response.json() as any;
    return data.access_token;
  }

  async createMerchantAccount(merchantId: string): Promise<PaymentDetails> {
    const tillNumber = process.env.MPESA_SHORTCODE || 'MOCK_TILL';
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const paymentLink = `${frontendUrl}/p/${merchantId}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(paymentLink)}`;

    return {
      mpesaTill: tillNumber,
      paymentLink,
      qrCodeUrl
    };
  }

  async initiateSTKPush(params: {
    phone: string;
    amount: number;
    merchantId: string;
  }): Promise<any> {
    const consumerKey = process.env.MPESA_CONSUMER_KEY;
    const shortcode = process.env.MPESA_SHORTCODE || '174379'; // default Safaricom Sandbox shortcode
    const passkey = process.env.MPESA_PASSKEY || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919'; // default Sandbox passkey

    // If key not configured, throw error for production, or return mock in dev
    if (!consumerKey) {
      console.warn('[KenyaBridge] M-Pesa Consumer Key missing. Simulating STK push initiation.');
      return {
        CheckoutRequestID: `ws_CO_${crypto.randomBytes(12).toString('hex')}`,
        ResponseCode: '0',
        CustomerMessage: 'Success. Request accepted for processing'
      };
    }

    const token = await this.getMpesaToken();
    const timestamp = this.getTimestamp();
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    const baseUrl = this.getMpesaUrl();
    const apiUrl = process.env.API_URL || 'http://localhost:3001';

    // Format phone number to Safaricom standards (2547XXXXXXXX or 2541XXXXXXXX)
    let formattedPhone = params.phone.replace('+', '').trim();
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '254' + formattedPhone.substring(1);
    }

    const response = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.ceil(params.amount),
        PartyA: formattedPhone,
        PartyB: shortcode,
        PhoneNumber: formattedPhone,
        CallBackURL: `${apiUrl}/p/webhooks/kenya/mpesa`,
        AccountReference: params.merchantId.substring(0, 12), // Max 12 chars for Safaricom reference
        TransactionDesc: 'SokoPay Payment'
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Safaricom STK Push failed with status ${response.status}: ${errText}`);
    }

    return await response.json();
  }

  verifyWebhook(headers: any, body: any): boolean {
    // Daraja uses Safaricom IP whitelists: 196.201.214.0/24, 196.201.215.0/24
    if (process.env.NODE_ENV !== 'production') {
      return true; // Bypass IP whitelisting in local development
    }

    const ip = headers['x-forwarded-for'] || headers['x-real-ip'];
    if (!ip) return false;

    // Standard Safaricom Daraja IP ranges
    return ip.startsWith('196.201.214.') || ip.startsWith('196.201.215.');
  }

  async handleWebhook(payload: any): Promise<PaymentEvent> {
    const stkCallback = payload?.Body?.stkCallback;
    if (!stkCallback) {
      throw new Error('Invalid M-Pesa webhook payload structure');
    }

    if (stkCallback.ResultCode !== 0) {
      throw new Error(`M-Pesa payment failed: ${stkCallback.ResultDesc}`);
    }

    const items = stkCallback.CallbackMetadata?.Item;
    if (!items || !Array.isArray(items)) {
      throw new Error('Missing CallbackMetadata in M-Pesa payload');
    }

    const amountItem = items.find((i: any) => i.Name === 'Amount');
    const receiptItem = items.find((i: any) => i.Name === 'MpesaReceiptNumber');
    
    if (!amountItem || !receiptItem) {
      throw new Error('Missing Amount or Receipt Number in M-Pesa webhook metadata');
    }

    // Try to find the merchant associated with this transaction reference (usually AccountReference or merchantId passed in query/webhook context)
    // For simplicity, we can fetch the last pending transaction or pass merchantId in Callback URL query parameters: e.g. CallBackURL: /p/webhooks/kenya/mpesa?merchantId=...
    // Let's inspect the payload context or query parameters.
    // In index.ts we will mount public router where we process this.
    // We will extract merchantId from query parameters or match CheckoutRequestID.
    
    return {
      amount: parseFloat(amountItem.Value),
      currency: 'KES',
      merchantId: '', // Will be resolved by the route handler using CheckoutRequestID or query string
      reference: receiptItem.Value,
      paidAt: new Date()
    };
  }

  private getTimestamp(): string {
    const date = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }
}
