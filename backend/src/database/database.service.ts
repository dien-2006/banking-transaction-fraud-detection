import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';
import { JoblibFraudModel } from './joblib-model';
import type { AuthUser } from '../security/auth.guard';

export interface RequestContext { userId?: number; ipAddress?: string; risk?: boolean }
export interface AuthResult {
  actorType: 'customer' | 'employee';
  role: 'customer' | 'employee' | 'admin';
  customerId?: number;
  userId?: number;
  employeeId?: number;
  deviceId?: number;
  branchId?: number;
  code: string;
  name: string;
  email?: string;
  phone?: string;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool: Pool;
  private readonly cryptoReady = new WeakSet<PoolClient>();
  private readonly fraudModel: JoblibFraudModel;
  private readonly sourceTimezone: string;
  constructor(config: ConfigService) {
    this.fraudModel = new JoblibFraudModel(config);
    this.sourceTimezone = config.get<string>('SOURCE_TIMEZONE', 'Asia/Ho_Chi_Minh');
    this.pool = new Pool({
      host: config.get('POSTGRES_HOST', 'localhost'),
      port: config.get<number>('POSTGRES_INTERNAL_PORT', 5432),
      database: config.getOrThrow('POSTGRES_DB'),
      user: config.get<string>('BANKING_DB_USER') || config.getOrThrow('POSTGRES_USER'),
      password: config.get<string>('BANKING_DB_PASSWORD') || config.getOrThrow('POSTGRES_PASSWORD'),
      max: config.get<number>('POSTGRES_POOL_MAX', 20),
      statement_timeout: 15000,
      application_name: 'd4-bank-nest-api',
    });
  }

