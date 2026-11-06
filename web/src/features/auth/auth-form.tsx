"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  BarChart3,
  ChevronDown,
  Eye,
  EyeOff,
  Fingerprint,
  LockKeyhole,
  ShieldCheck,
  ShieldAlert,
  UserRound,
  UsersRound,
  Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Modal } from "@/components/ui";
import { BrandMark } from "@/components/brand";
import { authService } from "@/services/auth.service";
import { ApiError } from "@/services/api.client";
import "./auth-form.css";

const schema = z.object({
  username: z.string().min(1, "Vui lòng nhập tên đăng nhập"),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
  remember: z.boolean(),
});
type Values = z.infer<typeof schema>;
type Notice = { title: string; content: string };

const features = [
  [
    ShieldCheck,
    "An toàn và bảo mật",
    "Bảo vệ dữ liệu khách hàng là ưu tiên hàng đầu",
  ],
  [Zap, "Giao dịch nhanh chóng", "24/7 mọi lúc mọi nơi"],
  [BarChart3, "Dữ liệu minh bạch", "Theo dõi và quản lý tài chính hiệu quả"],
  [UsersRound, "Dịch vụ toàn diện", "Đa dạng sản phẩm, đáp ứng mọi nhu cầu"],
] as const;

const information: Record<string, Notice> = {
  terms: {
    title: "Điều khoản sử dụng",
    content:
      "D4 Bank là website ngân hàng mô phỏng phục vụ học tập và kiểm thử. Không sử dụng thông tin xác thực của tài khoản ngân hàng thật trên hệ thống này.",
  },
  privacy: {
    title: "Chính sách bảo mật",
    content:
      "Phiên đăng nhập được lưu trên trình duyệt theo lựa chọn Ghi nhớ đăng nhập. Khi bỏ chọn, phiên chỉ được lưu trong phiên duyệt hiện tại. Đăng xuất để xóa phiên khỏi trình duyệt đang dùng.",
  },
  support: {
    title: "Hỗ trợ đăng nhập",
    content:
      "Sử dụng tên đăng nhập đã được cấp. Nếu quên mật khẩu hoặc tài khoản bị khóa, liên hệ nhân viên hoặc quản trị viên D4 Bank để được hỗ trợ xác minh.",
  },
};

function LoginBrand() {
  return (
    <div
      className="login-brand"
      aria-label="D4 Bank — Data for a brighter tomorrow"
    >
      <BrandMark />
      <div>
        <b>
          D4 <em>Bank</em>
        </b>
        <small>Data for a brighter tomorrow</small>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M43.61 24.46c0-1.36-.12-2.67-.35-3.93H24v7.43h11a9.4 9.4 0 0 1-4.08 6.17v5.13h6.61c3.87-3.56 6.08-8.81 6.08-14.8Z"
      />
      <path
        fill="#34A853"
        d="M24 44c5.52 0 10.15-1.83 13.53-4.97l-6.61-5.13c-1.83 1.23-4.18 1.96-6.92 1.96-5.33 0-9.84-3.6-11.45-8.43H5.72v5.3A20 20 0 0 0 24 44Z"
      />
      <path
        fill="#FBBC05"
        d="M12.55 27.43A12 12 0 0 1 11.91 24c0-1.19.22-2.35.64-3.43v-5.3H5.72A20 20 0 0 0 4 24c0 3.23.77 6.29 2.14 9l6.41-5.57Z"
      />
      <path
        fill="#EA4335"
        d="M24 12.14c3 0 5.68 1.03 7.81 3.05l5.86-5.86C34.12 6.02 29.5 4 24 4A20 20 0 0 0 5.72 15.27l6.83 5.3c1.61-4.83 6.12-8.43 11.45-8.43Z"
      />
    </svg>
  );
}

function MicrosoftMark() {
  return (
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <path fill="#f25022" d="M1 1h12v12H1z" />
      <path fill="#7fba00" d="M15 1h12v12H15z" />
      <path fill="#00a4ef" d="M1 15h12v12H1z" />
      <path fill="#ffb900" d="M15 15h12v12H15z" />
    </svg>
  );
}

