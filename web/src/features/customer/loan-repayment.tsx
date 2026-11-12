"use client";
import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TransactionResult } from "@/components/transaction-result";
import { useSessionUser } from "@/components/session-context";
import { ApiError } from "@/services/api.client";
import { bankService, type ApiLoan, type ApiTransaction, type LoanPaymentInput } from "@/services/bank.service";
import { formatDateTime } from "@/lib/presentation";
import { customerDate, formatVnd } from "@/lib/customer-data";
import { useCustomerAccounts } from "./customer-queries";
import "./loan-repayment.css";

type PaymentDraft = {input:LoanPaymentInput;accountNumber:string;installmentNo:number};
function paymentCode() {
  return "LP-"+Array.from(crypto.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,"0")).join("");
}
export function LoanRepayment({loan,hidden,onReveal,onBusyChange}:{loan:ApiLoan;hidden:boolean;onReveal:()=>void;onBusyChange:(busy:boolean)=>void}) {
  const user=useSessionUser(), client=useQueryClient(), accounts=useCustomerAccounts();
  const options=useQuery({queryKey:["customer",user.id,"loan-payment-options",loan.loanid],queryFn:()=>bankService.loanPaymentOptions(loan.loanid),refetchInterval:15_000});
  const [sourceId,setSourceId]=useState(""),[scheduleId,setScheduleId]=useState("");
  const [draft,setDraft]=useState<PaymentDraft|null>(null),[result,setResult]=useState<ApiTransaction|null>(null);
  const [busy,setBusy]=useState(false),[failure,setFailure]=useState<unknown>(null);
  const sending=useRef(false);
  const sources=(accounts.data??[]).filter(row=>row.status==="Active"&&row.currency==="VND"&&row.accountcategory==="CUSTOMER");
  const source=sources.find(row=>String(row.accountid)===sourceId);
  const schedule=options.data?.schedules.find(row=>String(row.scheduleId)===scheduleId);
  const insufficient=!!source&&!!schedule&&Number(source.availablebalance)<Number(schedule.total);
  const canPrepare=options.isSuccess&&accounts.isSuccess&&options.data.ready&&!!source&&!!schedule&&!schedule.pendingPayment&&Number(schedule.total)>0&&!insufficient;
  const refresh=()=>void client.invalidateQueries({queryKey:["customer",user.id]});
  const prepare=(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(!canPrepare||!source||!schedule)return;
    setFailure(null);setResult(null);
    setDraft({input:{loanId:loan.loanid,scheduleId:schedule.scheduleId,sourceAccountId:source.accountid,amount:schedule.total,transactionCode:paymentCode()},accountNumber:source.accountnumber,installmentNo:schedule.installmentNo});
  };
  const pay=async()=>{
    if(!draft||sending.current)return;
    sending.current=true;setBusy(true);onBusyChange(true);setFailure(null);
    try{setResult(await bankService.payLoan(draft.input));}
    catch(error){setFailure(error);}
    finally{sending.current=false;setBusy(false);onBusyChange(false);refresh();}
  };
  const rejected=failure instanceof ApiError&&[400,401,403,404,409,422].includes(failure.status);
  return <section className="loan-repayment" aria-labelledby={`loan-payment-title-${loan.loanid}`}>
    <h3 id={`loan-payment-title-${loan.loanid}`}>Thanh toán khoản vay</h3>
    {draft&&(result||failure)?<TransactionResult operation="Thanh toán khoản vay" status={result?.status} decision={result?.decision} error={failure??undefined}
      amount={formatVnd(draft.input.amount)} reference={result?.transactioncode} time={result?formatDateTime(result.transactiondate):undefined}
      details={[["Mã khoản vay",loan.loancode],["Kỳ thanh toán",String(draft.installmentNo)],["Từ tài khoản",draft.accountNumber]]} historyHref="/customer/transactions"
      actions={!result&&failure?<button type="button" className="btn-secondary" disabled={busy} onClick={rejected?()=>{setDraft(null);setFailure(null);void options.refetch();}:()=>void pay()}>{busy?"Đang xử lý…":rejected?"Kiểm tra lại thông tin":"Thử lại đúng lệnh"}</button>:result?<button type="button" className="btn-secondary" onClick={()=>{setDraft(null);setResult(null);setScheduleId("");void options.refetch();}}>Quay lại lịch trả nợ</button>:undefined}
    />:draft?<div className="loan-payment-confirm">
      <h4>Xác nhận trả nợ</h4>
      <dl><div><dt>Khoản vay</dt><dd>{loan.loancode}</dd></div><div><dt>Kỳ thanh toán</dt><dd>{draft.installmentNo}</dd></div><div><dt>Tài khoản trích tiền</dt><dd>{draft.accountNumber}</dd></div><div><dt>Số tiền thanh toán</dt><dd>{formatVnd(draft.input.amount)}</dd></div></dl>
      <p>Tiền chỉ được ghi nhận trả nợ khi giao dịch hoàn tất thành công. Giao dịch có thể cần nhân viên kiểm tra.</p>
      <footer><button type="button" className="btn-secondary" disabled={busy} onClick={()=>setDraft(null)}>Quay lại</button><button type="button" className="btn-primary" disabled={busy} onClick={()=>void pay()}>{busy?"Đang thanh toán…":"Xác nhận trả nợ"}</button></footer>
    </div>:hidden?<p>Thông tin đang được ẩn. <button type="button" className="btn-secondary" onClick={onReveal}>Hiện thông tin để thanh toán</button></p>
    :options.isPending||accounts.isPending?<p role="status">Đang tải thông tin thanh toán…</p>
    :options.isError||accounts.isError?<p role="alert">Không thể tải thông tin thanh toán. <button type="button" className="btn-secondary" onClick={()=>{void options.refetch();void accounts.refetch();}}>Thử lại</button></p>
    :!options.data||!["Active","Overdue"].includes(options.data.status)?<p className="loan-payment-notice">{options.data?.unavailableReason??"Chưa thể thanh toán khoản vay này."}</p>
    :!options.data.schedules.length?<p>Không còn kỳ trả nợ chưa thanh toán.</p>
    :<form onSubmit={prepare}>
      {!options.data.ready&&<p className="loan-payment-notice" role="status">{options.data.unavailableReason}</p>}
      <p>Chọn kỳ cần trả và tài khoản nguồn. Số tiền được đối chiếu từ lịch trả nợ và các lần thanh toán đã ghi nhận.</p>
      <div className="loan-payment-fields">
        <label>Kỳ thanh toán *<select aria-label="Kỳ thanh toán *" required value={scheduleId} onChange={event=>setScheduleId(event.target.value)}><option value="">Chọn kỳ cần thanh toán</option>{options.data.schedules.map(row=><option key={row.scheduleId} value={row.scheduleId} disabled={row.pendingPayment||Number(row.total)<=0}>Kỳ {row.installmentNo} · {customerDate(row.dueDate)}{row.pendingPayment?" · Đang chờ xử lý":""}</option>)}</select></label>
        <label>Tài khoản nguồn *<select aria-label="Tài khoản nguồn *" required value={sourceId} onChange={event=>setSourceId(event.target.value)}><option value="">Chọn tài khoản trích tiền</option>{sources.map(row=><option key={row.accountid} value={row.accountid}>{row.accountnumber}</option>)}</select></label>
      </div>
      {source&&<p>Số dư khả dụng: <strong>{formatVnd(source.availablebalance)}</strong></p>}
      {schedule&&<dl className="loan-payment-breakdown"><div><dt>Gốc còn lại</dt><dd>{formatVnd(schedule.principal)}</dd></div><div><dt>Lãi còn lại</dt><dd>{formatVnd(schedule.interest)}</dd></div><div><dt>Phí phạt còn lại</dt><dd>{formatVnd(schedule.penalty)}</dd></div><div><dt>Tổng thanh toán</dt><dd>{formatVnd(schedule.total)}</dd></div></dl>}
      {insufficient&&<p role="alert" className="loan-payment-notice">Tài khoản không đủ số dư khả dụng. Vui lòng chọn tài khoản khác.</p>}
      {!sources.length&&<p className="loan-payment-notice">Bạn chưa có tài khoản VND đang hoạt động để trả nợ.</p>}
      {schedule?.pendingPayment&&<p role="status">Kỳ này đã có giao dịch đang xử lý. Theo dõi kết quả trong lịch sử.</p>}
      <footer><button type="submit" className="btn-primary" disabled={!canPrepare}>Tiếp tục thanh toán</button></footer>
    </form>}
  </section>;
}
