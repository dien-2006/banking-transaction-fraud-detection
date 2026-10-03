"use client";
import {ArrowRight,Check,CheckCircle2,ChevronDown,ChevronLeft,ChevronRight,Copy,CreditCard,Download,EyeOff,Landmark,PiggyBank,ShieldCheck,UserRound,Wallet} from "lucide-react";
import {useRouter} from "next/navigation";
import {useLayoutEffect,useRef,useState} from "react";
import {useSessionUser} from "@/components/session-context";
import {money} from "@/lib/utils";
import {bankService} from "@/services/bank.service";
import type {Transaction} from "@/types";
import {getCustomerAccountsDemo} from "../customer/account-data";
import "./transfer-flow.css";

const steps=["Thông tin","Xác nhận","OTP","Hoàn tất"];
const recipients=[
  {initials:"NB",name:"Nguyễn Văn Bình",bank:"D4 Bank",account:"1023 4567 1234",tone:"red"},
  {initials:"LC",name:"Lê Thị Cúc",bank:"Vietcombank",account:"0345 6789 0123",tone:"blue"},
  {initials:"MT",name:"Mẹ",bank:"BIDV",account:"0987 6543 2100",tone:"green"},
  {initials:"AD",name:"Anh Dũng",bank:"Techcombank",account:"1902 3456 7890",tone:"orange"},
];
const number=new Intl.NumberFormat("en-US");

