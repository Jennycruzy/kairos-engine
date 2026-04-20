# KAIRÓS Engine v2

**Chain-Aware Meme Agent — BNB Chain / Four.Meme AI Sprint**

KAIRÓS is a fully autonomous AI agent with on-chain identity (ERC-8004), decentralized memory (BNB Greenfield), and two live operating modes: a pre-launch cultural advisor and a real-time graduation detector for Four.Meme bonding curves.

Live: **https://kairos-engine.duckdns.org**

---

## What it does

### Mode A — Launch Advisor
Founders submit a token concept (ticker + description) and receive a full cultural intelligence report:
- **Similarity audit** against 500+ previously rugged tokens (Levenshtein + OpenAI vector embeddings)
- **Sovereign identity** — Claude generates a mythological name, archetype, and lore paragraph
- **Ticker alternatives** — 3–5 unique ticker candidates with uniqueness scores
- **Risk score** — composite LOW / MEDIUM / HIGH rating
- Report archived permanently to **BNB Greenfield**

### Mode B — Graduation Detector
Argos watches Four.Meme bonding curves via Bitquery WebSocket streaming. When a token crosses 17.5 BNB:
1. **Themis** audits for cultural similarity and rug patterns
2. **Mnemon** calls Claude to forge the token's sovereign identity and lore
3. **Hermes** broadcasts a Farcaster Frame v2 (requires Neynar key)
4. **Agora** opens a human bounty — pay humans to post about the token
5. **Mnemosyne** archives the full graduation record to BNB Greenfield

---

## Skill Registry

| Skill | Role |
|-------|------|
| **Argos** | Bitquery WebSocket stream — watches Four.Meme DEX trades in real time |
| **Themis** | Cultural audit — similarity scoring via Levenshtein + OpenAI embeddings |
| **Mnemon** | Lore engine — Claude AI generates sovereign identities and mythological framing |
| **Hermes** | Farcaster broadcaster — publishes Frame v2 casts via Neynar |
| **Mnemosyne** | Greenfield archivist — seals all records to BNB Greenfield decentralized storage |
| **Launch Advisor** | Pre-launch oracle — full Mode A pipeline orchestrator |
| **Agora** | Human hiring protocol — creates BNB bounties, collects submissions, executes on-chain payouts |

---

## Agora — Human Hiring Protocol

When a token graduates, KAIRÓS automatically opens a bounty for human participants:

1. Agent creates a bounty post with the token's lore and a reward in BNB (~$0.10)
2. Bounty is capped (default: 5 slots)
3. Humans post about the token on X or Farcaster, then submit proof:

```bash
POST https://kairos-engine.duckdns.org/api/bounty/submit
Content-Type: application/json

{
  "bountyId": "<id from bounty URL>",
  "wallet": "0xYourBNBAddress",
  "postUrl": "https://x.com/yourpost"
}
```

4. Once all slots are filled, KAIRÓS automatically sends BNB to every wallet that submitted

Check bounty status:
```bash
GET https://kairos-engine.duckdns.org/api/bounty/<id>
```

**No Neynar account needed** to participate. Humans post on their own accounts and submit the link.

---

## Hiring KAIRÓS as an Agent — x402 Protocol

The `/api/analyze` endpoint is **x402-gated**. Other AI agents and developers can hire KAIRÓS to run a pre-launch advisory report by paying ~$0.10 in BNB.

### How to call it (one command)

**Step 1 — Send payment:**
Send `0.0003 BNB` to `0x69eb1bAA26BffCD0fA9089aa2187F6Ca3e2A54f6` on BNB Chain (chainId 56).

**Step 2 — Call the endpoint:**
```bash
curl -X POST https://kairos-engine.duckdns.org/api/analyze \
  -H "Content-Type: application/json" \
  -H "X-Payment-Transaction: 0xYOUR_TX_HASH" \
  -d '{
    "ticker": "ZEUS",
    "description": "Ancient god of thunder commanding storms and divine authority"
  }'
```

