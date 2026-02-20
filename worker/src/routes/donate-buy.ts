import { Hono } from 'hono';
import { createPublicClient, http, parseAbi, formatEther } from 'viem';
import { base } from 'viem/chains';
import { AppBindings } from '../types';

const DONATE_BUY = '0x8b10c4D29C99Eac19Edc59C4fac790518b815DE7';
const ONE_YEAR = BigInt(365 * 24 * 60 * 60);

const abi = parseAbi([
  'function quote(string name, uint256 duration) view returns (uint256 price, uint256 donation, uint256 total)',
  'function donationBps() view returns (uint256)',
]);

export const donateBuyRoutes = new Hono<AppBindings>();

/**
 * GET /api/donate-buy/quote/:name
 * Get the total cost for a Donate Buy (price + 15% donation)
 * Public endpoint — no auth required
 */
donateBuyRoutes.get('/quote/:name', async (c) => {
  const name = c.req.param('name').toLowerCase();
  const years = parseInt(c.req.query('years') || '1');
  const duration = ONE_YEAR * BigInt(years);

  const client = createPublicClient({ chain: base, transport: http('https://base.publicnode.com') });

  try {
    const [price, donation, total] = await client.readContract({
      address: DONATE_BUY, abi, functionName: 'quote', args: [name, duration],
    });
    const bps = await client.readContract({ address: DONATE_BUY, abi, functionName: 'donationBps' });

    return c.json({
      name,
      basename: `${name}.base.eth`,
      years,
      price_wei: price.toString(),
      price_eth: formatEther(price),
      donation_wei: donation.toString(),
      donation_eth: formatEther(donation),
      donation_pct: `${Number(bps) / 100}%`,
      total_wei: total.toString(),
      total_eth: formatEther(total),
      contract: DONATE_BUY,
      chain_id: 8453,
      method: 'donateBuy(string name, address recipient, uint256 duration, bytes[] resolverData)',
      note: 'Call donateBuy() with msg.value >= total_wei. Basename mints to recipient. Donation goes to BaseMail treasury.',
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
