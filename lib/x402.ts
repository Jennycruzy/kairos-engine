/**
 * x402 Payment Gate — BNB Chain
 *
 * Implements the HTTP 402 Payment Required protocol for the KAIRÓS /api/analyze endpoint.
 * Callers (humans or other AI agents) must send a small BNB payment and include the
 * transaction hash in the X-Payment-Transaction header. The middleware verifies the
 * payment on-chain before passing the request through.
 *
 * Usage by an agent or developer:
 *   1. Send {X402_PRICE_BNB} BNB to {AGENT_OWNER_ADDRESS} on BNB Chain (chainId 56)
 *   2. Include the tx hash in the header: X-Payment-Transaction: 0x...
 *   3. POST to /api/analyze as normal
 */

import { createPublicClient, http, parseEther } from 'viem'
import { bsc } from 'viem/chains'
import type { NextRequest } from 'next/server'
import type { X402PaymentDetails } from '@/types/kairos.types'

// Price: ~$0.10 in BNB
export const X402_PRICE_BNB = '0.0003'

// Replay protection — used tx hashes are rejected even if valid
const usedTxHashes = new Set<string>()

function getPaymentDetails(): X402PaymentDetails {
  return {
    network: 'bsc',
    chainId: 56,
    token: 'BNB',
    amount: X402_PRICE_BNB,
    recipient: process.env.AGENT_OWNER_ADDRESS || '',
    description: 'KAIRÓS Engine — Mode A Pre-launch Advisory Report',
    instructions: [
      `1. Send ${X402_PRICE_BNB} BNB to ${process.env.AGENT_OWNER_ADDRESS} on BNB Chain (chainId 56)`,
      '2. Wait for 1 confirmation',
      '3. Retry this request with header: X-Payment-Transaction: <txHash>',
    ].join(' | '),
  }
}

export async function verifyX402(
  req: NextRequest
): Promise<{ ok: true } | { ok: false; details: X402PaymentDetails; statusCode: 402 }> {
  // Skip gate if x402 is disabled (e.g. local dev without agent address)
  const recipient = process.env.AGENT_OWNER_ADDRESS
  if (!recipient || process.env.X402_DISABLED === 'true') {
    return { ok: true }
  }

  const txHash = req.headers.get('X-Payment-Transaction')

  if (!txHash) {
    return { ok: false, details: getPaymentDetails(), statusCode: 402 }
  }

  // Replay protection
  if (usedTxHashes.has(txHash.toLowerCase())) {
    return { ok: false, details: { ...getPaymentDetails(), description: 'Transaction already used — send a new payment' }, statusCode: 402 }
  }

  try {
    const publicClient = createPublicClient({
      chain: bsc,
      transport: http(process.env.BNB_RPC_URL || 'https://bsc-dataseed.binance.org/'),
    })

    const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` })

    if (!tx) {
      return { ok: false, details: { ...getPaymentDetails(), description: 'Transaction not found on BNB Chain' }, statusCode: 402 }
    }

    // Verify recipient
    if (tx.to?.toLowerCase() !== recipient.toLowerCase()) {
      return { ok: false, details: { ...getPaymentDetails(), description: 'Wrong recipient address' }, statusCode: 402 }
    }

    // Verify amount
    if (tx.value < parseEther(X402_PRICE_BNB)) {
      return { ok: false, details: { ...getPaymentDetails(), description: `Insufficient payment — need ${X402_PRICE_BNB} BNB` }, statusCode: 402 }
    }

    // Mark used — prevents replays
    usedTxHashes.add(txHash.toLowerCase())

    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      details: { ...getPaymentDetails(), description: `Payment verification error: ${(err as Error).message}` },
      statusCode: 402,
    }
  }
}
