import { Hono } from 'hono';
import { AppBindings } from '../types';

export const erc8004Routes = new Hono<AppBindings>();

/**
 * GET /api/agent/:handle/registration.json
 * ERC-8004 compliant Agent Registration File
 * Public endpoint — no auth required
 * 
 * Spec: https://eips.ethereum.org/EIPS/eip-8004
 */
erc8004Routes.get('/:handle/registration.json', async (c) => {
  const handle = c.req.param('handle').toLowerCase();

  // Look up account
  const account = await c.env.DB.prepare(
    'SELECT handle, wallet, basename, created_at FROM accounts WHERE handle = ?'
  ).bind(handle).first<{ handle: string; wallet: string; basename: string | null; created_at: number }>();

  if (!account) {
    return c.json({ error: 'Agent not found' }, 404);
  }

  // Look up attention config
  const attention = await c.env.DB.prepare(
    'SELECT enabled, base_price FROM attention_config WHERE handle = ?'
  ).bind(handle).first<{ enabled: number; base_price: number }>();

  // Look up QAF score
  const qaf = await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT sender_handle) as unique_senders,
            SUM(amount_usdc) as total_bonds
     FROM attention_bonds WHERE recipient_handle = ? AND status = 'active'`
  ).bind(handle).first<{ unique_senders: number; total_bonds: number }>();

  // Look up email activity
  const emailStats = await c.env.DB.prepare(
    `SELECT 
       (SELECT COUNT(*) FROM emails WHERE handle = ? AND folder = 'inbox') as received,
       (SELECT COUNT(*) FROM emails WHERE handle = ? AND folder = 'sent') as sent`
  ).bind(handle, handle).first<{ received: number; sent: number }>();

  // Build ERC-8004 registration file
  const registration: Record<string, unknown> = {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: handle,
    description: `${handle} is an AI agent on BaseMail with a verifiable @basemail.ai email identity on Base chain.${
      attention?.enabled
        ? ` Attention Bonds enabled — stake ${attention.base_price} USDC to reach this agent. Powered by Connection-Oriented Quadratic Attention Funding (CO-QAF).`
        : ''
    }`,
    image: `https://basemail.ai/api/agent/${handle}/avatar`,
    services: [
      {
        name: 'email',
        endpoint: `${handle}@basemail.ai`,
      },
      {
        name: 'web',
        endpoint: `https://basemail.ai/dashboard`,
      },
      {
        name: 'BaseMail API',
        endpoint: 'https://api.basemail.ai/api/docs',
        version: '2.0.0',
      },
    ],
    x402Support: false,
    active: true,
    registrations: [],
    supportedTrust: ['reputation'],
  };

  // Add wallet info
  if (account.wallet) {
    (registration.services as Array<Record<string, string>>).push({
      name: 'wallet',
      endpoint: `eip155:8453:${account.wallet}`,
    });
  }

  // Add Basename / ENS
  if (account.basename) {
    (registration.services as Array<Record<string, string>>).push({
      name: 'ENS',
      endpoint: account.basename,
      version: 'v1',
    });
  }

  // Add attention bond info as custom extension
  if (attention?.enabled) {
    (registration as Record<string, unknown>).attentionBonds = {
      enabled: true,
      basePriceUsdc: attention.base_price,
      escrowContract: '0xF5fB1bb79D466bbd6F7588Fe57B67C675844C220',
      chain: 'eip155:8453',
      token: 'USDC',
      tokenContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      mechanism: 'CO-QAF (Connection-Oriented Quadratic Attention Funding)',
      paper: 'https://blog.juchunko.com/en/glen-weyl-coqaf-attention-bonds/',
      priceEndpoint: `https://api.basemail.ai/api/attention/price/${handle}`,
      coqafEndpoint: `https://api.basemail.ai/api/attention/coqaf/${handle}`,
    };
    (registration.supportedTrust as string[]).push('crypto-economic');
  }

  // Add reputation data
  if (qaf) {
    (registration as Record<string, unknown>).reputation = {
      source: 'BaseMail CO-QAF',
      uniqueSenders: qaf.unique_senders || 0,
      totalBondsUsdc: qaf.total_bonds || 0,
      emailsReceived: emailStats?.received || 0,
      emailsSent: emailStats?.sent || 0,
    };
  }

  c.header('Content-Type', 'application/json');
  c.header('Cache-Control', 'public, max-age=300'); // 5 min cache
  return c.json(registration);
});
