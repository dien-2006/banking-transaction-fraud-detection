"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, BarChart3, ChevronDown, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound, UsersRound, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { authService } from "@/services/auth.service";
import "./auth-form.css";

const schema = z.object({
  username: z.string().min(1, "Vui lòng nhập tên đăng nhập"),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
  role: z.enum(["admin", "employee", "customer"]),
  remember: z.boolean(),
});
type Values = z.infer<typeof schema>;

function LoginBrand() {
  return <div className="login-brand"><span><i/><i/><i/></span><div><b>D4 <em>Bank</em></b><small>Data for a brighter tomorrow</small></div></div>;
}

export function AuthForm() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "", role: "customer", remember: true },
  });

  useEffect(() => {
    // The login screen always starts a new authentication flow. Clearing an
    // expired token here prevents an old browser session from blocking login.
    authService.logout();
  }, []);

  const submit = async (values: Values) => {
    try {
      setError("");
      setSuccess("");
      const user = await authService.login(values.username, values.password, values.role, values.remember);
      setSuccess(`Đăng nhập thành công. Xin chào ${user.name}!`);
      await new Promise((resolve) => setTimeout(resolve, 700));
      router.replace(`/${user.role}`);
    } catch (caught) {
      setSuccess("");
      setError(caught instanceof Error ? caught.message : "Không thể đăng nhập");
    }
  };

  return <main className="login-page">
    <section className="login-showcase">
      <LoginBrand/>
      <div className="login-intro">
        <h1>Chào mừng đến với<br/><span>D4 <em>Bank</em></span></h1>
        <p>Ngân hàng số hiện đại, an toàn và thông minh<br/>vì một tương lai tài chính tốt đẹp hơn.</p>
        <div>{[
          [ShieldCheck,"An toàn và bảo mật","Bảo vệ dữ liệu khách hàng là ưu tiên hàng đầu"],
          [Zap,"Giao dịch nhanh chóng","24/7 mọi lúc mọi nơi"],
          [BarChart3,"Dữ liệu minh bạch","Theo dõi và quản lý tài chính hiệu quả"],
          [UsersRound,"Dịch vụ toàn diện","Đa dạng sản phẩm, đáp ứng mọi nhu cầu"],
        ].map(([Icon,title,description]) => { const FeatureIcon=Icon as typeof ShieldCheck; return <article key={title as string}><i><FeatureIcon/></i><p><b>{title as string}</b><span>{description as string}</span></p></article>; })}</div>
      </div>
      <div className="login-city" aria-hidden="true">{[35,48,57,43,68,88,55,74].map((height,index)=><i key={index} style={{height:`${height}%`}}/>)}</div>
      <img className="login-headquarters" src="/d4-headquarters.png" alt="Trụ sở D4 Bank"/>
      <small className="login-copyright">© 2026 D4 Bank. All rights reserved.</small>
    </section>
    <section className="login-form-side">
      <button className="login-language"><span>🇻🇳</span> Tiếng Việt <ChevronDown/></button>
      <div className="login-card">
        <div className="login-mobile-brand"><LoginBrand/></div>
        <h2>Đăng nhập vào hệ thống</h2>
        <p>Vui lòng chọn loại tài khoản và đăng nhập để tiếp tục sử dụng hệ thống D4 Bank.</p>
        <form onSubmit={handleSubmit(submit)}>
          <label className="login-label">Loại tài khoản<select {...register("role")}><option value="customer">Khách hàng cá nhân</option><option value="employee">Nhân viên ngân hàng</option><option value="admin">Quản trị viên</option></select></label>
          <label className="login-label">Tên đăng nhập<span className="login-field"><UserRound/><input autoComplete="username" placeholder="Nhập tên đăng nhập" {...register("username")}/></span>{errors.username&&<small className="login-error">{errors.username.message}</small>}</label>
          <label className="login-label">Mật khẩu<span className="login-field"><LockKeyhole/><input autoComplete="current-password" placeholder="Nhập mật khẩu" type={visible?"text":"password"} {...register("password")}/><button type="button" aria-label={visible?"Ẩn mật khẩu":"Hiện mật khẩu"} onClick={()=>setVisible(!visible)}>{visible?<EyeOff/>:<Eye/>}</button></span>{errors.password&&<small className="login-error">{errors.password.message}</small>}</label>
          <div className="login-options"><label><input type="checkbox" {...register("remember")}/><span>✓</span>Ghi nhớ đăng nhập</label><Link href="/forgot-password">Quên mật khẩu?</Link></div>
          {error&&<p className="login-submit-error" role="alert" aria-live="assertive">{error}</p>}
          {success&&<p className="login-submit-success" role="status" aria-live="polite">{success}</p>}
          <button className="login-submit" disabled={isSubmitting}>{isSubmitting?(success?"Đăng nhập thành công":"Đang đăng nhập..."):"Đăng nhập"}<ArrowRight/></button>
        </form>
        <p className="login-register">Chưa có tài khoản? <Link href="/register">Xem hướng dẫn đăng ký <ArrowRight/></Link></p>
      </div>
      <footer><span>Đăng nhập bảo mật qua D4 Bank API</span></footer>
    </section>
  </main>;
}
