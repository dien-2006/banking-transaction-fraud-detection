"use client";
import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { useSessionUser } from "@/components/session-context";
import { ApiError } from "@/services/api.client";
import { bankService, type CustomerProductKind } from "@/services/bank.service";
import { useCustomerAccounts } from "./customer-queries";
import { formatVnd } from "@/lib/customer-data";
import "./product-application-dialog.css";

const titles = {accounts:"Mở tài khoản mới",cards:"Mở thẻ ghi nợ",loans:"Đăng ký khoản vay"};
const descriptions = {
  accounts:"Chọn chi nhánh và sản phẩm. Số tài khoản được cấp tự động khi mở thành công.",
  cards:"Phát hành thẻ ghi nợ mô phỏng trên tài khoản do bạn đứng tên chính. Số thẻ được cấp tự động.",
  loans:"Gửi hồ sơ để nhân viên chi nhánh thẩm định và giải ngân vào tài khoản của bạn. Lịch trả nợ chỉ bắt đầu sau khi giải ngân thành công.",
};
function requestKey() {
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64; bytes[8]=(bytes[8]&63)|128;
  const value=Array.from(bytes,byte=>byte.toString(16).padStart(2,"0")).join("");
  return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;
}
export function ProductApplicationDialog({kind,open,onOpenChange,onCreated}:{kind:CustomerProductKind;open:boolean;onOpenChange:(open:boolean)=>void;onCreated?:()=>void}) {
  const user=useSessionUser(), client=useQueryClient();
  const catalog=useQuery({queryKey:["customer",user.id,"product-catalog"],queryFn:bankService.customerProductCatalog,enabled:open});
  const accounts=useCustomerAccounts();
  const [branch,setBranch]=useState(""), [product,setProduct]=useState(""), [account,setAccount]=useState("");
  const [cardType,setCardType]=useState("");
  const [principal,setPrincipal]=useState(""), [months,setMonths]=useState(""), [pin,setPin]=useState(""), [confirmPin,setConfirmPin]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[uncertain,setUncertain]=useState(false);
  const [result,setResult]=useState<Record<string,unknown>|null>(null);
  const attempt=useRef<{key:string;payload:Record<string,unknown>}|null>(null);
  const loanType=catalog.data?.loanTypes.find(row=>String(row.id)===product);
  const accountType=catalog.data?.accountTypes.find(row=>String(row.id)===product);
  const branches=(catalog.data?.branches??[]).filter(row=>kind!=="loans"||row.acceptingLoans);
  const eligibleAccounts=(accounts.data??[]).filter(row=>row.status==="Active"&&row.currency==="VND"&&row.accountcategory==="CUSTOMER"&&row.holdertype==="PRIMARY_OWNER");
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setError("");
    if(busy||!catalog.data)return;
    if(!attempt.current){
      if(kind==="cards"&&pin!==confirmPin){setError("PIN xác nhận chưa khớp.");return;}
      const payload=kind==="accounts"?{branchId:Number(branch),accountTypeId:Number(product)}:kind==="cards"?{accountId:Number(account),cardType,pin}:{branchId:Number(branch),loanTypeId:Number(product),principal,termMonths:Number(months)};
      attempt.current={key:requestKey(),payload};
    }
    setBusy(true);
    try{
      const created=await bankService.createCustomerProduct(kind,{...attempt.current.payload,requestKey:attempt.current.key});
      if(!(created[kind==="accounts"?"accountid":kind==="cards"?"cardid":"loanid"])||created.status!==(kind==="loans"?"Pending":"Active"))throw new Error("Chưa xác định được kết quả. Vui lòng kiểm tra danh sách hoặc thử lại cùng yêu cầu.");
      setResult(created);setPin("");setConfirmPin("");attempt.current=null;setUncertain(false);
      onCreated?.();
      void client.invalidateQueries({queryKey:["customer",user.id]});
    }catch(caught){
      const known=caught instanceof ApiError&&[400,403,404,409,422,429].includes(caught.status);
      setUncertain(!known);
      setError(caught instanceof Error?caught.message:"Không thể gửi yêu cầu.");
      if(known)attempt.current=null;
    }finally{setBusy(false);}
  };
  return <Modal open={open} onOpenChange={next=>{if(!busy)onOpenChange(next);}} title={titles[kind]} description={descriptions[kind]} className="product-application-dialog">
    {result?<div className="product-application-result" role="status">
      <CheckCircle2 size={42}/><h3>{kind==="loans"?"Đã tiếp nhận hồ sơ vay":kind==="cards"?"Đã phát hành thẻ":"Đã mở tài khoản"}</h3>
      <dl><div><dt>{kind==="accounts"?"Số tài khoản":kind==="cards"?"Số thẻ":"Mã hồ sơ vay"}</dt><dd>{String(result.accountnumber??result.maskedcardnumber??result.loancode??"—")}</dd></div>
      <div><dt>Trạng thái</dt><dd>{kind==="loans"?"Chờ thẩm định":"Đang hoạt động"}</dd></div></dl>
      {kind==="cards"&&<p>Loại thẻ: {catalog.data?.card.types?.find(type=>type.value===result.cardtype)?.label??String(result.cardtype)}</p>}
      <p>{kind==="loans"?"Theo dõi hồ sơ tại Khoản vay của tôi. Nhân viên chi nhánh sẽ tiếp nhận xử lý.":"Thông tin đã được cập nhật trong danh sách của bạn."}</p>
      <button className="btn-secondary mr-2" onClick={()=>{setResult(null);setError("");setBranch("");setProduct("");setAccount("");setCardType("");setPrincipal("");setMonths("");}}>Đăng ký tiếp</button>
      <button className="btn-primary" onClick={()=>onOpenChange(false)}>Đóng</button>
    </div>:catalog.isPending?<p role="status">Đang tải sản phẩm…</p>:catalog.isError?<div role="alert">Không thể tải danh mục. <button className="btn-secondary" onClick={()=>void catalog.refetch()}>Thử lại</button></div>:<form className="resource-create-form product-application-form" onSubmit={submit}>
      <div className="resource-create-fields">
        <p className="product-application-note">Các trường có dấu * là bắt buộc.</p>
        <fieldset disabled={busy||uncertain}>
          {kind!=="cards"&&<label>Chi nhánh *<select aria-label="Chi nhánh *" className="field" required value={branch} onChange={e=>setBranch(e.target.value)}><option value="">Chọn chi nhánh</option>{branches.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
          {kind==="accounts"&&<><label>Loại tài khoản *<select aria-label="Loại tài khoản *" className="field" required value={product} onChange={e=>setProduct(e.target.value)}><option value="">Chọn loại tài khoản</option>{catalog.data?.accountTypes.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          {accountType&&<p className="product-application-note">Số dư tối thiểu của sản phẩm: {formatVnd(accountType.minBalance)}. Tài khoản mới có số dư ban đầu 0 ₫.</p>}</>}
          {kind==="cards"&&<>
            <label>Tài khoản liên kết *<select aria-label="Tài khoản liên kết *" className="field" required value={account} onChange={e=>setAccount(e.target.value)}><option value="">Chọn tài khoản của bạn</option>{eligibleAccounts.map(row=><option key={row.accountid} value={row.accountid}>{row.accountnumber} · {row.accounttypename}</option>)}</select></label>
            <label>Loại thẻ *<select aria-label="Loại thẻ *" className="field" required value={cardType} onChange={e=>setCardType(e.target.value)}><option value="">Chọn loại thẻ</option>{catalog.data?.card.types?.map(type=><option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
            {accounts.isError?<p role="alert">Không thể tải tài khoản. <button type="button" onClick={()=>void accounts.refetch()}>Thử lại</button></p>:!accounts.isPending&&!eligibleAccounts.length&&<p className="product-application-note">Bạn cần tài khoản VND đang hoạt động và đứng tên chính để mở thẻ.</p>}
            <p className="product-application-note">Thẻ ghi nợ mô phỏng · Hiệu lực {catalog.data?.card.validityYears} năm · Hạn mức/ngày {formatVnd(catalog.data?.card.dailyLimit??0)}. Thẻ chưa tích hợp mạng thanh toán bên ngoài.</p>
            <label>PIN mới *<input className="field" type="password" aria-label="PIN mới *" autoComplete="new-password" inputMode="numeric" pattern="[0-9]{4,6}" minLength={4} maxLength={6} required value={pin} onChange={e=>setPin(e.target.value)}/><small>Nhập 4–6 chữ số; không chia sẻ PIN.</small></label>
            <label>Xác nhận PIN *<input className="field" type="password" aria-label="Xác nhận PIN *" autoComplete="new-password" inputMode="numeric" pattern="[0-9]{4,6}" minLength={4} maxLength={6} required value={confirmPin} onChange={e=>setConfirmPin(e.target.value)}/></label>
          </>}
          {kind==="loans"&&<>
            <label>Sản phẩm vay *<select aria-label="Sản phẩm vay *" className="field" required value={product} onChange={e=>setProduct(e.target.value)}><option value="">Chọn sản phẩm vay</option>{catalog.data?.loanTypes.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
            {loanType&&<p className="product-application-note">Lãi suất sản phẩm: {loanType.interestRate}%/năm · Tối đa {formatVnd(loanType.maxAmount)} · Kỳ hạn tối đa {loanType.maxTermMonths} tháng.</p>}
            <label>Số tiền vay (VND) *<input className="field" type="number" aria-label="Số tiền vay (VND) *" min="1" step="1" max={loanType?Number(loanType.maxAmount):undefined} required value={principal} onChange={e=>setPrincipal(e.target.value)}/></label>
            <label>Kỳ hạn (tháng) *<input className="field" type="number" aria-label="Kỳ hạn (tháng) *" min="1" step="1" max={loanType?.maxTermMonths} required value={months} onChange={e=>setMonths(e.target.value)}/></label>
          </>}
          <label className="product-application-consent"><input type="checkbox" required/>Tôi xác nhận thông tin đăng ký chính xác.</label>
        </fieldset>
      </div>
      {error&&<div className="product-application-error" role="alert">{error}{uncertain&&<p>Kết quả có thể đã được lưu. Thử lại sẽ dùng cùng mã yêu cầu để tránh tạo trùng.</p>}</div>}
      <footer><button type="button" className="btn-secondary" disabled={busy} onClick={()=>onOpenChange(false)}>Đóng</button><button type="submit" className="btn-primary" disabled={busy||(kind==="cards"&&!eligibleAccounts.length)}>{busy?"Đang xử lý…":uncertain?"Thử lại yêu cầu":kind==="loans"?"Gửi hồ sơ vay":kind==="cards"?"Phát hành thẻ":"Mở tài khoản"}</button></footer>
    </form>}
  </Modal>;
}
