"use client";
import {AlertTriangle,Bell,ChevronRight,CreditCard,Gift,Megaphone,Percent,ReceiptText,Settings,ShoppingCart} from "lucide-react";
import {useLayoutEffect,useMemo,useRef,useState} from "react";
import "./customer-notifications.css";

const items=[
  {id:1,type:"transaction",title:"Thanh toán thành công",detail:"Quý khách đã thanh toán tại Shopee với số tiền 250,000 VND.",time:"25/09/2024 14:32",icon:ShoppingCart,tone:"red",unread:true},
  {id:2,type:"transaction",title:"Nhận tiền thành công",detail:"Bạn đã nhận được 1,000,000 VND từ NGUYEN VAN B.",time:"24/09/2024 09:15",icon:ReceiptText,tone:"green",unread:true},
  {id:3,type:"promotion",title:"Ưu đãi đặc biệt dành cho bạn",detail:"Giảm 10% khi thanh toán hóa đơn điện, nước trên D4 Bank.",time:"22/09/2024 18:20",icon:Megaphone,tone:"red",unread:true},
  {id:4,type:"product",title:"Thẻ của bạn sắp hết hạn",detail:"Thẻ tín dụng **** 1234 sẽ hết hạn vào 12/2024.",time:"20/09/2024 11:05",icon:CreditCard,tone:"blue",unread:true},
  {id:5,type:"product",title:"Lãi suất tiết kiệm thay đổi",detail:"Cập nhật lãi suất mới áp dụng từ 01/10/2024.",time:"18/09/2024 16:45",icon:Percent,tone:"purple",unread:false},
  {id:6,type:"promotion",title:"Chúc mừng sinh nhật",detail:"D4 Bank gửi tặng bạn ưu đãi đặc biệt nhân dịp sinh nhật!",time:"15/09/2024 10:12",icon:Gift,tone:"orange",unread:false},
  {id:7,type:"system",title:"Bảo trì hệ thống",detail:"Hệ thống sẽ tạm ngừng từ 02:00 – 04:00 ngày 20/09/2024.",time:"12/09/2024 08:30",icon:Settings,tone:"gray",unread:false},
  {id:8,type:"system",title:"Đăng nhập thiết bị mới",detail:"Phát hiện đăng nhập từ thiết bị Windows - Hà Nội, Việt Nam.",time:"10/09/2024 22:17",icon:AlertTriangle,tone:"red",unread:false},
];

export function CustomerNotifications(){
  const viewport=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null),[tab,setTab]=useState("all"),[read,setRead]=useState<number[]>([]),[selected,setSelected]=useState<typeof items[number]|null>(null);
  const shown=useMemo(()=>items.filter(x=>tab==="all"||x.type===tab),[tab]);
  useLayoutEffect(()=>{const v=viewport.current,c=content.current;if(!v||!c)return;const media=matchMedia("(min-width:1024px)"),fit=()=>{c.style.removeProperty("zoom");c.style.removeProperty("width");if(!media.matches)return;const scale=Math.min(1,v.clientWidth/c.scrollWidth,v.clientHeight/c.scrollHeight);if(scale<.999){c.style.zoom=String(scale);c.style.width=`${v.clientWidth/scale}px`;}};const observer=new ResizeObserver(fit);observer.observe(v);media.addEventListener("change",fit);fit();return()=>{observer.disconnect();media.removeEventListener("change",fit);};},[shown.length]);
  const open=(item:typeof items[number])=>{setRead(x=>x.includes(item.id)?x:[...x,item.id]);setSelected(item);};
  return <div className="notifications-page" ref={viewport}><div className="notifications-content" ref={content}>
    <header className="notifications-heading"><p>Trang chủ <ChevronRight/> Thông báo</p><h1>Thông <span>báo</span></h1><strong>Cập nhật nhanh chóng các thông tin, ưu đãi và hoạt động mới nhất từ D4 Bank.</strong></header>
    <nav className="notification-tabs">{[["all","Tất cả (15)"],["transaction","Giao dịch (8)"],["promotion","Khuyến mãi (3)"],["product","Sản phẩm (2)"],["system","Hệ thống (2)"]].map(([id,label])=><button className={tab===id?"active":""} onClick={()=>setTab(id)} key={id}>{label}</button>)}</nav>
    <section className="notification-list">{shown.map(item=>{const Icon=item.icon,isUnread=item.unread&&!read.includes(item.id);return <button className={isUnread?"unread":""} onClick={()=>open(item)} key={item.id}><i className={item.tone}><Icon/></i><p><b>{item.title}</b><span>{item.detail}</span></p><em className={isUnread?"new":""}/><time>{item.time}</time><ChevronRight/></button>})}</section>
    {selected&&<div className="notification-dialog" onMouseDown={()=>setSelected(null)}><section role="dialog" aria-modal="true" onMouseDown={e=>e.stopPropagation()}><button onClick={()=>setSelected(null)}>×</button><Bell/><h2>{selected.title}</h2><p>{selected.detail}</p><time>{selected.time}</time><button className="notification-dialog-close" onClick={()=>setSelected(null)}>Đóng</button></section></div>}
  </div></div>;
}