**Step 3 — Receive the report:**
```json
{
  "ok": true,
  "report": {
    "originalTicker": "ZEUS",
    "riskLevel": "MEDIUM",
    "originalityScore": 85,
    "similarityScore": 23,
    "culturalStrength": 24,
    "tickerUniqueness": 94,
    "successProbability": 61,
    "generatedLore": {
      "sovereignName": "Kronotheos the Thunder-Broken",
      "archetype": "The Fallen Sovereign",
      "loreParagraph": "..."
    },
    "suggestedTickers": [...]
  }
}
```

### x402 error response (no payment)
```json
{
  "error": "Payment required",
  "x402": {
    "network": "bsc",
    "chainId": 56,
    "token": "BNB",
    "amount": "0.0003",
    "recipient": "0x69eb1bAA26BffCD0fA9089aa2187F6Ca3e2A54f6",
    "instructions": "Send 0.0003 BNB to recipient, include tx hash in X-Payment-Transaction header"
  }
}
```

### For AI agents
Any agent that can read HTTP 402 responses and sign BNB transactions can autonomously hire KAIRÓS:
1. Detect 402 response
2. Parse `x402.recipient` and `x402.amount`
3. Send BNB transaction
4. Retry with `X-Payment-Transaction: <txHash>` header

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   KAIRÓS Engine v2                       │
│                                                          │
│  ERC-8004 Identity ──► BNB Greenfield Archive           │
│                                                          │
│  Mode B (live)              Mode A (on-demand)          │
│  ┌─────────────┐            ┌──────────────────┐        │
│  │ Argos       │            │ Launch Advisor   │        │
│  │ Bitquery WS │            │ x402-gated API   │        │
│  └──────┬──────┘            └────────┬─────────┘        │
│         │ graduation                 │ POST /analyze     │
│         ▼                            ▼                   │
│  ┌─────────────────────────────────────────────┐        │
│  │  Themis → Mnemon → Hermes → Agora → Archive │        │
│  └─────────────────────────────────────────────┘        │
│                      │                                   │
│              Agora Bounty                                │
│         humans post → submit proof → BNB paid           │
└─────────────────────────────────────────────────────────┘
```

---

## Setup

### Requirements
- Node.js 18+
- BNB wallet with gas (BNB Chain mainnet)

### Environment variables

```env
# Agent wallet
AGENT_OWNER_PRIVATE_KEY=0x...
AGENT_OWNER_ADDRESS=0x...

# AI
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# Bitquery streaming (free tier, ory_at_... OAuth token)
BITQUERY_API_KEY=ory_at_...

# BNB Greenfield
GREENFIELD_PRIVATE_KEY=0x...
GREENFIELD_ACCOUNT_ADDRESS=0x...

# Farcaster (optional — Hermes dry-runs without it)
NEYNAR_API_KEY=...
NEYNAR_SIGNER_UUID=...

# x402 gate — set true to bypass for local UI (false enables payment gate on /api/analyze)
X402_DISABLED=true

# Base URL (for bounty links)
NEXT_PUBLIC_BASE_URL=https://your-domain.com
```

### Run
```bash
npm install
npm run build
npm start
# or with PM2:
pm2 start npm --name kairos-engine -- start
```

---

## On-chain identity

Agent registered via **ERC-8004** on BNB Chain. Identity metadata sealed to **BNB Greenfield** on every boot.  
Registry: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`

---

## Farcaster Frames (Neynar)

Hermes broadcasts a Farcaster Frame v2 for each graduation event. This requires:
- A Neynar account at [neynar.com](https://neynar.com)
- `NEYNAR_API_KEY` and `NEYNAR_SIGNER_UUID` in `.env`

Without these, Hermes runs in dry-run mode and logs the frame but does not post.  
**The Agora bounty system works without Neynar** — humans find the bounty URL and post independently.

---

Built for the [Four.Meme AI Sprint](https://four.meme) — BNB Chain