  async adminOverview<T = Record<string, unknown>>(branchId?: number): Promise<T> {
    const result = await this.pool.query<{ result: T }>(`
      WITH bounds AS (
        SELECT date_trunc('month', CURRENT_TIMESTAMP) AS month_start,
               date_trunc('month', CURRENT_TIMESTAMP) - interval '1 month' AS previous_start
      ), scoped_accounts AS (
        SELECT accountid FROM banking.bank_account
        WHERE $1::int IS NULL OR branchid = $1
      ), scoped_customers AS (
        SELECT c.customerid
        FROM banking.customer c
        WHERE $1::int IS NULL OR EXISTS (
          SELECT 1 FROM banking.account_holder ah JOIN scoped_accounts sa USING(accountid)
          WHERE ah.customerid=c.customerid AND ah.status='Active'
        )
      ), scoped_transactions AS (
        SELECT DISTINCT bt.transactionid
        FROM banking.bank_transaction bt
        WHERE $1::int IS NULL
           OR EXISTS (SELECT 1 FROM banking.transfer_request tr JOIN scoped_accounts sa ON sa.accountid IN (tr.sourceaccountid,tr.destinationaccountid) WHERE tr.transactionid=bt.transactionid)
           OR EXISTS (SELECT 1 FROM banking.transaction_posting tp JOIN scoped_accounts sa USING(accountid) WHERE tp.transactionid=bt.transactionid)
      ), scoped_loans AS (
        SELECT loanid FROM banking.loan WHERE $1::int IS NULL OR branchid = $1
      ), metrics AS (
        SELECT
          (SELECT count(*) FROM scoped_customers)::int AS customers_total,
          (SELECT count(*) FROM banking.customer c JOIN scoped_customers sc USING(customerid), bounds b WHERE c.createddate >= b.month_start)::int AS customers_current,
          (SELECT count(*) FROM banking.customer c JOIN scoped_customers sc USING(customerid), bounds b WHERE c.createddate >= b.previous_start AND c.createddate < b.month_start)::int AS customers_previous,
          (SELECT count(*) FROM scoped_accounts)::int AS accounts_total,
          (SELECT count(*) FROM banking.bank_account a JOIN scoped_accounts sa USING(accountid), bounds b WHERE a.opendate >= b.month_start::date)::int AS accounts_current,
          (SELECT count(*) FROM banking.bank_account a JOIN scoped_accounts sa USING(accountid), bounds b WHERE a.opendate >= b.previous_start::date AND a.opendate < b.month_start::date)::int AS accounts_previous,
          (SELECT count(*) FROM scoped_transactions)::int AS transactions_total,
          (SELECT count(*) FROM banking.bank_transaction t JOIN scoped_transactions st USING(transactionid), bounds b WHERE t.transactiondate >= b.month_start)::int AS transactions_current,
          (SELECT count(*) FROM banking.bank_transaction t JOIN scoped_transactions st USING(transactionid), bounds b WHERE t.transactiondate >= b.previous_start AND t.transactiondate < b.month_start)::int AS transactions_previous,
          (SELECT count(*) FROM scoped_loans)::int AS loans_total,
          (SELECT count(*) FROM banking.loan l JOIN scoped_loans sl USING(loanid), bounds b WHERE l.startdate >= b.month_start::date)::int AS loans_current,
          (SELECT count(*) FROM banking.loan l JOIN scoped_loans sl USING(loanid), bounds b WHERE l.startdate >= b.previous_start::date AND l.startdate < b.month_start::date)::int AS loans_previous,
          (SELECT count(DISTINCT r.transactionid) FROM banking.risk_assessment r JOIN scoped_transactions st USING(transactionid) WHERE r.decision IN ('REVIEW','BLOCK'))::int AS risks_total,
          (SELECT count(DISTINCT r.transactionid) FROM banking.risk_assessment r JOIN scoped_transactions st USING(transactionid), bounds b WHERE r.decision IN ('REVIEW','BLOCK') AND r.assessedat >= b.month_start)::int AS risks_current,
          (SELECT count(DISTINCT r.transactionid) FROM banking.risk_assessment r JOIN scoped_transactions st USING(transactionid), bounds b WHERE r.decision IN ('REVIEW','BLOCK') AND r.assessedat >= b.previous_start AND r.assessedat < b.month_start)::int AS risks_previous
      ), metric_rows AS (
        SELECT * FROM (VALUES
          ('customers','Tổng khách hàng',(SELECT customers_total FROM metrics),(SELECT customers_current FROM metrics),(SELECT customers_previous FROM metrics)),
          ('accounts','Tổng tài khoản',(SELECT accounts_total FROM metrics),(SELECT accounts_current FROM metrics),(SELECT accounts_previous FROM metrics)),
          ('transactions','Tổng giao dịch',(SELECT transactions_total FROM metrics),(SELECT transactions_current FROM metrics),(SELECT transactions_previous FROM metrics)),
          ('loans','Tổng khoản vay',(SELECT loans_total FROM metrics),(SELECT loans_current FROM metrics),(SELECT loans_previous FROM metrics)),
          ('risks','Giao dịch rủi ro',(SELECT risks_total FROM metrics),(SELECT risks_current FROM metrics),(SELECT risks_previous FROM metrics))
        ) AS x(key,label,total,current_period,previous_period)
      )
      SELECT jsonb_build_object(
        'generatedAt', clock_timestamp(),
        'customers', (SELECT customers_total FROM metrics),
        'activeAccounts', (SELECT count(*)::int FROM banking.bank_account a JOIN scoped_accounts sa USING(accountid) WHERE a.status='Active'),
        'transactionsToday', (SELECT count(*)::int FROM banking.bank_transaction t JOIN scoped_transactions st USING(transactionid) WHERE t.transactiondate >= CURRENT_DATE),
        'openReviews', (SELECT count(*)::int FROM banking.review_case r JOIN scoped_transactions st USING(transactionid) WHERE r.status IN ('OPEN','IN_REVIEW')),
        'kpis', (SELECT jsonb_agg(jsonb_build_object(
          'key',key,'label',label,'value',total,'currentPeriod',current_period,'previousPeriod',previous_period,
          'changePercent',CASE WHEN previous_period=0 THEN CASE WHEN current_period=0 THEN 0 ELSE 100 END
            ELSE round(((current_period-previous_period)::numeric/previous_period)*100,1) END
        ) ORDER BY CASE key WHEN 'customers' THEN 1 WHEN 'accounts' THEN 2 WHEN 'transactions' THEN 3 WHEN 'loans' THEN 4 ELSE 5 END) FROM metric_rows),
        'dailyTransactions', (SELECT COALESCE(jsonb_agg(jsonb_build_object('date',d.day::date,'count',COALESCE(t.count,0)) ORDER BY d.day),'[]'::jsonb)
          FROM generate_series(CURRENT_DATE-9,CURRENT_DATE,interval '1 day') d(day)
          LEFT JOIN (SELECT bt.transactiondate::date AS day,count(*)::int AS count FROM banking.bank_transaction bt
            JOIN scoped_transactions st USING(transactionid)
            WHERE bt.transactiondate >= CURRENT_DATE-9 GROUP BY bt.transactiondate::date) t USING(day)),
        'transactionTypes', (SELECT COALESCE(jsonb_agg(jsonb_build_object('code',typecode,'label',typename,'count',count) ORDER BY count DESC),'[]'::jsonb)
          FROM (SELECT tt.typecode,tt.typename,count(*)::int AS count FROM banking.bank_transaction bt
            JOIN scoped_transactions st USING(transactionid) JOIN banking.transaction_type tt USING(transactiontypeid), bounds b
            WHERE bt.transactiondate >= b.month_start GROUP BY tt.typecode,tt.typename) x),
        'transactionStatuses', (SELECT COALESCE(jsonb_agg(jsonb_build_object('status',status,'count',count) ORDER BY count DESC),'[]'::jsonb)
          FROM (SELECT bt.status,count(*)::int AS count FROM banking.bank_transaction bt JOIN scoped_transactions st USING(transactionid),bounds b
            WHERE bt.transactiondate >= b.month_start GROUP BY bt.status) x),
        'recentRisks', (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.assessed_at DESC),'[]'::jsonb) FROM (
          SELECT v.transactionid AS "transactionId",v.transactioncode AS "transactionCode",
            COALESCE(c.fullname,v.description,'Khách hàng #'||COALESCE(v.initiatedbycustomerid::text,'-')) AS customer,
            v.amount::float8 AS amount,v.rulescore::int AS "ruleScore",v.modelprobability::float8 AS "modelProbability",
            v.assessedat AS assessed_at,v.decision
          FROM banking.vw_transaction_detail v JOIN scoped_transactions st USING(transactionid) LEFT JOIN banking.customer c ON c.customerid=v.initiatedbycustomerid
          WHERE v.decision IN ('REVIEW','BLOCK') ORDER BY v.assessedat DESC NULLS LAST LIMIT 5) x),
        'pendingReviews', (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb) FROM (
          SELECT v.transactionid AS "transactionId",v.transactioncode AS "transactionCode",v.reviewcaseid AS "reviewId",
            COALESCE(c.fullname,v.description,'Khách hàng #'||COALESCE(v.initiatedbycustomerid::text,'-')) AS customer,
            v.amount::float8 AS amount,v.rulescore::int AS "ruleScore",v.modelprobability::float8 AS "modelProbability",
            v.reviewcreatedat AS created_at,v.decision
          FROM banking.vw_transaction_detail v JOIN scoped_transactions st USING(transactionid) LEFT JOIN banking.customer c ON c.customerid=v.initiatedbycustomerid
          WHERE v.reviewstatus IN ('OPEN','IN_REVIEW') ORDER BY v.reviewcreatedat DESC NULLS LAST LIMIT 5) x),
        'branches', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'branchId',b.branchid,'branchName',b.branchname,
          'customers',(SELECT count(DISTINCT ah.customerid)::int FROM banking.bank_account ba JOIN banking.account_holder ah USING(accountid) WHERE ba.branchid=b.branchid AND ah.status='Active'),
          'accounts',(SELECT count(*)::int FROM banking.bank_account ba WHERE ba.branchid=b.branchid),
          'transactions',(SELECT count(*)::int FROM banking.bank_transaction bt WHERE
            EXISTS(SELECT 1 FROM banking.transaction_posting tp JOIN banking.bank_account ba USING(accountid) WHERE tp.transactionid=bt.transactionid AND ba.branchid=b.branchid)
            OR EXISTS(SELECT 1 FROM banking.transfer_request tr JOIN banking.bank_account ba ON ba.accountid IN (tr.sourceaccountid,tr.destinationaccountid) WHERE tr.transactionid=bt.transactionid AND ba.branchid=b.branchid)),
          'loans',(SELECT count(*)::int FROM banking.loan l WHERE l.branchid=b.branchid),
          'risks',(SELECT count(DISTINCT ra.transactionid)::int FROM banking.risk_assessment ra WHERE ra.decision IN ('REVIEW','BLOCK') AND (
            EXISTS(SELECT 1 FROM banking.transaction_posting tp JOIN banking.bank_account ba USING(accountid) WHERE tp.transactionid=ra.transactionid AND ba.branchid=b.branchid)
            OR EXISTS(SELECT 1 FROM banking.transfer_request tr JOIN banking.bank_account ba ON ba.accountid IN (tr.sourceaccountid,tr.destinationaccountid) WHERE tr.transactionid=ra.transactionid AND ba.branchid=b.branchid)))
        ) ORDER BY b.branchid),'[]'::jsonb) FROM banking.branch b WHERE $1::int IS NULL OR b.branchid=$1),
        'recentActivities', (SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb) FROM (
          SELECT a.auditid AS "auditId",COALESCE(e.fullname,su.username,'System') AS actor,
            COALESCE(r.rolename,'Hệ thống') AS role,
            concat(a.action,' ',a.entitytype,' #',a.entityid) AS description,a.createdat AS created_at
          FROM banking.audit_log a LEFT JOIN banking.system_user su USING(userid)
          LEFT JOIN banking.employee e ON e.employeeid=su.employeeid
          LEFT JOIN banking.role r ON r.roleid=e.roleid
          WHERE $1::int IS NULL OR e.branchid=$1
          ORDER BY a.createdat DESC LIMIT 5) x)
      ) AS result
    `, [branchId ?? null]);
    return result.rows[0].result;
  }

