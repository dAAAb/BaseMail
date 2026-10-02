/**
 * Clone an `accounts` row under a new handle (used by Basename upgrade and
 * primary-handle switch, which insert the new row before deleting the old one).
 *
 * Copies every column the old row has — credits, tier, is_human,
 * notification_email, … — so changing handle never resets per-account state.
 * Previously only 6 hard-coded columns were copied and a freshly registered
 * agent that upgraded to a Basename lost its 10 free credits.
 *
 * Column names come from the row D1 returned, never from user input.
 */
export function cloneAccountRow(
  db: D1Database,
  row: Record<string, unknown>,
  overrides: { handle: string; wallet: string; basename: string | null },
): D1PreparedStatement {
  const data: Record<string, unknown> = { ...row, ...overrides };
  const cols = Object.keys(data);
  return db.prepare(
    `INSERT INTO accounts (${cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ')})
     VALUES (${cols.map(() => '?').join(', ')})`,
  ).bind(...cols.map((c) => data[c] ?? null));
}

/** Every (table, column) that stores an accounts.handle and must follow a handle change. */
const HANDLE_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ['emails', 'handle'],
  ['refresh_tokens', 'handle'],
  ['api_keys', 'handle'],
  ['attention_config', 'handle'],
  ['attention_bonds', 'sender_handle'],
  ['attention_bonds', 'recipient_handle'],
  ['attention_whitelist', 'recipient_handle'],
  ['sender_reputation', 'sender_handle'],
  ['sender_reputation', 'recipient_handle'],
  ['qaf_scores', 'handle'],
  ['credit_transactions', 'handle'],
  ['webhooks', 'handle'],
  ['world_id_verifications', 'handle'],
  ['escrow_claims', 'sender_handle'],
  ['escrow_claims', 'claimer_handle'],
  ['attn_balances', 'handle'],
  ['attn_settings', 'handle'],
  ['attn_escrow', 'sender_handle'],
  ['attn_escrow', 'receiver_handle'],
  ['attn_airdrop_claims', 'handle'],
];

/**
 * A row left behind by the pre-2026-10 handle-change code, which inserted the
 * new row (wallet = UPGRADE_<ms> / SWITCH_<ms>) outside the migration batch:
 * when the batch failed the placeholder stayed and blocked the handle forever.
 * Callers that have verified the requester owns the name may replace it.
 */
export function isStaleHandlePlaceholder(wallet: string): boolean {
  return /^(UPGRADE|SWITCH|MOVING)_\d+$/.test(wallet);
}

/**
 * Move an account to a new handle (Basename upgrade, primary-handle switch).
 *
 * Runs as ONE atomic D1 batch — if any statement fails nothing changes, so a
 * failure can always be retried. Foreign keys are deferred to commit because
 * basename_aliases references accounts(wallet) and the wallet briefly lives on
 * a placeholder while the old row is deleted. Tables that don't exist in this
 * database are skipped (prod has never created e.g. `webhooks`).
 *
 * `extra` statements run inside the same transaction, after the move.
 */
export async function moveAccountHandle(
  db: D1Database,
  oldRow: Record<string, unknown>,
  opts: {
    newHandle: string;
    basename: string | null;
    /** wallet of a stale placeholder currently holding newHandle, to replace */
    replaceStaleWallet?: string;
    extra?: D1PreparedStatement[];
  },
): Promise<{ migratedEmails: number }> {
  const oldHandle = String(oldRow.handle);
  const wallet = String(oldRow.wallet);
  const { newHandle } = opts;

  const tables = new Set(
    (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all<{ name: string }>())
      .results.map((r) => r.name),
  );
  const childUpdates = HANDLE_COLUMNS
    .filter(([t]) => tables.has(t))
    .map(([t, col]) => db.prepare(`UPDATE ${t} SET ${col} = ? WHERE ${col} = ?`).bind(newHandle, oldHandle));

  const stmts: D1PreparedStatement[] = [db.prepare('PRAGMA defer_foreign_keys = on')];
  if (opts.replaceStaleWallet) {
    stmts.push(db.prepare('DELETE FROM accounts WHERE handle = ? AND wallet = ?').bind(newHandle, opts.replaceStaleWallet));
  }
  // Placeholder wallet: accounts.wallet is UNIQUE and UNIQUE can't be deferred.
  stmts.push(cloneAccountRow(db, oldRow, { handle: newHandle, wallet: `MOVING_${Date.now()}`, basename: opts.basename }));
  const emailsIdx = stmts.length; // HANDLE_COLUMNS[0] is emails, which always exists
  stmts.push(
    ...childUpdates,
    db.prepare('DELETE FROM accounts WHERE handle = ?').bind(oldHandle),
    db.prepare('UPDATE accounts SET wallet = ? WHERE handle = ?').bind(wallet, newHandle),
    ...(opts.extra ?? []),
  );

  const results = await db.batch(stmts);
  return { migratedEmails: results[emailsIdx]?.meta?.changes ?? 0 };
}