export function TransferFlow(){
  const router=useRouter(),session=useSessionUser(),accounts=getCustomerAccountsDemo(session.id).accounts;
  const viewportRef=useRef<HTMLDivElement>(null),contentRef=useRef<HTMLDivElement>(null);
  const [step,setStep]=useState(0),[result,setResult]=useState<Transaction|null>(null),[loading,setLoading]=useState(false),[otp,setOtp]=useState(""),[error,setError]=useState("");
  const [form,setForm]=useState({bank:"D4 Bank",account:"",customer:"",amount:"",content:""});
  const amount=Number(form.amount.replace(/\D/g,"")),source=accounts.find(x=>x.type==="Thanh toán")??accounts[0],total=accounts.reduce((sum,x)=>sum+x.balance,0);
  const update=(key:keyof typeof form,value:string)=>setForm(x=>({...x,[key]:value}));
  const choose=(x:typeof recipients[number])=>setForm(f=>({...f,bank:x.bank,account:x.account.replace(/\D/g,""),customer:x.name.toLocaleUpperCase("vi")}));
  const next=async()=>{setError("");if(step===2){if(otp.length!==6){setError("Vui lòng nhập đủ 6 chữ số OTP.");return;}setLoading(true);try{const created=await bankService.transfer({customer:form.customer.trim(),amount});setResult(created);setStep(3);}catch(caught){setError(caught instanceof Error?caught.message:"Không thể xử lý giao dịch. Vui lòng thử lại.");}finally{setLoading(false);}return;}setStep(x=>Math.min(3,x+1));};
  useLayoutEffect(()=>{const viewport=viewportRef.current,content=contentRef.current;if(!viewport||!content)return;const desktop=window.matchMedia("(min-width:1024px)");const fit=()=>{content.style.removeProperty("zoom");content.style.removeProperty("width");if(!desktop.matches)return;const width=viewport.clientWidth,height=viewport.clientHeight;if(width<=0||height<=0)return;const scale=Math.min(1,width/content.scrollWidth,height/content.scrollHeight);if(scale<.999){content.style.zoom=String(scale);content.style.width=`${width/scale}px`;}};const observer=new ResizeObserver(fit);observer.observe(viewport);desktop.addEventListener("change",fit);fit();return()=>{observer.disconnect();desktop.removeEventListener("change",fit);};},[step,session.id]);
  return <div className="transfer-page" ref={viewportRef}><div className="transfer-page-content" ref={contentRef}>
    {step===0&&<><section className="transfer-hero"><div className="transfer-hero-copy"><p>Trang chủ <ChevronRight/> Chuyển tiền</p><h1>Chuyển <span>tiền</span></h1><strong>Chuyển tiền nhanh chóng, an toàn, mọi lúc mọi nơi.</strong></div><div className="transfer-hero-message">Chuyển tiền dễ dàng<br/>Kết nối mọi người<br/>gần hơn!</div><img src="/accounts-hero.png" alt=""/></section>
    <section className="transfer-stats">
      <article><i><Wallet/></i><div><p>Tổng số dư</p><b>{number.format(total)} <small>VND</small></b><em>↑ 8% so với tháng trước</em></div><EyeOff/></article>
      <article><i><Wallet/></i><div><p>Tài khoản thanh toán</p><b>{number.format(source?.balance??0)} <small>VND</small></b><em>1 tài khoản</em></div></article>
      <article><i><PiggyBank/></i><div><p>Tài khoản tiết kiệm</p><b>{number.format(accounts.find(x=>x.type==="Tiết kiệm")?.balance??0)} <small>VND</small></b><em>1 tài khoản</em></div></article>
      <article><i><CreditCard/></i><div><p>Tài khoản thẻ</p><b>{number.format(accounts.find(x=>x.type==="Thẻ")?.balance??0)} <small>VND</small></b><em>1 tài khoản</em></div></article>
    </section>
    <div className="transfer-workspace"><article className="transfer-form-panel"><h2>Thông tin chuyển tiền</h2>
      <div className="transfer-source-row"><label>Tài khoản nguồn <i>*</i><button type="button" className="transfer-source-select"><CreditCard/><span><b>{source?.number??"Chưa có tài khoản"}</b><small>Tài khoản thanh toán · Số dư: {number.format(source?.balance??0)} VND</small></span><ChevronDown/></button></label><div className="transfer-available"><i><Wallet/></i><div><small>Số dư khả dụng</small><b>{number.format(source?.balance??0)} <small>VND</small></b></div><EyeOff/></div></div>
      <label>Tài khoản nhận <i>*</i><div className="transfer-recipient-input"><UserRound/><input value={form.account} onChange={e=>update("account",e.target.value.replace(/\D/g,""))} placeholder="Nhập số tài khoản hoặc chọn từ danh sách người nhận"/><button type="button" onClick={()=>choose(recipients[0])}><UserRound/> Chọn người nhận</button></div></label>
      <label>Tên người nhận <i>*</i><div className="transfer-field"><UserRound/><input className="transfer-customer-name" value={form.customer} onChange={e=>update("customer",e.target.value)} placeholder="Nhập tên người nhận"/></div></label>
      <label>Ngân hàng nhận<div className="transfer-field muted"><Landmark/>{form.bank} (Ngân hàng số)</div></label>
      <label>Số tiền <i>*</i><div className="transfer-field"><span>ⓘ</span><input inputMode="numeric" value={form.amount} onChange={e=>update("amount",e.target.value)} placeholder="Nhập số tiền"/><b>VND</b></div></label>
      <label>Nội dung chuyển khoản<div className="transfer-field"><input maxLength={100} value={form.content} onChange={e=>update("content",e.target.value)} placeholder="Nhập nội dung chuyển khoản (tối đa 100 ký tự)"/></div><small className="transfer-counter">{form.content.length}/100</small></label>
      <div className="transfer-safety"><ShieldCheck/><p>Giao dịch sẽ được kiểm tra bảo mật và đánh giá rủi ro trước khi thực hiện.<small>Vui lòng kiểm tra kỹ thông tin để giao dịch diễn ra nhanh chóng và an toàn.</small></p></div>
      <button className="transfer-continue" disabled={!form.account||!form.customer.trim()||amount<=0} onClick={next}>Tiếp tục <ArrowRight/></button>
    </article><aside className="transfer-side">
      <section><header><h2>Tài khoản nguồn</h2><button>Xem tất cả <ArrowRight/></button></header>{accounts.slice(0,2).map(x=><button className="transfer-side-account" key={x.id}><i>{x.type==="Tiết kiệm"?<PiggyBank/>:<CreditCard/>}</i><p><b>{x.number}</b><small>{x.name}</small><strong>{number.format(x.balance)} VND</strong></p><ChevronRight/></button>)}</section>
      <section><header><h2>Người nhận gần đây</h2><button>Xem tất cả <ArrowRight/></button></header>{recipients.map(x=><button className="recent-recipient" key={x.account} onClick={()=>choose(x)}><i className={x.tone}>{x.initials}</i><p><b>{x.name}</b><small>{x.bank}<br/>{x.account}</small></p><ChevronRight/></button>)}</section>
      <section className="transfer-limit"><header><h2>Hạn mức giao dịch</h2><span>⚙</span></header><div><div className="limit-ring"><b>120 / 200</b><small>triệu VND</small></div><p><span><i/>Đã sử dụng<b>120,000,000 VND</b></span><span><i/>Còn lại<b>80,000,000 VND</b></span></p></div></section>
    </aside></div></>}
    {step>0&&step<3&&<section className="transfer-step-shell"><div className="transfer-steps">{steps.map((label,i)=><div className={i<=step?"active":""} key={label}><span>{i<step?<Check/>:i+1}</span><b>{label}</b></div>)}</div>
      {step===1&&<article className="transfer-confirm"><h2>Xác nhận giao dịch</h2><p>Kiểm tra kỹ thông tin trước khi tiếp tục.</p><div>{[["Từ tài khoản",source?.number??""],["Người nhận",form.customer],["Số tài khoản",form.account],["Ngân hàng",form.bank],["Số tiền",money.format(amount)],["Phí giao dịch","0 ₫"],["Nội dung",form.content||"Chuyển tiền"]].map(([a,b])=><p key={a}><span>{a}</span><b>{b}</b></p>)}</div></article>}
      {step===2&&<article className="transfer-otp"><ShieldCheck/><h2>Xác thực OTP</h2><p>Mã OTP demo đã được gửi đến số điện thoại •••• 5678.</p><input aria-label="Mã OTP gồm 6 chữ số" autoFocus inputMode="numeric" maxLength={6} placeholder="••••••" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,"").slice(0,6))}/><small>Trong bản demo, có thể sử dụng 6 chữ số bất kỳ.</small></article>}
      {error&&<p className="transfer-error" role="alert">{error}</p>}<footer className="transfer-step-actions"><button className="btn-secondary" disabled={loading} onClick={()=>setStep(x=>Math.max(0,x-1))}><ChevronLeft/>Quay lại</button><button className="btn-primary" disabled={loading||step===2&&otp.length!==6} onClick={next}>{loading?"Đang xử lý...":step===2?"Xác nhận chuyển tiền":"Tiếp tục"}<ChevronRight/></button></footer>
    </section>}
    {step===3&&result&&<section className="transfer-success"><CheckCircle2/><h2>Chuyển tiền thành công!</h2><p>Giao dịch của bạn đã được xử lý an toàn.</p><strong>{money.format(result.amount)}</strong><div>{[["Mã giao dịch",result.id],["Người nhận",result.customer],["Thời gian",result.time],["Trạng thái",result.status]].map(([a,b])=><p key={a}><span>{a}</span><b>{b}</b></p>)}</div><footer><button className="btn-secondary"><Download/>Tải biên lai</button><button className="btn-secondary" onClick={()=>navigator.clipboard?.writeText(result.id)}><Copy/>Sao chép mã</button><button className="btn-primary" onClick={()=>router.push("/customer/transactions")}>Xem lịch sử</button></footer></section>}
  </div></div>;
}
