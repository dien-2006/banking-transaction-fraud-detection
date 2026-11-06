import { Pool, PoolClient } from 'pg';
import { DeliveryRetry } from './delivery-retry';
const retries = new DeliveryRetry();

interface Notification {notificationoutboxid:number;customerid:number;transactionid?:number;notificationtype:string}
interface Customer {email?:string;fullname?:string}
interface Transaction {transactioncode?:string;amount?:string;currency?:string;status?:string}

const pool=new Pool({host:process.env.POSTGRES_HOST??'localhost',port:Number(process.env.POSTGRES_INTERNAL_PORT??process.env.POSTGRES_PORT??5432),database:process.env.POSTGRES_DB,user:process.env.NOTIFICATION_DB_USER||process.env.POSTGRES_USER,password:process.env.NOTIFICATION_DB_PASSWORD||process.env.POSTGRES_PASSWORD,max:2,application_name:'d4-bank-notification-sender'});
const interval=Number(process.env.NOTIFICATION_POLL_INTERVAL_MS??3000);

async function sendEmail(notification:Notification,customer:Customer,transaction:Transaction|null):Promise<void>{
  const apiKey=process.env.BREVO_API_KEY,sender=process.env.OTP_SENDER_EMAIL;
  if(!apiKey||!sender)throw new Error('Brevo email provider is not configured');
  if(!customer.email)throw new Error('Customer email is not configured');
  const label:Record<string,string>={TRANSACTION_COMPLETED:'Giao dịch thành công',TRANSACTION_FAILED:'Giao dịch thất bại',TRANSACTION_BLOCKED:'Giao dịch bị chặn',TRANSACTION_UNDER_REVIEW:'Giao dịch đang được kiểm tra',TRANSACTION_REJECTED:'Giao dịch bị từ chối'};
  const subject=label[notification.notificationtype]??'Thông báo từ D4 Bank';
  const detail=transaction?`\nMã giao dịch: ${transaction.transactioncode??notification.transactionid}\nSố tiền: ${transaction.amount??'-'} ${transaction.currency??'VND'}\nTrạng thái: ${transaction.status??'-'}`:'';
  const response=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',signal:AbortSignal.timeout(10000),headers:{accept:'application/json','api-key':apiKey,'content-type':'application/json'},body:JSON.stringify({sender:{email:sender,name:process.env.OTP_SENDER_NAME??'D4 Bank'},to:[{email:customer.email,name:customer.fullname??'Quý khách'}],subject,textContent:`Xin chào ${customer.fullname??'Quý khách'},\n\n${subject}.${detail}\n\nNếu bạn không thực hiện giao dịch này, hãy liên hệ ngân hàng ngay.`})});
  if(!response.ok)throw new Error(`Brevo HTTP ${response.status}`);
}

async function value<T>(client:PoolClient,sql:string,args:unknown[]):Promise<T>{const result=await client.query<{result:T}>(sql,args);return result.rows[0]?.result;}
async function processBatch():Promise<number>{
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query("SELECT set_config('TimeZone',$1,true)",[process.env.SOURCE_TIMEZONE??'Asia/Ho_Chi_Minh']);
    const claimed=await client.query<Notification>('SELECT * FROM banking_api.claim_ready_notifications($1,$2::bigint[])',[Number(process.env.NOTIFICATION_BATCH_SIZE??20),retries.excluded()]);
    for(const notification of claimed.rows){
      try{
        const customer=await value<Customer>(client,'SELECT banking_api.get_customer_profile($1) AS result',[notification.customerid]);
        const transaction=notification.transactionid?await value<Transaction|null>(client,'SELECT banking_api.get_transaction($1, NULL::BIGINT) AS result',[notification.transactionid]):null;
        await sendEmail(notification,customer,transaction);
        await client.query('SELECT banking_api.mark_notification_sent($1)',[notification.notificationoutboxid]);
        retries.succeeded(notification.notificationoutboxid);
      }catch(error){await client.query('SELECT banking_api.mark_notification_failed($1)',[notification.notificationoutboxid]);const paused=retries.failed(notification.notificationoutboxid);console.error('notification_delivery_failed',{notificationId:notification.notificationoutboxid,paused,errorType:error instanceof Error?error.name:'UnknownError'});}
    }
    await client.query('COMMIT');return claimed.rowCount??0;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
async function main():Promise<void>{for(;;){try{await processBatch();}catch(error){console.error('notification_worker_failed',error);}await new Promise(resolve=>setTimeout(resolve,interval));}}
async function shutdown():Promise<void>{await pool.end();process.exit(0);}
process.on('SIGTERM',()=>void shutdown());process.on('SIGINT',()=>void shutdown());void main();
