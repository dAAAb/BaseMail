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