export function AuthForm() {
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "", remember: true },
  });

  useEffect(() => {
    authService.logout();
  }, []);

  useEffect(() => {
    if (error) errorRef.current?.focus({ preventScroll: true });
  }, [error]);

  const submit = async (values: Values) => {
    try {
      setError("");
      setSuccess("");
      const user = await authService.login(
        values.username,
        values.password,
        values.remember,
      );
      setSuccess("Đăng nhập thành công. Xin chào " + user.name + "!");
      await new Promise((resolve) => setTimeout(resolve, 700));
      router.replace("/" + user.role);
    } catch (caught) {
      setSuccess("");
      if (caught instanceof ApiError) {
        const messages: Record<number, string> = {
          401: "Tên đăng nhập hoặc mật khẩu chưa chính xác. Vui lòng kiểm tra và thử lại.",
          403: "Tài khoản hiện không được phép đăng nhập. Vui lòng liên hệ bộ phận hỗ trợ.",
          429: "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng đợi một lúc trước khi thử lại.",
        };
        setError(caught.status >= 500
          ? "Hệ thống đang gặp sự cố. Vui lòng thử lại sau ít phút."
          : messages[caught.status] ?? caught.message);
      } else {
        setError(caught instanceof TypeError
          ? "Không thể kết nối đến hệ thống. Vui lòng kiểm tra kết nối mạng và thử lại."
          : "Chưa thể hoàn tất đăng nhập. Vui lòng thử lại.");
      }
    }
  };

  const quickLogin = (provider: string) =>
    setNotice({
      title: "Đăng nhập bằng " + provider,
      content:
        "Đăng nhập bằng " +
        provider +
        " chưa được kết nối trong bản demo này. Vui lòng sử dụng tên đăng nhập và mật khẩu đã được cấp.",
    });

  return (
    <div className="login-viewport">
    <main className="login-page">
      <section
        className="login-showcase"
        aria-label="Chào mừng đến với D4 Bank"
      >
        <Image
          className="login-scene"
          src="/login-background.png"
          alt=""
          fill
          priority
          unoptimized
          sizes="(min-width: 1024px) 55vw, 100vw"
        />
        <LoginBrand />
        <div className="login-intro">
          <h1>
            Chào mừng đến với
            <br />
            <span>
              D4 <em>Bank</em>
            </span>
          </h1>
          <p>
            Ngân hàng số hiện đại, an toàn và thông minh{" "}
            <br className="login-desktop-break" />
            vì một tương lai tài chính tốt đẹp hơn.
          </p>
          <div className="login-features">
            {features.map(([Icon, title, description]) => (
              <article key={title}>
                <i aria-hidden="true">
                  <Icon />
                </i>
                <p>
                  <b>{title}</b>
                  <span>{description}</span>
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="login-form-side" aria-label="Đăng nhập D4 Bank">
        <label className="login-language">
          <span className="login-flag" aria-hidden="true">
            ★
          </span>
          <select aria-label="Ngôn ngữ" defaultValue="vi">
            <option value="vi">Tiếng Việt</option>
          </select>
          <ChevronDown aria-hidden="true" />
        </label>
        <div className="login-card-fit">
        <div className="login-card">
          <div className="login-mobile-brand">
            <LoginBrand />
          </div>
          <h2>Đăng nhập vào hệ thống</h2>
          <p>Vui lòng nhập thông tin tài khoản và đăng nhập để tiếp tục sử dụng hệ thống D4 Bank.</p>
          <form
            noValidate
            onSubmit={handleSubmit(submit)}
            aria-busy={isSubmitting}
          >
            <label className="login-label" htmlFor="login-username">
              Tên đăng nhập
              <span className="login-field">
                <UserRound aria-hidden="true" />
                <input
                  id="login-username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="Nhập tên đăng nhập"
                  aria-invalid={!!errors.username}
                  aria-describedby={
                    errors.username ? "login-username-error" : undefined
                  }
                  {...register("username")}
                />
              </span>
              {errors.username && (
                <small
                  id="login-username-error"
                  className="login-error"
                  role="alert"
                >
                  {errors.username.message}
                </small>
              )}
            </label>
            <label className="login-label" htmlFor="login-password">
              Mật khẩu
              <span className="login-field">
                <LockKeyhole aria-hidden="true" />
                <input
                  id="login-password"
                  autoComplete="current-password"
                  placeholder="Nhập mật khẩu"
                  type={visible ? "text" : "password"}
                  aria-invalid={!!errors.password}
                  aria-describedby={
                    errors.password ? "login-password-error" : undefined
                  }
                  {...register("password")}
                />
                <button
                  type="button"
                  aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  aria-pressed={visible}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff /> : <Eye />}
                </button>
              </span>
              {errors.password && (
                <small
                  id="login-password-error"
                  className="login-error"
                  role="alert"
                >
                  {errors.password.message}
                </small>
              )}
            </label>
            <div className="login-options">
              <label>
                <input type="checkbox" {...register("remember")} />
                <span aria-hidden="true">✓</span>Ghi nhớ đăng nhập
              </label>
              <Link href="/forgot-password">Quên mật khẩu?</Link>
            </div>
            {error && (
              <div
                ref={errorRef}
                className="login-submit-error login-failure"
                role="alert"
                aria-live="assertive"
                aria-atomic="true"
                tabIndex={-1}
              >
                <span className="login-failure-icon" aria-hidden="true"><ShieldAlert /></span>
                <div>
                  <h3>Đăng nhập chưa thành công</h3>
                  <p>{error}</p>
                </div>
              </div>
            )}
            {success && (
              <p
                className="login-submit-success"
                role="status"
                aria-live="polite"
              >
                {success}
              </p>
            )}
            <button
              type="submit"
              className="login-submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? success
                  ? "Đăng nhập thành công"
                  : "Đang đăng nhập..."
                : error ? "Thử đăng nhập lại" : "Đăng nhập"}
              <ArrowRight aria-hidden="true" />
            </button>
          </form>
          <div className="login-divider">
            <span>Hoặc đăng nhập nhanh với</span>
          </div>
          <div
            className="quick-login"
            aria-label="Các phương thức đăng nhập khác"
          >
            <button
              type="button"
              aria-label="Đăng nhập bằng Google"
              title="Google — chưa kết nối"
              onClick={() => quickLogin("Google")}
            >
              <GoogleMark />
            </button>
            <button
              type="button"
              aria-label="Đăng nhập bằng Microsoft"
              title="Microsoft — chưa kết nối"
              onClick={() => quickLogin("Microsoft")}
            >
              <MicrosoftMark />
            </button>
            <button
              type="button"
              aria-label="Đăng nhập bằng vân tay"
              title="Vân tay — chưa kết nối"
              onClick={() => quickLogin("vân tay")}
            >
              <Fingerprint />
            </button>
          </div>
          <p className="login-register">
            Chưa có tài khoản?{" "}
            <Link href="/register">
              Đăng ký ngay <ArrowRight aria-hidden="true" />
            </Link>
          </p>
        </div>
        </div>
      </section>
      <footer className="login-footer">
        <small>© 2026 D4 Bank. All rights reserved.</small>
        <nav aria-label="Thông tin và hỗ trợ">
          <button type="button" onClick={() => setNotice(information.terms)}>
            Điều khoản sử dụng
          </button>
          <button type="button" onClick={() => setNotice(information.privacy)}>
            Chính sách bảo mật
          </button>
          <button type="button" onClick={() => setNotice(information.support)}>
            Hỗ trợ
          </button>
        </nav>
      </footer>
      <Modal
        open={!!notice}
        onOpenChange={(open) => {
          if (!open) setNotice(null);
        }}
        title={notice?.title ?? "Thông tin D4 Bank"}
      >
        <p className="text-sm leading-7 text-slate-600">{notice?.content}</p>
        <button
          type="button"
          className="btn-primary mt-5 h-10 w-full"
          onClick={() => setNotice(null)}
        >
          Đã hiểu
        </button>
      </Modal>
    </main>
    </div>
  );
}
