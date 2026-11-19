"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui";
import { bankService } from "@/services/bank.service";
import "../customer/product-application-dialog.css";

export function LoanDecisionButtons({id,code,customer,amount,autoOpen=false}:{id:number;code:string;customer:string;amount:string;autoOpen?:boolean}) {
  const client=useQueryClient();
  const [decision,setDecision]=useState<"APPROVE"|"REJECT"|null>(autoOpen ? "APPROVE" : null),[reason,setReason]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const open=(value:typeof decision)=>{setDecision(value);setError("");setReason("");};
  return <>
    <button className="d4-view-button" onClick={()=>open("APPROVE")}>Xử lý</button>
    <Modal open={!!decision} onOpenChange={value=>{if(!value&&!busy)setDecision(null);}} title="Xử lý hồ sơ vay" description="Chỉ xử lý hồ sơ đang chờ thẩm định. Quyết định được lưu cùng lý do và người xử lý." className="product-application-dialog">
      <form className="resource-create-form product-application-form" onSubmit={async event=>{
        event.preventDefault();if(!decision||busy)return;setBusy(true);setError("");
        try{await bankService.decideLoan(id,decision,reason.trim());await client.invalidateQueries({queryKey:["staff-loans"]});setDecision(null);}
        catch(caught){setError(caught instanceof Error?caught.message:"Không thể xử lý hồ sơ.");void client.invalidateQueries({queryKey:["staff-loans"]});}
        finally{setBusy(false);}
      }}>
        <div className="resource-create-fields"><p className="product-application-note">{code} · {customer} · {amount}</p>
          <label className="mt-4">Quyết định *<select aria-label="Quyết định *" className="field" disabled={busy} value={decision??"APPROVE"} onChange={event=>setDecision(event.target.value as "APPROVE"|"REJECT")}><option value="APPROVE">Phê duyệt</option><option value="REJECT">Từ chối</option></select></label>
          <p className="product-application-note">{decision==="APPROVE"?"Phê duyệt kích hoạt khoản vay và tạo lịch trả nợ. Thao tác này không chuyển tiền giải ngân.":"Hồ sơ sẽ chuyển sang trạng thái Đã hủy; không phát sinh lịch trả nợ."}</p>
          <label className="mt-4">Lý do xử lý *<textarea aria-label="Lý do xử lý *" className="field" required minLength={3} maxLength={255} disabled={busy} value={reason} onChange={e=>setReason(e.target.value)}/></label>
        </div>
        {error&&<p className="product-application-error" role="alert">{error}</p>}
        <footer><button className="btn-secondary" type="button" disabled={busy} onClick={()=>setDecision(null)}>Quay lại</button><button className="btn-primary" disabled={busy||reason.trim().length<3}>{busy?"Đang xử lý…":decision==="APPROVE"?"Xác nhận duyệt":"Xác nhận từ chối"}</button></footer>
      </form>
    </Modal>
  </>;
}
