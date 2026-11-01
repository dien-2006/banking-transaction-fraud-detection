"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  ChevronRight,
  CircleHelp,
  ContactRound,
  Fingerprint,
  Headphones,
  KeyRound,
  Mail,
  MapPin,
  MessageCircle,
  Monitor,
  Pencil,
  Phone,
  ShieldCheck,
  Smartphone,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useSessionUser } from "@/components/session-context";
import { Modal } from "@/components/ui";
import { bankService } from "@/services/bank.service";
import {
  customerProfileFields,
  customerProfileType,
  profileDeviceTime,
  profileInitials,
  profileValue,
} from "@/lib/customer-profile";
import { CustomerEmpty, CustomerLoading, CustomerStatus } from "./customer-ui";
import { ReferenceArtwork } from "./reference-artwork";
import "./customer-profile-view.css";

const fieldIcons: Record<string, LucideIcon> = {
  fullname: UserRound,
  customercode: BadgeCheck,
  dateofbirth: CalendarDays,
  gender: UserRound,
  phone: Phone,
  email: Mail,
  nationalid: ContactRound,
  address: MapPin,
  occupation: BriefcaseBusiness,
};
type Guide =
  "edit" | "avatar" | "otp" | "biometric" | "email" | "sms" | "faq" | "contact";
