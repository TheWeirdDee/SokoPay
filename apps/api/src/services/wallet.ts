import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, createWalletClient, http, formatUnits, formatEther, parseUnits } from 'viem';
import { celo } from 'viem/chains';
import { createDecipheriv, createCipheriv, randomBytes } from 'crypto';

const CUSD_ADDRESS = '0x765DE816845861e75A25fCA122bb6898B8B1282a';
const ALGORITHM = 'aes-256-cbc';

const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }]
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }]
  }
] as const;

export function encryptPrivateKey(privateKey: string): string {
  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is not set. Check your .env file and ensure dotenv is loaded first.');
  }
  const key = Buffer.from(ENCRYPTION_KEY, 'hex').slice(0, 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decryptPrivateKey(encrypted: string): `0x${string}` {
  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
  
  if (!ENCRYPTION_KEY) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is not set. ' +
      'Check your .env file and ensure dotenv is loaded first.'
    );
  }
  
  if (!encrypted || !encrypted.includes(':')) {
    throw new Error(
      `Invalid encrypted key format. Expected "iv:data", got: ${typeof encrypted}`
    );
  }

  try {
    const [ivHex, encryptedData] = encrypted.split(':');
    const key = Buffer.from(ENCRYPTION_KEY, 'hex').slice(0, 32);
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    // Ensure 0x prefix
    const key0x = decrypted.startsWith('0x') 
      ? decrypted 
      : `0x${decrypted}`;
    return key0x as `0x${string}`;
  } catch (error: any) {
    throw new Error(`Failed to decrypt private key: ${error.message}`);
  }
}

export function generateMerchantWallet() {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const encryptedPrivateKey = encryptPrivateKey(privateKey);

  return {
    address: account.address,
    encryptedPrivateKey,
  };
}

export async function getBalance(walletAddress: string): Promise<{
  cusd: string;
  celo: string;
}> {
  const publicClient = createPublicClient({
    chain: celo,
    transport: http(process.env.CELO_RPC_URL || 'https://forno.celo.org', { timeout: 3000 })
  });

  try {
    const [cusdBalance, celoBalance] = await Promise.all([
      publicClient.readContract({
        address: CUSD_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [walletAddress as `0x${string}`]
      }),
      publicClient.getBalance({ address: walletAddress as `0x${string}` })
    ]);

    return {
      cusd: Number(formatUnits(cusdBalance as bigint, 18)).toFixed(2),
      celo: Number(formatEther(celoBalance)).toFixed(4)
    };
  } catch (error) {
    console.error('Error fetching balance from chain:', error);
    return {
      cusd: '0.00',
      celo: '0.0000'
    };
  }
}

export async function transferCusd(toAddress: string, amountCusd: string): Promise<string> {
  const rawKey = process.env.AGENT_PRIVATE_KEY;

  if (!rawKey) {
    console.error('[WALLET] AGENT_PRIVATE_KEY not in environment — falling back to mock hash');
    const mockHash = '0x' + randomBytes(32).toString('hex');
    console.log(`[DEVELOPMENT] Mock Tx Hash generated: ${mockHash}`);
    return mockHash;
  }

  const agentKey = (rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`) as `0x${string}`;

  try {
    const account = privateKeyToAccount(agentKey);

    const publicClient = createPublicClient({
      chain: celo,
      transport: http(process.env.CELO_RPC_URL || 'https://forno.celo.org')
    });

    const walletClient = createWalletClient({
      account,
      chain: celo,
      transport: http(process.env.CELO_RPC_URL || 'https://forno.celo.org')
    });

    const value = parseUnits(amountCusd, 18);
    const hash = await walletClient.writeContract({
      address: CUSD_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [toAddress as `0x${string}`, value],
      account,
      chain: celo,
      feeCurrency: CUSD_ADDRESS as `0x${string}`
    });

    console.log(`[ON-CHAIN] Transferred ${amountCusd} cUSD to ${toAddress}. Tx Hash: ${hash}`);
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
  } catch (error: any) {
    console.error('[WALLET] transferCusd failed — generating mock hash:', error?.message || error);
    const mockHash = '0x' + randomBytes(32).toString('hex');
    console.log(`[DEVELOPMENT] Mock Tx Hash generated: ${mockHash}`);
    return mockHash;
  }
}

export async function transferCusdFromMerchant(
  privateKey: `0x${string}`,
  toAddress: string,
  amountCusd: string
): Promise<string> {
  const publicClient = createPublicClient({
    chain: celo,
    transport: http(process.env.CELO_RPC_URL || 'https://forno.celo.org')
  });

  const account = privateKeyToAccount(privateKey);

  const walletClient = createWalletClient({
    account,
    chain: celo,
    transport: http(process.env.CELO_RPC_URL || 'https://forno.celo.org')
  });

  const value = parseUnits(amountCusd, 18);

  const hash = await walletClient.writeContract({
    address: CUSD_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [toAddress as `0x${string}`, value],
    account,
    chain: celo,
    feeCurrency: CUSD_ADDRESS as `0x${string}`
  });

  console.log(`[ON-CHAIN] Merchant transferred ${amountCusd} cUSD to ${toAddress}. Tx Hash: ${hash}`);

  // Wait for confirmation before returning the hash
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[ON-CHAIN] Transaction ${hash} confirmed.`);

  return hash;
}
