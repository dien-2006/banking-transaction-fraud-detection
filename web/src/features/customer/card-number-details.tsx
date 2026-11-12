"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { bankService, type ApiCard } from '@/services/bank.service';
import { ApiError } from '@/services/api.client';
import { customerCardMask } from '@/lib/customer-cards';
import { CustomerCardFace } from './customer-card-widgets';
import './card-number-details.css';

export function CardNumberDetails({card,holder,children}:{card:ApiCard;holder:string;children:ReactNode}) {
  const [number,setNumber]=useState<string|null>(null),[password,setPassword]=useState('');
  const [form,setForm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const request=useRef<AbortController|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),generation=useRef(0),mounted=useRef(false);
  const hide=useCallback(()=>{
    generation.current++;request.current?.abort();request.current=null;
    if(timer.current)clearTimeout(timer.current);
    setNumber(null);setPassword('');setForm(false);setBusy(false);setError('');
  },[]);
  useEffect(()=>{
    mounted.current=true;
    const visibility=()=>{if(document.visibilityState!=='visible')hide();};
    window.addEventListener('blur',hide);document.addEventListener('visibilitychange',visibility);
    return ()=>{mounted.current=false;generation.current++;request.current?.abort();if(timer.current)clearTimeout(timer.current);window.removeEventListener('blur',hide);document.removeEventListener('visibilitychange',visibility);};
  },[hide]);
  const reveal=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(busy)return;
    const token=++generation.current,controller=new AbortController();request.current=controller;
    setBusy(true);setError('');
    try{
      const result=await bankService.revealCardNumber(card.cardid,password,controller.signal);
      if(!mounted.current||generation.current!==token)return;
      if(Number(result.cardId)!==card.cardid||typeof result.cardNumber!=='string'||result.cardNumber.length<4||result.cardNumber.length>30||!Number.isFinite(result.expiresIn)||result.expiresIn<=0)
        throw new Error('Không thể hiển thị thông tin thẻ. Vui lòng thử lại.');
      setNumber(result.cardNumber.replace(/(.{4})/g,'$1 ').trim());setPassword('');setForm(false);
      timer.current=setTimeout(hide,Math.min(30,result.expiresIn)*1000);
    }catch(caught){if(mounted.current&&generation.current===token){setError(caught instanceof ApiError&&caught.status===429?'Đã vượt số lần xác thực cho phép. Vui lòng thử lại sau 15 phút.':caught instanceof Error?caught.message:'Không thể xác thực.');setPassword('');}}
    finally{if(mounted.current&&generation.current===token)setBusy(false);}
  };
  return <div className="card-number-details">
    <CustomerCardFace card={card} holder={holder} revealedNumber={number??undefined}/>
    <div className="card-number-control">
      <div className="card-number-value"><span>Số thẻ</span><strong>{number??customerCardMask(card)}</strong></div>
      {number?<><button type="button" className="customer-button secondary" onClick={hide}><EyeOff size={16}/>Ẩn số thẻ</button><small role="status">Số thẻ sẽ tự che sau 30 giây hoặc khi bạn rời cửa sổ này.</small></>
        :!form?<button type="button" className="customer-button secondary" onClick={()=>setForm(true)}><Eye size={16}/>Hiện số thẻ</button>
          :<form onSubmit={reveal}>
            <label>Mật khẩu đăng nhập<input aria-label="Mật khẩu đăng nhập để xem số thẻ" type="password" autoComplete="current-password" required maxLength={200} value={password} disabled={busy} onChange={event=>setPassword(event.target.value)}/></label>
            <p>Xác thực lại để xem đầy đủ số thẻ của bạn.</p>
            {error&&<p role="alert" className="card-number-error">{error}</p>}
            <footer><button type="button" className="btn-secondary" onClick={hide}>Hủy</button><button className="btn-primary" disabled={busy}>{busy?'Đang xác thực…':'Xác thực và hiện số thẻ'}</button></footer>
          </form>}
    </div>
    {children}
  </div>;
}