const guideTitles: Record<Guide, string> = {
  edit: "Cập nhật thông tin cá nhân",
  avatar: "Ảnh đại diện",
  otp: "Xác thực chuyển tiền bằng OTP",
  biometric: "Đăng nhập bằng sinh trắc học",
  email: "Thông báo qua Email",
  sms: "Thông báo qua SMS",
  faq: "Câu hỏi thường gặp",
  contact: "Liên hệ hỗ trợ",
};
const faq = [
  [
    "Làm thế nào để cập nhật hồ sơ?",
    "Liên hệ chi nhánh quản lý tài khoản để được xác minh và hỗ trợ cập nhật thông tin cá nhân, số điện thoại hoặc email.",
  ],
  [
    "Vì sao số CCCD/CMND không hiển thị đầy đủ?",
    "Thông tin định danh được bảo vệ trên web. Để kiểm tra hoặc cập nhật, vui lòng liên hệ chi nhánh.",
  ],
  [
    "OTP chuyển tiền được gửi đến đâu?",
    "OTP chuyển tiền được gửi đến email đã đăng ký. Nếu email chưa đúng, hãy liên hệ chi nhánh để cập nhật trước khi chuyển tiền.",
  ],
  [
    "Tôi có thể thay đổi kênh thông báo không?",
    "Các tùy chọn bật/tắt Email và SMS chưa được hỗ trợ trên web. Bạn vẫn có thể xem thông báo giao dịch trong mục Thông báo.",
  ],
];
export function ProfileSection({
  title,
  description,
  icon: Icon,
  tone = "red",
  children,
  className = "",
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  tone?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`customer-box cp-section ${className}`}>
      <header>
        <i className={tone}>
          <Icon size={24} />
        </i>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      <div className="cp-section-body">{children}</div>
    </section>
  );
}
export function ProfileRow({
  label,
  icon: Icon,
  note,
  onClick,
  href,
}: {
  label: string;
  icon: LucideIcon;
  note?: string;
  onClick?: () => void;
  href?: string;
}) {
  const content = (
    <>
      <Icon size={19} />
      <span>{label}</span>
      {note && <small>{note}</small>}
      <ChevronRight size={17} />
    </>
  );
  return href ? (
    <Link className="cp-action-row" href={href}>
      {content}
    </Link>
  ) : (
    <button className="cp-action-row" type="button" onClick={onClick}>
      {content}
    </button>
  );
}
export function CustomerProfile() {
  const user = useSessionUser();
  const query = useQuery({
    queryKey: ["customer", user.id, "profile"],
    queryFn: bankService.customerProfile,
  });
  const [passwordOpen, setPasswordOpen] = useState(false),
    [devicesOpen, setDevicesOpen] = useState(false),
    [guide, setGuide] = useState<Guide | null>(null);
  const [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const devices = useQuery({
    queryKey: ["customer", user.id, "devices"],
    queryFn: bankService.customerDevices,
    enabled: devicesOpen,
  });
  const passwordMutation = useMutation({
    mutationFn: ({
      oldPassword,
      newPassword,
    }: {
      oldPassword: string;
      newPassword: string;
    }) => bankService.changePassword(oldPassword, newPassword),
    onSuccess: () => {
      setPasswordOpen(false);
      setMessage("Đổi mật khẩu thành công.");
    },
  });
  const profile = query.data ?? {};
  const name = profileValue(profile.fullname),
    email = profileValue(profile.email, "");
  const validProfile =
    !!query.data &&
    typeof query.data === "object" &&
    !Array.isArray(query.data) &&
    Object.keys(query.data).length > 0;
  const openPassword = () => {
    setError("");
    setMessage("");
    passwordMutation.reset();
    setPasswordOpen(true);
  };
  const changePassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (passwordMutation.isPending) return;
    setError("");
    const data = new FormData(event.currentTarget),
      oldPassword = String(data.get("oldPassword") ?? ""),
      newPassword = String(data.get("newPassword") ?? "");
    if (newPassword.length < 8)
      return setError("Mật khẩu mới phải có ít nhất 8 ký tự.");
    if (newPassword !== String(data.get("confirm") ?? ""))
      return setError("Mật khẩu xác nhận không khớp.");
    passwordMutation.mutate({ oldPassword, newPassword });
  };
  return (
    <div className="customer-screen customer-profile-screen">
      <header className="customer-page-hero cp-hero">
        <ReferenceArtwork region="profileHero" className="cp-hero-art" />
        <div className="cp-hero-copy">
          <nav aria-label="Đường dẫn">
            <Link href="/customer">Trang chủ</Link>
            <ChevronRight size={13} />
            <span>Hồ sơ cá nhân</span>
          </nav>
          <h1>
            Hồ sơ <span>cá nhân</span>
          </h1>
          <p>
            Quản lý thông tin cá nhân, bảo mật và cài đặt tài khoản của bạn.
          </p>
        </div>
        <p className="cp-hero-slogan" aria-hidden="true">
          Thông tin an toàn
          <br />
          Trải nghiệm trọn vẹn
          <br />
          cùng D4 Bank!
        </p>
        <div className="cp-hero-id" aria-hidden="true">
          <ContactRound size={35} />
          <span>
            THÔNG TIN
            <br />
            KHÁCH HÀNG
          </span>
          <ShieldCheck size={44} />
        </div>
      </header>
      {query.isPending ? (
        <CustomerLoading />
      ) : query.isError || !validProfile ? (
        <CustomerEmpty error retry={() => void query.refetch()}>
          Không thể tải hồ sơ của bạn. Vui lòng thử lại.
        </CustomerEmpty>
      ) : (
        <div className="cp-workspace">
          <section className="customer-box cp-personal">
            <header>
              <h2>Thông tin cá nhân</h2>
              <button
                type="button"
                className="cp-edit"
                onClick={() => setGuide("edit")}
              >
                <Pencil size={14} />
                Chỉnh sửa
              </button>
            </header>
            <div className="cp-intro">
              <div className="cp-avatar">
                <span
                  aria-label={`Ảnh đại diện bằng chữ ${profileInitials(profile.fullname)}`}
                >
                  {profileInitials(profile.fullname)}
                </span>
                <button
                  type="button"
                  aria-label="Thông tin ảnh đại diện"
                  onClick={() => setGuide("avatar")}
                >
                  <Camera size={16} />
                </button>
              </div>
              <div>
                <h2>{name}</h2>
                <span>{customerProfileType(profile.customertype)}</span>
                {profileValue(profile.customersegment, "") && (
                  <small>{profileValue(profile.customersegment)}</small>
                )}
              </div>
            </div>
            <dl className="cp-fields">
              {customerProfileFields(profile).map(([key, label, value]) => {
                const Icon = fieldIcons[key];
                return (
                  <div key={key}>
                    <dt>
                      <i>
                        <Icon size={18} />
                      </i>
                      {label}
                    </dt>
                    <dd>{value}</dd>
                  </div>
                );
              })}
            </dl>
            <footer className="cp-personal-footer">
              <span>Trạng thái khách hàng</span>
              <CustomerStatus status={profileValue(profile.status)} />
            </footer>
          </section>
          <aside className="cp-sidebar">
            <ProfileSection
              title="Bảo mật tài khoản"
              description="Tăng cường bảo mật để bảo vệ tài khoản của bạn."
              icon={ShieldCheck}
              tone="orange"
              className="cp-security"
            >
              {message && (
                <div className="cp-feedback" role="status">
                  {message}
                  <button
                    type="button"
                    onClick={() => setMessage("")}
                    aria-label="Đóng thông báo"
                  >
                    ×
                  </button>
                </div>
              )}
              <ProfileRow
                label="Đổi mật khẩu"
                icon={KeyRound}
                onClick={openPassword}
              />
              <ProfileRow
                label="Xác thực chuyển tiền (OTP)"
                icon={Smartphone}
                note={email ? "Qua email" : "Thiếu email"}
                onClick={() => setGuide("otp")}
              />
              <ProfileRow
                label="Quản lý thiết bị đăng nhập"
                icon={Monitor}
                onClick={() => setDevicesOpen(true)}
              />
              <ProfileRow
                label="Đăng nhập bằng sinh trắc học"
                icon={Fingerprint}
                note="Chưa hỗ trợ"
                onClick={() => setGuide("biometric")}
              />
            </ProfileSection>
            <ProfileSection
              title="Cài đặt thông báo"
              description="Kiểm tra kênh nhận thông báo và thông tin liên hệ."
              icon={Bell}
              className="cp-notification-settings"
            >
              <ProfileRow
                label="Thông báo qua Email"
                icon={Mail}
                note={email ? "Xem địa chỉ" : "Chưa cập nhật"}
                onClick={() => setGuide("email")}
              />
              <ProfileRow
                label="Thông báo qua SMS"
                icon={Smartphone}
                note="Xem thông tin"
                onClick={() => setGuide("sms")}
              />
              <ProfileRow
                label="Thông báo trên ứng dụng"
                icon={Bell}
                href="/customer/notifications"
              />
            </ProfileSection>
            <ProfileSection
              title="Hỗ trợ"
              description="Cần hỗ trợ? Chúng tôi luôn sẵn sàng giúp bạn."
              icon={Headphones}
              className="cp-support"
            >
              <ProfileRow
                label="Câu hỏi thường gặp"
                icon={CircleHelp}
                onClick={() => setGuide("faq")}
              />
              <ProfileRow
                label="Liên hệ hỗ trợ"
                icon={MessageCircle}
                onClick={() => setGuide("contact")}
              />
            </ProfileSection>
          </aside>
        </div>
      )}
      <Modal
        open={passwordOpen}
        onOpenChange={(open) =>
          !passwordMutation.isPending && setPasswordOpen(open)
        }
        title="Đổi mật khẩu"
        description="Mật khẩu mới phải có ít nhất 8 ký tự."
      >
        <form className="cp-password-form" onSubmit={changePassword}>
          <fieldset disabled={passwordMutation.isPending}>
            {[
              ["oldPassword", "Mật khẩu hiện tại"],
              ["newPassword", "Mật khẩu mới"],
              ["confirm", "Xác nhận mật khẩu mới"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="password"
                  name={key}
                  autoComplete={
                    key === "oldPassword" ? "current-password" : "new-password"
                  }
                  minLength={key === "oldPassword" ? undefined : 8}
                  required
                />
              </label>
            ))}
          </fieldset>
          {(error || passwordMutation.isError) && (
            <p role="alert">{error || passwordMutation.error?.message}</p>
          )}
          <button
            className="customer-button"
            disabled={passwordMutation.isPending}
          >
            {passwordMutation.isPending
              ? "Đang cập nhật…"
              : "Xác nhận đổi mật khẩu"}
          </button>
        </form>
      </Modal>
      <Modal
        open={devicesOpen}
        onOpenChange={setDevicesOpen}
        title="Thiết bị đăng nhập"
        description="Danh sách thiết bị đã được đăng ký cho tài khoản của bạn."
      >
        {devices.isPending ? (
          <CustomerLoading />
        ) : devices.isError ? (
          <CustomerEmpty error retry={() => void devices.refetch()}>
            Không thể tải danh sách thiết bị.
          </CustomerEmpty>
        ) : devices.data?.length ? (
          <div className="cp-devices">
            {devices.data.map((item) => (
              <article key={String(item.deviceid)}>
                <header>
                  <Monitor size={21} />
                  <b>
                    {profileValue(
                      item.devicename,
                      profileValue(item.devicetype, "Thiết bị"),
                    )}
                  </b>
                  {item.status === "Removed" ? (
                    <span className="customer-state neutral">Đã gỡ</span>
                  ) : (
                    <CustomerStatus status={profileValue(item.status)} />
                  )}
                </header>
                <p>
                  {profileValue(
                    item.operatingsystem,
                    "Chưa có thông tin hệ điều hành",
                  )}
                </p>
                <p>Lần gần nhất: {profileDeviceTime(item.lastseenat)}</p>
                {user.deviceId != null &&
                  String(user.deviceId) === String(item.deviceid) && (
                    <small>Thiết bị hiện tại</small>
                  )}
                {item.istrusted === true && (
                  <small>Được đánh dấu tin cậy</small>
                )}
              </article>
            ))}
          </div>
        ) : (
          <CustomerEmpty>Chưa có thiết bị được đăng ký.</CustomerEmpty>
        )}
      </Modal>
      <Modal
        open={guide !== null}
        onOpenChange={(open) => !open && setGuide(null)}
        title={guide ? guideTitles[guide] : "Thông tin hồ sơ"}
        description="Hồ sơ và dịch vụ tài khoản D4 Bank."
      >
        {guide && (
          <div className="cp-guide">
            {guide === "edit" && (
              <>
                <p>
                  Để cập nhật họ tên, số điện thoại, email hoặc địa chỉ, vui
                  lòng liên hệ chi nhánh quản lý tài khoản. Nhân viên sẽ xác
                  minh và hướng dẫn cập nhật hồ sơ.
                </p>
                <p>
                  Việc chỉnh sửa thông tin cá nhân trực tiếp trên web chưa được
                  hỗ trợ.
                </p>
              </>
            )}
            {guide === "avatar" && (
              <p>
                Hồ sơ hiện dùng chữ viết tắt từ họ tên của bạn. Việc lưu ảnh đại
                diện vào hồ sơ chưa được hỗ trợ trên web.
              </p>
            )}
            {guide === "otp" && (
              <>
                <p>
                  OTP được gửi qua email khi bạn xác nhận chuyển tiền. Đây là
                  bước xác thực cho từng giao dịch.
                </p>
                <div className="cp-guide-contact">
                  <span>Email đã đăng ký</span>
                  <b>{email || "Chưa cập nhật email"}</b>
                </div>
                {!email && (
                  <p>
                    Liên hệ chi nhánh để bổ sung email trước khi chuyển tiền.
                  </p>
                )}
                <Link href="/customer/transfer">
                  Đến trang chuyển tiền <ArrowRight size={16} />
                </Link>
              </>
            )}
            {guide === "biometric" && (
              <p>
                Web hiện chưa hỗ trợ đăng nhập bằng vân tay hoặc nhận diện khuôn
                mặt. Bạn tiếp tục sử dụng tên đăng nhập và mật khẩu đã đăng ký.
              </p>
            )}
            {guide === "email" && (
              <>
                <div className="cp-guide-contact">
                  <span>Email đã đăng ký</span>
                  <b>{email || "Chưa cập nhật email"}</b>
                </div>
                <p>
                  Email này được dùng để nhận OTP chuyển tiền. Tùy chọn bật/tắt
                  thông báo qua email chưa được hỗ trợ trên web. Liên hệ chi
                  nhánh nếu cần cập nhật địa chỉ email.
                </p>
              </>
            )}
            {guide === "sms" && (
              <>
                <div className="cp-guide-contact">
                  <span>Số điện thoại đã đăng ký</span>
                  <b>{profileValue(profile.phone)}</b>
                </div>
                <p>
                  Web chưa cung cấp trạng thái đăng ký hoặc tùy chọn bật/tắt
                  SMS. Liên hệ chi nhánh để kiểm tra dịch vụ thông báo cho tài
                  khoản của bạn.
                </p>
              </>
            )}
            {guide === "faq" && (
              <div className="cp-faq">
                {faq.map(([question, answer]) => (
                  <details key={question}>
                    <summary>{question}</summary>
                    <p>{answer}</p>
                  </details>
                ))}
              </div>
            )}
            {guide === "contact" && (
              <>
                <p>
                  Liên hệ chi nhánh quản lý tài khoản để được hỗ trợ về hồ sơ,
                  thông tin liên hệ, thẻ hoặc khoản vay. Bạn có thể kiểm tra tên
                  chi nhánh trong thông tin tài khoản của mình.
                </p>
                <Link href="/customer/notifications">
                  Xem thông báo giao dịch <ArrowRight size={16} />
                </Link>
              </>
            )}
            {(guide === "edit" ||
              guide === "email" ||
              guide === "sms" ||
              guide === "contact") && (
              <Link href="/customer/accounts">
                Xem tài khoản và chi nhánh quản lý <ArrowRight size={16} />
              </Link>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
