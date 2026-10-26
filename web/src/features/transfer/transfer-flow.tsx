"use client";
import {ArrowRight,Check,CheckCircle2,ChevronDown,ChevronLeft,ChevronRight,Copy,CreditCard,Download,EyeOff,Landmark,PiggyBank,ShieldCheck,UserRound,Wallet} from "lucide-react";
import {useRouter} from "next/navigation";
import {useLayoutEffect,useRef,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {useSessionUser} from "@/components/session-context";
import {money} from "@/lib/utils";
import {bankService} from "@/services/bank.service";
import type {Transaction} from "@/types";
import "./transfer-flow.css";

const steps=["Thông tin","Xác nhận","OTP","Hoàn tất"];
const number=new Intl.NumberFormat("en-US");

export function TransferFlow(){
  const router=useRouter(),session=useSessionUser();
  const accountQuery=useQuery({queryKey:["me","accounts"],queryFn:bankService.customerAccounts});
  const accounts=(accountQuery.data??[]).map(x=>({id:String(x.accountid),number:x.accountnumber,name:x.accounttypename,
    type:(x.accounttypename.toLocaleLowerCase("vi").includes("tiết kiệm")?"Tiết kiệm":"Thanh toán") as "Tiết kiệm"|"Thanh toán",
    balance:Number(x.balance)}));
  const viewportRef=useRef<HTMLDivElement>(null),contentRef=useRef<HTMLDivElement>(null);
  const [step,setStep]=useState(0),[result,setResult]=useState<Transaction|null>(null),[loading,setLoading]=useState(false),[otp,setOtp]=useState(""),[error,setError]=useState(""),[destinationId,setDestinationId]=useState<number|null>(null),[challengeId,setChallengeId]=useState(""),[otpDestination,setOtpDestination]=useState(""),[sourceId,setSourceId]=useState("");
  const idempotencyKey=useRef<string>(typeof crypto!=="undefined"&&"randomUUID" in crypto?crypto.randomUUID():`web-${Date.now()}`);
  const [form,setForm]=useState({bank:"D4 Bank",account:"",customer:"",amount:"",content:""});
  const amount=Number(form.amount.replace(/\D/g,"")),source=accounts.find(x=>x.id===sourceId)??accounts.find(x=>x.type==="Thanh toán")??accounts[0],total=accounts.reduce((sum,x)=>sum+x.balance,0);
  const update=(key:keyof typeof form,value:string)=>setForm(x=>({...x,[key]:value}));
  const next=async()=>{setError("");
    if(step===0){setLoading(true);try{const destination=await bankService.resolveDestination(form.account.replace(/\s/g,""));if(!destination)throw new Error("Không tìm thấy tài khoản nhận đang hoạt động.");if(destination.accountId===Number(source?.id))throw new Error("Tài khoản nhận phải khác tài khoản nguồn.");setDestinationId(destination.accountId);setForm(x=>({...x,customer:destination.accountName,bank:destination.bankName,account:destination.accountNumber}));setStep(1);}catch(caught){setError(caught instanceof Error?caught.message:"Không thể kiểm tra tài khoản nhận.");}finally{setLoading(false);}return;}
    if(!source||!destinationId){setError("Thông tin tài khoản chưa hợp lệ.");return;}
    const context={sourceAccountId:Number(source.id),destinationAccountId:destinationId,amount:String(amount),idempotencyKey:idempotencyKey.current,channel:"InternetBanking" as const};
    if(step===1){setLoading(true);try{const challenge=await bankService.requestTransferOtp(context);setChallengeId(challenge.challengeId);setOtpDestination(challenge.destinationMasked);setOtp("");setStep(2);}catch(caught){setError(caught instanceof Error?caught.message:"Không thể gửi OTP.");}finally{setLoading(false);}return;}
    if(step===2){if(otp.length!==6){setError("Vui lòng nhập đủ 6 chữ số xác nhận.");return;}if(!challengeId){setError("Phiên OTP không tồn tại. Vui lòng quay lại để gửi mã mới.");return;}setLoading(true);try{const verified=await bankService.verifyTransferOtp({...context,challengeId,code:otp});const created=await bankService.transfer({...context,otpAuthorizationToken:verified.authorizationToken,description:form.content||`Chuyển tiền đến ${form.customer}`});setResult(created);setStep(3);}catch(caught){setError(caught instanceof Error?caught.message:"Không thể xử lý giao dịch. Vui lòng thử lại.");}finally{setLoading(false);}return;}setStep(x=>Math.min(3,x+1));};
  useLayoutEffect(()=>{const viewport=viewportRef.current,content=contentRef.current;if(!viewport||!content)return;const desktop=window.matchMedia("(min-width:1024px)");const fit=()=>{content.style.removeProperty("zoom");content.style.removeProperty("width");if(!desktop.matches)return;const width=viewport.clientWidth,height=viewport.clientHeight;if(width<=0||height<=0)return;const scale=Math.min(1,width/content.scrollWidth,height/content.scrollHeight);if(scale<.999){content.style.zoom=String(scale);content.style.width=`${width/scale}px`;}};const observer=new ResizeObserver(fit);observer.observe(viewport);desktop.addEventListener("change",fit);fit();return()=>{observer.disconnect();desktop.removeEventListener("change",fit);};},[step,session.id]);
  return <div className="transfer-page" ref={viewportRef}><div className="transfer-page-content" ref={contentRef}>
    {step===0&&<><section className="transfer-hero"><div className="transfer-hero-copy"><p>Trang chủ <ChevronRight/> Chuyển tiền</p><h1>Chuyển <span>tiền</span></h1><strong>Chuyển tiền nhanh chóng, an toàn, mọi lúc mọi nơi.</strong></div><div className="transfer-hero-message">Chuyển tiền dễ dàng<br/>Kết nối mọi người<br/>gần hơn!</div><img src="/accounts-hero.png" alt=""/></section>
    <section className="transfer-stats">
      <article><i><Wallet/></i><div><p>Tổng số dư</p><b>{number.format(total)} <small>VND</small></b><em>↑ 8% so với tháng trước</em></div><EyeOff/></article>
      <article><i><Wallet/></i><div><p>Tài khoản thanh toán</p><b>{number.format(source?.balance??0)} <small>VND</small></b><em>{accounts.filter(x=>x.type==="Thanh toán").length} tài khoản</em></div></article>
      <article><i><PiggyBank/></i><div><p>Tài khoản tiết kiệm</p><b>{number.format(accounts.find(x=>x.type==="Tiết kiệm")?.balance??0)} <small>VND</small></b><em>{accounts.filter(x=>x.type==="Tiết kiệm").length} tài khoản</em></div></article>
      <article><i><CreditCard/></i><div><p>Tổng tài khoản</p><b>{accounts.length}</b><em>Đang hiển thị từ PostgreSQL</em></div></article>
    </section>
    <div className="transfer-workspace"><article className="transfer-form-panel"><h2>Thông tin chuyển tiền</h2>
      <div className="transfer-source-row"><label>Tài khoản nguồn <i>*</i><span className="transfer-source-select"><CreditCard/><select aria-label="Tài khoản nguồn" value={source?.id??""} onChange={event=>setSourceId(event.target.value)}>{accounts.map(account=><option value={account.id} key={account.id}>{account.number} · {account.name} · {number.format(account.balance)} VND</option>)}</select><ChevronDown/></span></label><div className="transfer-available"><i><Wallet/></i><div><small>Số dư khả dụng</small><b>{number.format(source?.balance??0)} <small>VND</small></b></div><EyeOff/></div></div>
      <label>Tài khoản nhận <i>*</i><div className="transfer-recipient-input"><UserRound/><input value={form.account} onChange={e=>update("account",e.target.value.replace(/\D/g,""))} placeholder="Nhập số tài khoản D4 Bank"/></div></label>
      <label>Tên người nhận <i>*</i><div className="transfer-field"><UserRound/><input className="transfer-customer-name" value={form.customer} onChange={e=>update("customer",e.target.value)} placeholder="Nhập tên người nhận"/></div></label>
      <label>Ngân hàng nhận<div className="transfer-field muted"><Landmark/>{form.bank} (Ngân hàng số)</div></label>
      <label>Số tiền <i>*</i><div className="transfer-field"><span>ⓘ</span><input inputMode="numeric" value={form.amount} onChange={e=>update("amount",e.target.value)} placeholder="Nhập số tiền"/><b>VND</b></div></label>
      <label>Nội dung chuyển khoản<div className="transfer-field"><input maxLength={100} value={form.content} onChange={e=>update("content",e.target.value)} placeholder="Nhập nội dung chuyển khoản (tối đa 100 ký tự)"/></div><small className="transfer-counter">{form.content.length}/100</small></label>
      <div className="transfer-safety"><ShieldCheck/><p>Giao dịch sẽ được kiểm tra bảo mật và đánh giá rủi ro trước khi thực hiện.<small>Vui lòng kiểm tra kỹ thông tin để giao dịch diễn ra nhanh chóng và an toàn.</small></p></div>
      {accountQuery.isError&&<p className="transfer-error" role="alert">Không thể tải tài khoản nguồn.</p>}<button className="transfer-continue" disabled={loading||!source||!form.account||amount<=0} onClick={next}>{loading?"Đang kiểm tra...":"Tiếp tục"} <ArrowRight/></button>
    </article><aside className="transfer-side">
      <section><header><h2>Tài khoản nguồn</h2><button>Xem tất cả <ArrowRight/></button></header>{accounts.slice(0,2).map(x=><button className="transfer-side-account" key={x.id}><i>{x.type==="Tiết kiệm"?<PiggyBank/>:<CreditCard/>}</i><p><b>{x.number}</b><small>{x.name}</small><strong>{number.format(x.balance)} VND</strong></p><ChevronRight/></button>)}</section>
      <section><header><h2>Người nhận</h2></header><p className="p-4 text-sm text-slate-500">Tên người nhận sẽ được xác minh trực tiếp từ số tài khoản trước bước xác nhận.</p></section>
    </aside></div></>}
    {step>0&&step<3&&<section className="transfer-step-shell"><div className="transfer-steps">{steps.map((label,i)=><div className={i<=step?"active":""} key={label}><span>{i<step?<Check/>:i+1}</span><b>{label}</b></div>)}</div>
      {step===1&&<article className="transfer-confirm"><h2>Xác nhận giao dịch</h2><p>Kiểm tra kỹ thông tin trước khi tiếp tục.</p><div>{[["Từ tài khoản",source?.number??""],["Người nhận",form.customer],["Số tài khoản",form.account],["Ngân hàng",form.bank],["Số tiền",money.format(amount)],["Phí giao dịch","0 ₫"],["Nội dung",form.content||"Chuyển tiền"]].map(([a,b])=><p key={a}><span>{a}</span><b>{b}</b></p>)}</div></article>}
      {step===2&&<article className="transfer-otp"><ShieldCheck/><h2>Xác nhận giao dịch</h2><p>Nhập 6 chữ số đã gửi tới email {otpDestination||"đã đăng ký"} để hoàn tất yêu cầu chuyển tiền.</p><input aria-label="Mã xác nhận gồm 6 chữ số" autoFocus inputMode="numeric" maxLength={6} placeholder="••••••" value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,"").slice(0,6))}/><small>Mã có hiệu lực 5 phút và tối đa 5 lần nhập.</small></article>}
      {error&&<p className="transfer-error" role="alert">{error}</p>}<footer className="transfer-step-actions"><button className="btn-secondary" disabled={loading} onClick={()=>setStep(x=>Math.max(0,x-1))}><ChevronLeft/>Quay lại</button><button className="btn-primary" disabled={loading||step===2&&otp.length!==6} onClick={next}>{loading?"Đang xử lý...":step===2?"Xác nhận chuyển tiền":"Tiếp tục"}<ChevronRight/></button></footer>
    </section>}
    {step===3&&result&&<section className="transfer-success"><CheckCircle2/><h2>{result.status==="Thành công"?"Chuyển tiền thành công!":result.status==="Đang xử lý"?"Giao dịch đang chờ duyệt":"Giao dịch không thành công"}</h2><p>{result.status==="Thành công"?"Giao dịch của bạn đã được xử lý an toàn.":result.status==="Đang xử lý"?"Giao dịch cần nhân viên kiểm tra trước khi hạch toán.":"Số dư không bị ghi nợ. Xem lịch sử để biết chi tiết."}</p><strong>{money.format(result.amount)}</strong><div>{[["Mã giao dịch",result.id],["Người nhận",result.customer],["Thời gian",result.time],["Trạng thái",result.status]].map(([a,b])=><p key={a}><span>{a}</span><b>{b}</b></p>)}</div><footer><button className="btn-secondary"><Download/>Tải biên lai</button><button className="btn-secondary" onClick={()=>navigator.clipboard?.writeText(result.id)}><Copy/>Sao chép mã</button><button className="btn-primary" onClick={()=>router.push("/customer/transactions")}>Xem lịch sử</button></footer></section>}
  </div></div>;
}
