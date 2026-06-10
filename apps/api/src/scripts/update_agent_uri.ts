import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { celo } from 'viem/chains';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../../.env') });

const RPC_URL = process.env.CELO_RPC_URL || 'https://forno.celo.org';
const PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
const REGISTRY_ADDRESS = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as `0x${string}`;
const AGENT_ID = BigInt(process.env.SELF_AGENT_ID || '9182');

const REGISTRY_ABI = [
  {
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'newURI', type: 'string' }
    ],
    name: 'setAgentURI',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

const metadata = {
  name: 'SokoPay',
  description: 'AI-powered payment agent for African merchants on Celo blockchain. Enables cUSD payments, multi-currency support (NGN/KES), real-time transaction tracking, and automated financial summaries.',
  image: 'https://sokopay.vercel.app/logo.svg',
  type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
  active: true,
  version: '1.0.0',
  tags: ['payments', 'celo', 'africa', 'ngn', 'kes', 'cusd', 'merchant', 'x402'],
  services: [
    {
      name: 'web',
      endpoint: 'https://sokopay.vercel.app'
    },
    {
      name: 'api',
      endpoint: 'https://sokopay.quikdb.net'
    }
  ],
  registrations: [
    {
      agentId: Number(AGENT_ID),
      agentRegistry: `eip155:42220:${REGISTRY_ADDRESS}`
    }
  ],
  capabilities: {
    streaming: false,
    pushNotifications: false,
    x402: true
  },
  supportedTrust: [
    'reputation',
    'crypto-economic'
  ]
};

async function main() {
  if (!PRIVATE_KEY) {
    throw new Error('AGENT_PRIVATE_KEY is missing from .env');
  }

  const account = privateKeyToAccount(PRIVATE_KEY);

  const publicClient = createPublicClient({
    chain: celo,
    transport: http(RPC_URL)
  });

  const walletClient = createWalletClient({
    account,
    chain: celo,
    transport: http(RPC_URL)
  });

  console.log(`Updating ERC-8004 agent metadata for SokoPay...`);
  console.log(`Agent ID: ${AGENT_ID}`);
  console.log(`Wallet: ${account.address}`);

  // Verify ownership
  const owner = await publicClient.readContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'ownerOf',
    args: [AGENT_ID]
  });
  console.log(`Agent owner: ${owner}`);

  if (owner.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`Wallet ${account.address} does not own agent ${AGENT_ID} (owner: ${owner})`);
  }

  // Read current URI
  const currentUri = await publicClient.readContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'tokenURI',
    args: [AGENT_ID]
  });
  console.log(`Current URI: ${currentUri}`);

  const newUri = `data:application/json,${JSON.stringify(metadata)}`;
  console.log(`\nNew metadata: ${JSON.stringify(metadata, null, 2)}`);
  console.log(`\nSending setAgentUri transaction...`);

  const txHash = await walletClient.writeContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'setAgentURI',
    args: [AGENT_ID, newUri]
  });

  console.log(`Transaction hash: ${txHash}`);
  console.log('Waiting for receipt...');

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`✅ Agent URI updated in block ${receipt.blockNumber}`);
  console.log(`✅ Agent ${AGENT_ID} metadata now includes services and registrations arrays`);

  // Verify the update
  const updatedUri = await publicClient.readContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: 'tokenURI',
    args: [AGENT_ID]
  });
  console.log(`\nVerified new URI: ${updatedUri.substring(0, 80)}...`);
}

main().catch(console.error);
