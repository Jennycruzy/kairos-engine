export const ERC8004_ABI = [
  // ─── REGISTRATION ──────────────────────────────────────────────────────────
  {
    name: 'registerAgent',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'metadataURI', type: 'string' },
      { name: 'owner', type: 'address' }
    ],
    outputs: [{ name: 'agentId', type: 'bytes32' }]
  },

  // ─── RESOLUTION ────────────────────────────────────────────────────────────
  {
    name: 'resolveAgent',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'bytes32' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'metadataURI', type: 'string' },
      { name: 'registeredAt', type: 'uint256' },
      { name: 'isActive', type: 'bool' }
    ]
  },

  // ─── OWNERSHIP ─────────────────────────────────────────────────────────────
  {
    name: 'getAgentsByOwner',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: 'agentIds', type: 'bytes32[]' }]
  },

  // ─── METADATA UPDATE ───────────────────────────────────────────────────────
  {
    name: 'updateMetadataURI',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'bytes32' },
      { name: 'newMetadataURI', type: 'string' }
    ],
    outputs: []
  },

  // ─── DEACTIVATION ──────────────────────────────────────────────────────────
  {
    name: 'deactivateAgent',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'agentId', type: 'bytes32' }],
    outputs: []
  },

  // ─── EVENTS ────────────────────────────────────────────────────────────────
  {
    name: 'AgentRegistered',
    type: 'event',
    inputs: [
      { name: 'agentId', type: 'bytes32', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'metadataURI', type: 'string', indexed: false },
      { name: 'registeredAt', type: 'uint256', indexed: false }
    ]
  },
  {
    name: 'AgentUpdated',
    type: 'event',
    inputs: [
      { name: 'agentId', type: 'bytes32', indexed: true },
      { name: 'newMetadataURI', type: 'string', indexed: false }
    ]
  },
  {
    name: 'AgentDeactivated',
    type: 'event',
    inputs: [
      { name: 'agentId', type: 'bytes32', indexed: true }
    ]
  }
] as const
