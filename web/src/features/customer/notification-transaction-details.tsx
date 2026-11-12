"use client";
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSessionUser } from '@/components/session-context';
import { TransactionRecordResult } from '@/components/transaction-result';
import { bankService } from '@/services/bank.service';
import { useCustomerAccounts } from './customer-queries';
import { CustomerEmpty, CustomerLoading } from './customer-ui';

export function NotificationTransactionDetails({id}:{id:number}) {
  const user=useSessionUser(),accounts=useCustomerAccounts();
  const detail=useQuery({queryKey:['customer',user.id,'transaction-detail',id],queryFn:()=>bankService.customerTransaction(id),staleTime:0,refetchOnMount:'always',refetchInterval:15_000,retry:false});
  if(detail.isPending)return <CustomerLoading/>;
  if(detail.isError)return <CustomerEmpty error retry={()=>void detail.refetch()}>{detail.error instanceof Error?detail.error.message:'Không thể tải thông tin giao dịch.'}</CustomerEmpty>;
  const {transaction,transfer}=detail.data;
  const source=accounts.data?.find(row=>row.accountid===transaction.sourceaccountid);
  const destination=accounts.data?.find(row=>row.accountid===transaction.destinationaccountid);
  const details:ReadonlyArray<readonly[string,string]>=transfer?[
    ['Người chuyển',transfer.sourceAccountName??'Chưa có thông tin'],
    ['Tài khoản nhận',transfer.destinationAccountNumber??'Chưa có thông tin'],
    ['Chủ tài khoản nhận',transfer.destinationAccountName??'Chưa có thông tin'],
    ['Ngân hàng','D4 Bank'],
  ]:[];
  return <div className="notice-transaction-details">
    <TransactionRecordResult transaction={transaction} account={transfer?(transfer.sourceAccountNumber??'Chưa có thông tin'):(source?.accountnumber??destination?.accountnumber??'Chưa có thông tin')} accountLabel={transfer?'Từ tài khoản':'Tài khoản'} staffDetails={details}/>
    {transfer&&<p className="text-xs text-slate-500 mt-3">Tên chủ tài khoản theo hồ sơ hiện tại của ngân hàng.</p>}
    <Link className="btn-secondary mt-4" href="/customer/transactions">Mở danh sách giao dịch</Link>
  </div>;
}
