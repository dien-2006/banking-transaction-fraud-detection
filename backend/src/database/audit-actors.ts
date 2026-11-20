import type { PoolClient } from 'pg';

/** Enrich only the already authorized audit page. NULL userid is absence of
 * attribution, not proof of a system actor. Never rewrite historical records. */
export async function attachAuditActors(client: PoolClient, page: unknown, sourceTimezone: string): Promise<void> {
  if (!page || typeof page !== 'object' || !('items' in page) || !Array.isArray(page.items) || !page.items.length) return;
  const items = page.items as Record<string, unknown>[];
  const result = await client.query(`SELECT a.auditid,e.fullname AS actor_name,e.employeecode AS actor_code,
      a.createdat AT TIME ZONE $2 AS occurred_at
    FROM banking.audit_log a
    LEFT JOIN banking.system_user u ON u.userid=a.userid
    LEFT JOIN banking.employee e ON e.employeeid=u.employeeid
    WHERE a.auditid=ANY($1::bigint[])`, [items.map(item=>item.auditid),sourceTimezone]);
  const metadata = new Map(result.rows.map(row=>[String(row.auditid),row]));
  for(const item of items) {
    const actor = metadata.get(String(item.auditid));
    item.actor_name = item.userid == null ? null : actor?.actor_name ?? null;
    item.actor_code = item.userid == null ? null : actor?.actor_code ?? null;
    item.actor_type = item.userid == null ? 'UNRECORDED' : 'STAFF';
    if (actor?.occurred_at instanceof Date) item.createdat = actor.occurred_at.toISOString();
  }
}