  async authenticate(
    username: string,
    password: string,
    role: 'customer' | 'employee' | 'admin' | undefined,
    deviceCode: string | null,
    ipAddress: string | undefined,
  ): Promise<AuthResult> {
    const client = await this.pool.connect();
    let attemptedCustomerId: number | undefined;
    let attemptedDeviceId: number | undefined;
    try {
      await client.query('BEGIN');
      await this.setContext(client, { ipAddress });

      let resolvedRole = role;
      if (!resolvedRole) {
        const candidates = await client.query<{
          role: 'customer' | 'employee' | 'admin';
          customerid?: number;
          passwordvalid: boolean;
        }>(`
          SELECT 'customer'::text AS role, coa.customerid,
                 coa.passwordhash = public.crypt($2, coa.passwordhash) AS passwordvalid
          FROM banking.customer_online_account coa
          WHERE lower(coa.username) = lower(trim($1))
          UNION ALL
          SELECT CASE
                   WHEN lower(r.rolename) LIKE '%admin%'
                     OR r.rolename = 'Quản trị hệ thống' THEN 'admin'
                   ELSE 'employee'
                 END AS role,
                 NULL::bigint AS customerid,
                 su.passwordhash = public.crypt($2, su.passwordhash) AS passwordvalid
          FROM banking.system_user su
          JOIN banking.employee e USING (employeeid)
          JOIN banking.role r USING (roleid)
          WHERE lower(su.username) = lower(trim($1))
        `, [username, password]);
        attemptedCustomerId = candidates.rows.find((candidate) => candidate.customerid)?.customerid;
        const matches = candidates.rows.filter((candidate) => candidate.passwordvalid);
        if (matches.length === 0) throw new Error('AUTH_INVALID:Tên đăng nhập hoặc mật khẩu không chính xác');
        if (matches.length > 1) throw new Error('AUTH_AMBIGUOUS:Tên đăng nhập trùng giữa nhiều loại tài khoản');
        resolvedRole = matches[0].role;
      }

      if (resolvedRole === 'customer') {
        const result = await client.query<{
          onlineaccountid: number; customerid: number; isactive: boolean;
          customercode: string; fullname: string; status: string;
          email?: string; phone?: string; passwordvalid: boolean;
        }>(`
          SELECT coa.onlineaccountid, coa.customerid, coa.isactive,
                 c.customercode, c.fullname, c.status, c.email, c.phone,
                 coa.passwordhash = public.crypt($2, coa.passwordhash) AS passwordvalid
          FROM banking.customer_online_account coa
          JOIN banking.customer c USING (customerid)
          WHERE lower(coa.username) = lower(trim($1))
        `, [username, password]);
        const row = result.rows[0];
        if (!row) throw new Error('AUTH_INVALID:Tài khoản khách hàng không tồn tại');
        attemptedCustomerId = row.customerid;
        if (!row.passwordvalid) throw new Error('AUTH_INVALID:Mật khẩu không chính xác');
        if (!row.isactive || row.status !== 'Active') {
          throw new Error('AUTH_BLOCKED:Tài khoản đã bị khóa hoặc ngừng hoạt động');
        }

        let deviceId: number | undefined;
        if (deviceCode) {
          const device = await client.query<{ deviceid: number }>(`
            SELECT deviceid FROM banking.customer_device
            WHERE customerid = $1 AND devicecode = $2 AND status = 'Active'
          `, [row.customerid, deviceCode]);
          deviceId = device.rows[0]?.deviceid;
          attemptedDeviceId = deviceId;
        }
        await client.query(
          'UPDATE banking.customer_online_account SET lastlogin=clock_timestamp() WHERE onlineaccountid=$1',
          [row.onlineaccountid],
        );
        if (deviceId) {
          await client.query(
            'UPDATE banking.customer_device SET lastseenat=clock_timestamp() WHERE deviceid=$1',
            [deviceId],
          );
        }
        await client.query(`
          INSERT INTO banking.login_event(customerid,deviceid,ipaddress,status)
          VALUES($1,$2,$3,'Success')
        `, [row.customerid, deviceId ?? null, ipAddress ?? null]);
        await client.query('COMMIT');
        return {
          actorType: 'customer', role: 'customer', customerId: row.customerid,
          deviceId, code: row.customercode, name: row.fullname,
          email: row.email, phone: row.phone,
        };
      }

      const result = await client.query<{
        userid: number; isactive: boolean; employeeid: number; employeecode: string;
        fullname: string; status: string; email?: string; phone?: string;
        branchid: number; rolename: string; passwordvalid: boolean;
      }>(`
        SELECT su.userid, su.isactive, e.employeeid, e.employeecode,
               e.fullname, e.status, e.email, e.phone, e.branchid, r.rolename,
               su.passwordhash = public.crypt($2, su.passwordhash) AS passwordvalid
        FROM banking.system_user su
        JOIN banking.employee e USING (employeeid)
        JOIN banking.role r USING (roleid)
        WHERE lower(su.username) = lower(trim($1))
      `, [username, password]);
      const row = result.rows[0];
      if (!row) throw new Error('AUTH_INVALID:Tài khoản nhân viên không tồn tại');
      if (!row.passwordvalid) throw new Error('AUTH_INVALID:Mật khẩu không chính xác');
      if (!row.isactive || row.status !== 'Active') {
        throw new Error('AUTH_BLOCKED:Tài khoản đã bị khóa hoặc ngừng hoạt động');
      }
      const actualRole = row.rolename === 'Quản trị hệ thống' || row.rolename.toLowerCase().includes('admin')
        ? 'admin' : 'employee';
      if (resolvedRole !== actualRole) throw new Error('FORBIDDEN:Loại tài khoản đã chọn không đúng với vai trò của người dùng');
      await client.query(
        'UPDATE banking.system_user SET lastlogin=clock_timestamp() WHERE userid=$1',
        [row.userid],
      );
      await client.query('COMMIT');
      return {
        actorType: 'employee', role: actualRole, userId: row.userid,
        employeeId: row.employeeid, branchId: row.branchid,
        code: row.employeecode, name: row.fullname,
        email: row.email, phone: row.phone,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      if (attemptedCustomerId) {
        const message = error instanceof Error ? error.message : '';
        const status = message.startsWith('AUTH_BLOCKED:') ? 'Blocked' : 'Failed';
        await client.query(`
          INSERT INTO banking.login_event(customerid,deviceid,ipaddress,status,failurereason)
          VALUES($1,$2,$3,$4,$5)
        `, [
          attemptedCustomerId,
          attemptedDeviceId ?? null,
          ipAddress ?? null,
          status,
          message.slice(0, 255) || 'Authentication failed',
        ]).catch(() => undefined);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async function<T>(name: string, args: unknown[] = [], context: RequestContext = {}): Promise<T> {
    if (!/^banking_api\.[a-z0-9_]+$/.test(name)) throw new Error('Unsafe database function name');
    if (['banking_api.create_transfer', 'banking_api.create_account_movement', 'banking_api.pay_loan'].includes(name)) context = { ...context, risk: true };
    return this.transaction(context, async (client) => {
      if (context.risk) await this.prepareRisk(client, name, args);
      const placeholders = args.map((_, i) => `$${i + 1}`).join(', ');
      const result = await client.query<{ result: T }>(`SELECT ${name}(${placeholders}) AS result`, args);
      return result.rows[0]?.result;
    });
  }

  async isActorActive(user: AuthUser): Promise<boolean> {
    const result = user.role === 'customer'
      ? await this.pool.query(`SELECT 1 FROM banking.customer c
          JOIN banking.customer_online_account a USING(customerid)
          WHERE c.customerid=$1 AND c.status='Active' AND a.isactive
            AND ($2::bigint IS NULL OR EXISTS (SELECT 1 FROM banking.customer_device d
              WHERE d.deviceid=$2 AND d.customerid=c.customerid AND d.status='Active'))`, [user.customerId, user.deviceId ?? null])
      : await this.pool.query(`SELECT 1 FROM banking.system_user u
          JOIN banking.employee e USING(employeeid) JOIN banking.role r USING(roleid)
          WHERE u.userid=$1 AND e.employeeid=$2 AND u.isactive AND e.status='Active' AND r.status='Active'
          AND e.branchid=$3 AND (CASE WHEN lower(r.rolename) LIKE '%admin%' OR r.rolename='Quản trị hệ thống'
            THEN 'admin' ELSE 'employee' END)=$4`, [user.userId, user.employeeId, user.branchId, user.role]);
    return result.rows.length > 0;
  }

  async transaction<T>(context: RequestContext, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await this.ensureCryptoCompatibility(client);
      await client.query('BEGIN');
      await this.setContext(client, context);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  private async ensureCryptoCompatibility(client: PoolClient): Promise<void> {
    if (this.cryptoReady.has(client)) return;
    // The installed SQL functions intentionally search only banking + pg_temp,
    // while pgcrypto belongs to public. Session-local wrappers keep the database
    // schema unchanged and let those fixed functions resolve crypt/gen_salt.
    await client.query(`
      CREATE OR REPLACE FUNCTION pg_temp.crypt(text, text)
      RETURNS text LANGUAGE sql STRICT
      AS 'SELECT public.crypt($1, $2)';

      CREATE OR REPLACE FUNCTION pg_temp.gen_salt(text, integer)
      RETURNS text LANGUAGE sql STRICT
      AS 'SELECT public.gen_salt($1, $2)';
    `);
    this.cryptoReady.add(client);
  }

  private async setContext(client: PoolClient, context: RequestContext): Promise<void> {
    await client.query("SELECT set_config('TimeZone',$1,true)", [this.sourceTimezone]);
    await client.query("SELECT set_config('app.user_id', $1, true), set_config('app.ip_address', $2, true)",
      [context.userId?.toString() ?? '', context.ipAddress ?? '']);
    await client.query("SELECT set_config('app.fraud_model','',true)");
  }

  async prepareRisk(client: PoolClient, name: string, args: unknown[]): Promise<void> {
    let customer = args[0], source = args[1], amount = args[3], channel = args[5];
    let type: unknown = 'TRANSFER';
    if (name === 'banking_api.create_account_movement') {
      [type, customer, source, , amount] = args;
      channel = args[6];
      if (customer == null) {
        const ownerAccount = type === 'WITHDRAWAL' ? args[2] : args[3];
        const owner = await client.query(`SELECT customerid FROM banking.account_holder
          WHERE accountid=$1 AND status='Active' AND startdate<=CURRENT_DATE
          AND (enddate IS NULL OR enddate>=CURRENT_DATE)
          ORDER BY CASE holdertype WHEN 'PRIMARY_OWNER' THEN 0 ELSE 1 END,customerid LIMIT 1`, [ownerAccount]);
        customer = owner.rows[0]?.customerid;
      }
    } else if (name === 'banking_api.pay_loan') {
      customer = args[0]; source = args[3]; amount = args[5]; type = 'LOAN_PAYMENT';
      channel = args[7] === 'Counter' ? 'Counter' : 'InternetBanking';
    }
    if (customer == null) throw new Error('VALIDATION:Customer is required for inference');
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('risk-customer:'||$1::text,0))", [customer]);
    const clock = await client.query("SELECT clock_timestamp()::timestamp::text AS assessed_at");
    const request = { customerId: Number(customer), sourceAccountId: Number(source),
      amount: String(amount), channel, typeCode: type, assessedAt: clock.rows[0].assessed_at };
    const features = await client.query(`SELECT banking_api.joblib_features($1,$2,$3,$4,$5,$6) AS features`,
      [customer, source, amount, channel, type, request.assessedAt]);
    if (!features.rows[0]?.features) throw new Error('VALIDATION:Source account not found');
    const prediction = await this.fraudModel.predict(features.rows[0].features);
    const identity = await client.query(`SELECT modelversionid FROM banking.model_version
      WHERE modelname=$1 AND status='ACTIVE' ORDER BY modelversionid DESC LIMIT 1`, [prediction.databaseName]);
    if (!identity.rows.length) throw new Error('CONFIGURATION:Joblib artifact has no ACTIVE database identity; register it before deployment');
    await client.query("SELECT set_config('app.fraud_model',$1,true)", [JSON.stringify({
      engine: 'joblib', ...prediction, modelVersionId: identity.rows[0].modelversionid,
      request, modelFeatures: features.rows[0].features,
    })]);
  }
  async riskModelHealth() {
    const identity = await this.fraudModel.identity();
    const row = await this.pool.query("SELECT modelversionid FROM banking.model_version WHERE modelname=$1 AND status='ACTIVE' LIMIT 1", [identity.databaseName]);
    if (!row.rows.length) throw new Error('CONFIGURATION:Online joblib identity is not ACTIVE');
    return { engine: 'joblib', version: identity.version, modelVersionId: row.rows[0].modelversionid };
  }
  async onModuleDestroy(): Promise<void> { this.fraudModel.close(); await this.pool.end(); }
}
