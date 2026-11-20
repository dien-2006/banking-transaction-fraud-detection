"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { ApiError, apiRequest } from "@/services/api.client";

interface Challenge { challengeId: string; expiresIn: number; resendAfter: number }
interface Registered { customerId: string; code: string; name: string; username: string }
const inputClass = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:border-coral focus:ring-2 focus:ring-rose-100 disabled:bg-slate-50";

export function RegisterForm({ mode = "registration" }: { mode?: "registration" | "activation" }) {
  const activation = mode === "activation";
  const endpoint = `/auth/${mode}`;
  const [customerCode, setCustomerCode] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Registered | null>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    if ((!challenge && !resendAt) || result) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [challenge, resendAt, result]);
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const expiresIn = Math.max(0, Math.ceil((expiresAt - now) / 1000));

  const sendCode = async () => {
    const response = await apiRequest<Challenge>(`${endpoint}/otp`, {
      method: "POST", body: JSON.stringify({ email: email.trim().toLowerCase(),
        ...(activation ? { customerCode: customerCode.trim().toUpperCase() } : {}) }), timeoutMs: 20000,
    });
    const time = Date.now();
    setNow(time); setChallenge(response); setCode("");
    setResendAt(time + response.resendAfter * 1000);
    setExpiresAt(time + response.expiresIn * 1000);
  };
  const perform = async (operation: () => Promise<void>, submitting = false) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try { await operation(); }
    catch (cause) {
      if (cause instanceof ApiError && cause.retryAfter) {
        setNow(Date.now()); setResendAt(Date.now() + cause.retryAfter * 1000);
      }
      setError(submitting && (!(cause instanceof ApiError) || cause.status >= 500)
        ? `Chưa xác định được kết quả ${activation ? "kích hoạt" : "đăng ký"}. Giữ nguyên thông tin và thử lại cùng mã; nếu mã hết hạn, kiểm tra đăng nhập trước khi gửi lại yêu cầu.`
        : cause instanceof Error ? cause.message : "Không thể kết nối. Vui lòng thử lại.");
    } finally { inFlight.current = false; setBusy(false); }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmation) { setError("Mật khẩu xác nhận chưa khớp."); return; }
    if (new TextEncoder().encode(password).length > 72) { setError("Mật khẩu không được vượt quá 72 byte UTF-8."); return; }
    if (!challenge) { await perform(sendCode); return; }
    await perform(async () => {
      const registered = await apiRequest<Registered>(endpoint, {
        method: "POST", timeoutMs: 25000,
        body: JSON.stringify({ ...(activation ? { customerCode: customerCode.trim().toUpperCase() } : { name: name.trim(), phone: phone.trim() }), email: email.trim().toLowerCase(),
          username: username.trim().toLowerCase(), password, challengeId: challenge.challengeId, code, acceptedTerms: accepted }),
      });
      if (!registered?.code || !registered?.username) throw new Error(`Phản hồi ${activation ? "kích hoạt" : "đăng ký"} chưa hợp lệ.`);
      setResult(registered); setPassword(""); setConfirmation(""); setCode("");
    }, true);
  };
  if (result) return <div role="status" className="space-y-4 text-center">
    <CheckCircle2 className="mx-auto text-emerald-600" size={48} aria-hidden="true" />
    <h2 className="text-xl font-bold">{activation ? "Kích hoạt thành công" : "Đăng ký thành công"}</h2>
    <p className="text-sm text-slate-600">Bạn có thể đăng nhập bằng tài khoản vừa tạo.</p>
    <dl className="rounded-xl border border-slate-200 p-4 text-left text-sm">
      <div className="flex flex-wrap justify-between gap-2"><dt>Mã khách hàng</dt><dd className="font-bold">{result.code}</dd></div>
      <div className="mt-3 flex flex-wrap justify-between gap-2"><dt>Tên đăng nhập</dt><dd className="break-all font-bold">{result.username}</dd></div>
    </dl>
    <p className="text-xs leading-5 text-slate-500">{activation ? "Đã tạo đăng nhập cho hồ sơ khách hàng hiện có. Bạn có thể đăng nhập để xem các tài khoản ngân hàng của mình." : "Đã tạo tài khoản đăng nhập. Hồ sơ chưa được xác minh danh tính và chưa có tài khoản ngân hàng."}</p>
  </div>;

  return <form onSubmit={submit} className="space-y-5">
    <ol aria-label={activation ? "Các bước kích hoạt" : "Các bước đăng ký"} className="flex gap-3 text-sm font-semibold">
      <li className={!challenge ? "text-coral" : "text-slate-500"}>1. Thông tin</li>
      <li aria-hidden="true" className="text-slate-300">/</li>
      <li className={challenge ? "text-coral" : "text-slate-400"}>2. Xác minh email</li>
    </ol>
    {!challenge ? <fieldset disabled={busy} className="space-y-4">
      {activation ? <label className="block text-sm font-semibold" htmlFor="activation-customer-code">Mã khách hàng <span className="text-coral">*</span>
        <input id="activation-customer-code" required maxLength={20} autoCapitalize="characters" spellCheck={false} placeholder="Ví dụ: C0000101" value={customerCode} onChange={e => setCustomerCode(e.target.value)} className={inputClass} aria-describedby="activation-code-hint" />
        <span id="activation-code-hint" className="mt-1 block text-xs font-normal text-slate-500">Dùng mã khách hàng do chi nhánh cung cấp, không phải số tài khoản ngân hàng.</span>
      </label> : <><label className="block text-sm font-semibold" htmlFor="signup-name">Họ và tên <span className="text-coral">*</span>
        <input id="signup-name" autoComplete="name" required maxLength={150} value={name} onChange={e => setName(e.target.value)} className={inputClass} />
      </label>
      <label className="block text-sm font-semibold" htmlFor="signup-phone">Điện thoại <span className="text-coral">*</span>
        <input id="signup-phone" type="tel" autoComplete="tel" required pattern="\+?[0-9]{9,15}" maxLength={16} value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} />
      </label></>}
      <label className="block text-sm font-semibold" htmlFor="signup-email">Email nhận OTP <span className="text-coral">*</span>
        <input id="signup-email" type="email" autoComplete="email" required maxLength={150} value={email} onChange={e => setEmail(e.target.value)} className={inputClass} />
        {activation && <span className="mt-1 block text-xs font-normal text-slate-500">Nhập đúng email đã đăng ký với chi nhánh. Nếu chưa cung cấp email, hãy liên hệ chi nhánh bổ sung trước.</span>}
      </label>
      <label className="block text-sm font-semibold" htmlFor="signup-username">Tên đăng nhập <span className="text-coral">*</span>
        <input id="signup-username" autoComplete="username" required minLength={3} maxLength={50} pattern="[a-zA-Z0-9][a-zA-Z0-9._\-]{2,49}" value={username} onChange={e => setUsername(e.target.value)} className={inputClass} aria-describedby="signup-username-hint" />
        <span id="signup-username-hint" className="mt-1 block text-xs font-normal text-slate-500">3–50 ký tự: chữ không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới.</span>
      </label>
      <label className="block text-sm font-semibold" htmlFor="signup-password">Mật khẩu <span className="text-coral">*</span>
        <input id="signup-password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={8} maxLength={72} value={password} onChange={e => setPassword(e.target.value)} className={inputClass} />
      </label>
      <label className="block text-sm font-semibold" htmlFor="signup-confirmation">Xác nhận mật khẩu <span className="text-coral">*</span>
        <input id="signup-confirmation" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={8} maxLength={72} value={confirmation} onChange={e => setConfirmation(e.target.value)} className={inputClass} />
      </label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showPassword} onChange={e => setShowPassword(e.target.checked)} />Hiện mật khẩu</label>
      <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" className="mt-1" required checked={accepted} onChange={e => setAccepted(e.target.checked)} />{activation ? "Tôi xác nhận đây là hồ sơ của tôi và đồng ý kích hoạt tài khoản đăng nhập D4 Bank." : "Tôi xác nhận thông tin đăng ký chính xác và đồng ý tạo tài khoản đăng nhập D4 Bank."}</label>
    </fieldset> : <div className="space-y-4">
      <div className="rounded-xl bg-slate-50 p-4 text-sm leading-6"><Mail size={20} className="mb-2 text-coral" aria-hidden="true" />{activation ? <>Nếu mã khách hàng và email khớp hồ sơ chưa có đăng nhập, mã kích hoạt sẽ được gửi tới <strong className="break-all">{email.trim().toLowerCase()}</strong>. Nếu chưa nhận được, kiểm tra mã khách hàng, email và thư mục Spam; liên hệ chi nhánh nếu cần cập nhật hồ sơ.</> : <>Yêu cầu gửi mã tới <strong className="break-all">{email.trim().toLowerCase()}</strong> đã được tiếp nhận. Email có thể đến chậm; kiểm tra cả Spam và Quảng cáo. Nếu chưa nhận được, bạn có thể gửi lại mã sau thời gian chờ bên dưới.</>}</div>
      <label htmlFor="signup-otp" className="block text-sm font-semibold">Mã xác nhận 6 chữ số
        <input id="signup-otp" autoFocus inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} disabled={busy} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} className={`${inputClass} text-center text-xl tracking-[0.35em]`} />
      </label>
      <p className="text-sm text-slate-500">{expiresIn > 0 ? `Mã còn hiệu lực ${Math.floor(expiresIn / 60)}:${String(expiresIn % 60).padStart(2, "0")}` : "Mã đã hết hạn. Vui lòng gửi lại mã."}</p>
      <div className="flex flex-wrap justify-between gap-3 text-sm font-semibold">
        <button type="button" disabled={busy || resendIn > 0} className="text-coral disabled:text-slate-400" onClick={() => void perform(sendCode)}>{resendIn > 0 ? `Gửi lại mã sau ${resendIn}s` : "Gửi lại mã"}</button>
        <button type="button" disabled={busy} onClick={() => { setChallenge(null); setCode(""); setError(""); }} className="text-slate-500">Chỉnh sửa thông tin</button>
      </div>
    </div>}
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm leading-6 text-rose-700">{error}</p>}
    <button type="submit" disabled={busy || (!!challenge && expiresIn === 0) || (!challenge && resendIn > 0)} className="btn-primary w-full justify-center disabled:opacity-50">
      {busy ? "Đang xử lý…" : challenge ? activation ? "Xác nhận kích hoạt" : "Xác nhận đăng ký" : resendIn > 0 ? `Gửi mã sau ${resendIn}s` : "Gửi mã xác nhận"}
    </button>
    {!challenge && <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck size={18} className="shrink-0" aria-hidden="true" /><span>{activation ? "Chức năng này dành cho hồ sơ chưa có đăng nhập. Nếu đã có tài khoản, hãy đăng nhập hoặc liên hệ chi nhánh để khôi phục." : <>Đã có hồ sơ tại chi nhánh? <Link href="/activate" className="font-semibold text-coral underline">Kích hoạt ngân hàng trực tuyến</Link>.</>}</span></p>}
  </form>;
}
