import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { celo } from 'viem/chains';
import { AgentRegistry } from '@chaoschain/sdk';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../../../.env') });

const RPC_URL = process.env.CELO_RPC_URL || 'https://forno.celo.org';
const PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY as `0x${string}`;

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

  console.log(`Setting up ERC-8004 Agent for SokoPay...`);
  console.log(`Agent Address: ${account.address}`);

  try {
    const registry = new AgentRegistry({
      publicClient,
      walletClient,
      // Official Celo Identity Registry
      address: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' 
    });

    const agentURI = 'https://sokopay.app/agent/manifest.json';
    
    console.log('Sending register transaction...');
    // Register agent
    const txHash = await registry.register({
      agentURI,
    });

    console.log(`Transaction Hash: ${txHash}`);
    console.log('Waiting for receipt...');
    
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`Agent registered successfully in block ${receipt.blockNumber}`);
    
    // Parse logs to get Agent ID if necessary using SDK helpers or viem
    console.log('Setup Complete!');

  } catch (error) {
    console.error('Failed to register agent:', error);
  }
}

main().catch(console.error);
