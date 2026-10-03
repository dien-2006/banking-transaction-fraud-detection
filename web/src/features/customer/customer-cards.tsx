"use client";
import {AlertTriangle,ArrowDownLeft,ArrowRight,BarChart3,ChevronRight,FileText,Gift,Globe2,KeyRound,LockKeyhole,Plus,ShoppingCart,Wifi} from "lucide-react";
import {useLayoutEffect,useRef,useState} from "react";
import "./customer-cards.css";

const cards=[{id:"credit",kind:"Thẻ tín dụng",number:"1234",title:"Thẻ tín dụng D4 Platinum",network:"VISA",tone:"red",status:"Đang hoạt động"},{id:"debit",kind:"Thẻ ghi nợ",number:"5678",title:"Thẻ ghi nợ thanh toán",network:"●●",tone:"blue",status:"Đang hoạt động"},{id:"domestic",kind:"Thẻ ghi nợ",number:"9012",title:"Thẻ ghi nợ nội địa",network:"napas",tone:"gold",status:"Tạm khóa"}];
const transactions=[
  ["25/09/2024 14:32","1234","Shopee","Mua sắm trực tuyến","-250,000","out"],
  ["24/09/2024 09:15","5678","Highlands Coffee","Thanh toán tại cửa hàng","-75,000","out"],
  ["22/09/2024 18:20","1234","Điện Máy Xanh","Thanh toán tại cửa hàng","-1,250,000","out"],
  ["20/09/2024 11:05","9012","Nhận hoàn tiền","Hoàn tiền chương trình","+50,000","in"],
  ["18/09/2024 16:45","5678","Thanh toán hóa đơn điện","Thanh toán định kỳ","-320,000","out"],
];

export function CustomerCards(){
  const viewport=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null),[tab,setTab]=useState("all"),[dialog,setDialog]=useState<string|null>(null);
  useLayoutEffect(()=>{const v=viewport.current,c=content.current;if(!v||!c)return;const media=matchMedia("(min-width:1024px)"),fit=()=>{c.style.removeProperty("zoom");c.style.removeProperty("width");if(!media.matches)return;const scale=Math.min(1,v.clientWidth/c.scrollWidth,v.clientHeight/c.scrollHeight);if(scale<.999){c.style.zoom=String(scale);c.style.width=`${v.clientWidth/scale}px`;}};const observer=new ResizeObserver(fit);observer.observe(v);media.addEventListener("change",fit);fit();return()=>{observer.disconnect();media.removeEventListener("change",fit);};},[tab]);
  const shown=cards.filter(x=>tab==="all"||(tab==="credit"?x.id==="credit":tab==="debit"?x.id!=="credit":false));
  return <div className="customer-cards-page" ref={viewport}><div className="customer-cards-content" ref={content}>
    <section className="customer-cards-hero"><div className="cards-hero-copy"><p>Trang chủ <ChevronRight/> Thẻ của tôi</p><h1>Thẻ <span>của tôi</span></h1><strong>Quản lý thẻ, kiểm soát chi tiêu và tận hưởng nhiều ưu đãi.</strong></div><div className="cards-hero-art" aria-hidden="true"><img src="/customer-cards-hero-art-v2.png" alt=""/><p>Một chiếc thẻ<br/>Vạn trải nghiệm</p></div></section>
    <nav className="card-tabs">{[["all","Tất cả thẻ (3)"],["credit","Thẻ tín dụng (1)"],["debit","Thẻ ghi nợ (2)"],["virtual","Thẻ ảo (0)"]].map(([id,label])=><button className={tab===id?"active":""} onClick={()=>setTab(id)} key={id}>{label}</button>)}<button className="open-card" onClick={()=>setDialog("Mở thẻ mới")}><Plus/>Mở thẻ mới</button></nav>
    <div className="cards-workspace"><main><section className="bank-card-grid">{shown.map(card=><article className="bank-card-panel" key={card.id}><div className={`bank-card ${card.tone}`}><header><b>▮▮ D4 Bank</b><Wifi/></header><p>{card.kind}</p><strong>**** **** **** <b>{card.number}</b></strong><footer><span>NGUYỄN MINH ANH</span><b>{card.network}</b></footer></div><h2>{card.title}</h2><div><span className={card.status==="Tạm khóa"?"locked":""}>{card.status}</span><button onClick={()=>setDialog(card.title)}><ChevronRight/></button></div></article>)}</section>
    <section className="card-transactions"><header><h2>Giao dịch gần đây</h2><button>Xem tất cả <ArrowRight/></button></header><table><thead><tr><th>Thời gian</th><th>Thẻ</th><th>Nội dung giao dịch</th><th>Số tiền (VND)</th><th>Trạng thái</th></tr></thead><tbody>{transactions.map(([time,card,name,desc,amount,direction])=><tr key={time}><td><i className={direction}>{direction==="in"?<ArrowDownLeft/>:<ShoppingCart/>}</i>{time}</td><td>**** {card}</td><td><b>{name}</b><small>{desc}</small></td><td className={direction}>{amount}</td><td><span>Thành công</span></td></tr>)}</tbody></table></section></main>
    <aside className="cards-side"><section className="credit-limit"><h2>Hạn mức thẻ tín dụng</h2><div><div className="credit-ring"><b>25 / 50</b><small>triệu VND</small></div><p><span><i/>Đã sử dụng<b>25,000,000 VND</b></span><span><i/>Còn lại<b>25,000,000 VND</b></span></p></div><button onClick={()=>setDialog("Chi tiết hạn mức")}>Xem chi tiết <ArrowRight/></button></section>
    <section className="card-actions"><h2>Chức năng nhanh</h2>{[[LockKeyhole,"Khóa / Mở thẻ"],[KeyRound,"Đổi PIN"],[BarChart3,"Điều chỉnh hạn mức"],[Globe2,"Đăng ký thanh toán trực tuyến"],[AlertTriangle,"Báo mất thẻ"]].map(([Icon,label])=>{const ActionIcon=Icon as typeof LockKeyhole;return <button onClick={()=>setDialog(label as string)} key={label as string}><i><ActionIcon/></i><span>{label as string}</span><ChevronRight/></button>})}</section>
    <section className="card-benefits"><Gift/><div><h2>Ưu đãi dành cho chủ thẻ D4 Bank</h2>{["Hoàn tiền đến 10%","Giảm giá tại đối tác","Tích điểm đổi quà","Nhiều ưu đãi hấp dẫn khác"].map(x=><p key={x}>✓ <span>{x}</span></p>)}</div></section></aside></div>
    {dialog&&<div className="card-dialog-backdrop" onMouseDown={()=>setDialog(null)}><section role="dialog" aria-modal="true" onMouseDown={e=>e.stopPropagation()}><button onClick={()=>setDialog(null)}>×</button><FileText/><h2>{dialog}</h2><p>Tính năng này đang ở chế độ giao diện minh họa. Không có trạng thái thẻ hoặc hạn mức nào được thay đổi.</p><button className="card-dialog-confirm" onClick={()=>setDialog(null)}>Đã hiểu</button></section></div>}
  </div></div>;
}
