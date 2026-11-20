"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui";
import { TransactionResult } from "@/components/transaction-result";
import { useSessionUser } from "@/components/session-context";
import { bankService, type LoanDecisionInput, type LoanDecisionResult } from "@/services/bank.service";
import { ApiError } from "@/services/api.client";
import { recoverLoanDecision } from "@/lib/loan-state";
import { newRequestKey } from "@/lib/request-key";
import "../customer/product-application-dialog.css";

export function LoanDecisionButtons({id,code,customer,amount,autoOpen=false,actionable=true,onClosed}:{id:number;code:string;customer:string;amount:string;autoOpen?:boolean;actionable?:boolean;onClosed?:()=>void}) {
  const client=useQueryClient(),user=useSessionUser();
  const sending=useRef(false);
  const [decision,setDecision]=useState<"APPROVE"|"REJECT"|null>(autoOpen?"APPROVE":null);
  const [reason,setReason]=useState(""),[accountId,setAccountId]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null);
  const [draft,setDraft]=useState<LoanDecisionInput|null>(null),[result,setResult]=useState<LoanDecisionResult|null>(null);
  useEffect(()=>{if(autoOpen)setDecision("APPROVE");},[autoOpen]);
  const options=useQuery({queryKey:["loan-disbursement-options",user.id,id],queryFn:()=>bankService.loanDisbursementOptions(id),enabled:!!decision,refetchInterval:15_000});
  useEffect(()=>{
    const confirmed=recoverLoanDecision(id,options.data,draft);
    if(confirmed){
      const receipt=confirmed.disbursement!;
      setResult(receipt.failureCode==='INSUFFICIENT_BALANCE'?{...confirmed,disbursement:{...receipt,failureReason:
        'Tài khoản nguồn ngân hàng không đủ số dư khả dụng để giải ngân. Khoản vay chưa được kích hoạt và tiền chưa được cộng vào tài khoản người vay.'}}:confirmed);
      setError(null);
    }
  },[options.data,draft,id]);
  const review=options.data?.disbursement?.reviewcaseid??result?.disbursement?.reviewcaseid;
  const reviewHref=`/${user.role==="admin"?"admin":"employee"}/fraud${review?`?reviewId=${review}`:""}`;
  const refresh=async()=>{
    await Promise.all([client.invalidateQueries({queryKey:["staff-loans"]}),client.invalidateQueries({queryKey:["staff-accounts"]}),client.invalidateQueries({queryKey:["staff-transactions"]}),options.refetch()]);
  };
  const open=()=>{setDecision("APPROVE");setError(null);setReason("");setAccountId("");setDraft(null);setResult(null);void options.refetch();};
  const submit=async(input:LoanDecisionInput)=>{
    if(sending.current)return;sending.current=true;setBusy(true);setError(null);setDraft(input);
    try{setResult(await bankService.decideLoan(id,input));}
    catch(caught){setError(caught);}
    finally{try{await refresh();}catch{/* The recorded result stays visible if refreshing the list fails. */}finally{sending.current=false;setBusy(false);}}
  };
  const close=()=>{if(!busy){setDecision(null);onClosed?.();}};
  const rejected=error instanceof ApiError&&[400,401,403,404,409,422].includes(error.status);
  const reset=()=>{setDraft(null);setResult(null);setError(null);void options.refetch();};
  return <>
    {actionable&&<button className="d4-view-button" onClick={open}>Xử lý</button>}
    <Modal open={!!decision} onOpenChange={value=>{if(!value)close();}} title="Xử lý hồ sơ vay" description="Kiểm tra hồ sơ và chọn tài khoản nhận tiền của khách hàng trước khi xác nhận." className="product-application-dialog loan-decision-dialog">
      {result?.disbursement?<div className="loan-decision-result"><TransactionResult operation="Giải ngân khoản vay" status={result.disbursement.status} error={result.disbursement.failureReason?new Error(result.disbursement.failureReason):undefined} decision={result.disbursement.decision} amount={amount} reference={result.disbursement.transactioncode}
        details={[["Mã khoản vay",code],["Khách hàng",customer],["Tài khoản nhận",options.data?.accounts.find(a=>Number(a.accountId)===draft?.destinationAccountId)?.accountNumber??"Xem chứng từ giao dịch"]]}
        actions={<>{result.disbursement.status==="Pending"&&review&&<Link className="btn-secondary" href={reviewHref}>Xem hồ sơ review</Link>}{["Failed","Cancelled"].includes(result.disbursement.status)&&<button className="btn-secondary" onClick={reset}>Kiểm tra lại hồ sơ</button>}<button className="btn-primary" onClick={close}>Đóng</button></>}/>
        <p className="product-application-note">{result.disbursement.status==="Success"?"Tiền đã được ghi có vào tài khoản nhận. Lịch trả nợ được tính từ ngày giải ngân.":"Khoản vay chưa được kích hoạt và chưa phát sinh lịch trả nợ."}</p></div>
      :result?<div className="product-application-result"><h3>Đã từ chối hồ sơ vay</h3><p>{code} · {customer}</p><button className="btn-primary" onClick={close}>Đóng</button></div>
      :<form className="resource-create-form product-application-form" onSubmit={event=>{
        event.preventDefault();if(!decision||busy||draft)return;
        try {
          void submit({decision,reason:reason.trim(),...(decision==="APPROVE"?{destinationAccountId:Number(accountId),requestKey:newRequestKey()}: {})});
        } catch(caught) { setError(caught); }
      }}>
        <div className="resource-create-fields"><p className="product-application-note">{code} · {customer} · {amount}</p>
          {options.isPending?<p role="status">Đang tải tài khoản nhận tiền…</p>:options.isError?<p role="alert" className="product-application-error">Không tải được thông tin giải ngân. <button type="button" onClick={()=>void options.refetch()}>Thử lại</button></p>
          :options.data?.status!=="Pending"?<p className="product-application-note">Hồ sơ đã được xử lý. Vui lòng tải lại danh sách.</p>:null}
          {options.data?.disbursement?.status==="Pending"&&<p className="product-application-note">Khoản vay có lệnh giải ngân chờ xử lý. Chọn đúng tài khoản nhận của lệnh cũ và xác nhận duyệt để hoàn tất giải ngân.</p>}
          <fieldset disabled={busy||!!draft||!options.isSuccess||options.data?.status!=="Pending"} className="loan-decision-fields">
            <label>Quyết định *<select aria-label="Quyết định *" className="field" value={decision??"APPROVE"} onChange={e=>setDecision(e.target.value as "APPROVE"|"REJECT")}><option value="APPROVE">Phê duyệt và giải ngân</option><option value="REJECT">Từ chối</option></select></label>
            {decision==="APPROVE"&&<><label>Tài khoản nhận giải ngân *<select aria-label="Tài khoản nhận giải ngân *" className="field" required value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">Chọn tài khoản của khách hàng vay</option>{options.data?.accounts.map(a=><option key={a.accountId} value={a.accountId}>{a.accountNumber}</option>)}</select></label>
              {!options.data?.accounts.length&&options.isSuccess&&<p className="product-application-note">Khách hàng cần có tài khoản VND đang hoạt động do mình đứng tên chính để nhận tiền.</p>}
              {options.data?.unavailableReason&&<p role="alert" className="product-application-error">{options.data.unavailableReason}</p>}</>}
            <p className="product-application-note">{decision==="APPROVE"?"Tiền được chuyển từ ngân hàng vào đúng tài khoản đã chọn sau khi nhân viên xác nhận. Chỉ khi giải ngân thành công mới kích hoạt khoản vay và tạo lịch trả nợ.":"Hồ sơ sẽ chuyển sang Đã hủy; không giải ngân và không tạo lịch trả nợ."}</p>
            <label>Lý do xử lý *<textarea aria-label="Lý do xử lý *" className="field" required minLength={3} maxLength={255} value={reason} onChange={e=>setReason(e.target.value)}/></label>
          </fieldset>
          {!!error&&<p className="product-application-error" role="alert">{error instanceof Error?error.message:"Chưa xác định được kết quả. Kiểm tra hồ sơ hoặc thử lại đúng lệnh."}</p>}
        </div>
        <footer><button className="btn-secondary" type="button" disabled={busy} onClick={close}>Đóng</button>
          {draft&&error?<button className="btn-primary" type="button" disabled={busy} onClick={()=>rejected?reset():void submit(draft)}>{busy?"Đang xử lý…":rejected?"Kiểm tra lại thông tin":"Thử lại đúng lệnh"}</button>
          :<button className="btn-primary" disabled={busy||!options.isSuccess||options.data?.status!=="Pending"||reason.trim().length<3||(decision==="APPROVE"&&(!options.data?.ready||!accountId))}>{busy?"Đang xử lý…":decision==="APPROVE"?"Xác nhận duyệt và giải ngân":"Xác nhận từ chối"}</button>}</footer>
      </form>}
    </Modal>
  </>;
}
