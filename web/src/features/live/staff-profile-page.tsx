"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Headphones,
  KeyRound,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useSessionUser } from "@/components/session-context";
import { Modal } from "@/components/ui";
import { authService } from "@/services/auth.service";
import { bankService } from "@/services/bank.service";
import { formatDate } from "@/lib/presentation";
import { profileValue, profileInitials } from "@/lib/customer-profile";
import {
  ProfileRow,
  ProfileSection,
} from "@/features/customer/customer-profile";
import {
  CustomerEmpty,
  CustomerLoading,
  CustomerStatus,
} from "@/features/customer/customer-ui";
import { ReferenceArtwork } from "@/features/customer/reference-artwork";

export function StaffProfilePage() {
  const user = useSessionUser();
  const [guide, setGuide] = useState<string | null>(null),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false);
  const query = useQuery({
    queryKey: ["employee-profile", user.role, user.id],
    queryFn: bankService.employeeProfile,
  });
  const mutation = useMutation({
    mutationFn: ({
      oldPassword,
      newPassword,
    }: {
      oldPassword: string;
      newPassword: string;
    }) => authService.changePassword(oldPassword, newPassword),
    onSuccess: () => {
      setOpen(false);
      setSuccess(true);
    },
  });
  const profile = query.data ?? {},
    text = (key: string) => profileValue(profile[key]),
    name = text("fullname");
  const details = [
    [UserRound, "Họ và tên", name],
    [CalendarDays, "Ngày sinh", formatDate(profile.dateofbirth)],
    [
      UserRound,
      "Giới tính",
      (
        {
          Male: "Nam",
          Female: "Nữ",
          Other: "Khác",
          Unknown: "Chưa cập nhật",
        } as Record<string, string>
      )[text("gender")] ?? text("gender"),
    ],
    [Phone, "Số điện thoại", text("phone")],
    [Mail, "Email", text("email")],
    [BriefcaseBusiness, "Mã nhân viên", text("employeecode")],
    [Building2, "Chi nhánh công tác", text("branchname")],
    [CalendarDays, "Ngày vào làm", formatDate(profile.hiredate)],
    [UserRound, "Tên đăng nhập", text("username")],
  ] as const;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutation.isPending) return;
    setError("");
    const form = new FormData(event.currentTarget),
      oldPassword = String(form.get("oldPassword") ?? ""),
      newPassword = String(form.get("newPassword") ?? "");
    if (newPassword.length < 8)
      return setError("Mật khẩu mới phải có ít nhất 8 ký tự.");
    if (newPassword !== String(form.get("confirm") ?? ""))
      return setError("Mật khẩu xác nhận không khớp.");
    mutation.mutate({ oldPassword, newPassword });
  };
  return (
    <div className="customer-screen customer-profile-screen staff-profile-screen">
      <header className="customer-page-hero cp-hero">
        <ReferenceArtwork region="profileHero" className="cp-hero-art" />
        <div className="cp-hero-copy">
          <nav aria-label="Đường dẫn">
            <Link href={`/${user.role}`}>Trang chủ</Link>
            <ChevronRight size={13} />
            <span>Hồ sơ cá nhân</span>
          </nav>
          <h1>
            Hồ sơ <span>cá nhân</span>
          </h1>
          <p>Quản lý thông tin công tác, bảo mật và tài khoản của bạn.</p>
        </div>
      </header>
      {query.isPending ? (
        <CustomerLoading />
      ) : query.isError || !query.data || !Object.keys(profile).length ? (
        <CustomerEmpty error retry={() => void query.refetch()}>
          Không thể tải hồ sơ nhân viên.
        </CustomerEmpty>
      ) : (
        <div className="cp-workspace">
          <section className="customer-box cp-personal">
            <header>
              <h2>Thông tin nhân viên</h2>
              <button
                type="button"
                className="cp-edit"
                onClick={() => setGuide("Cập nhật thông tin")}
              >
                Chỉnh sửa
              </button>
            </header>
            <div className="cp-intro">
              <div className="cp-avatar">
                <span>{profileInitials(profile.fullname)}</span>
              </div>
              <div>
                <h2>{name}</h2>
                <span>{text("rolename")}</span>
              </div>
            </div>
            <dl className="cp-fields">
              {details.map(([Icon, label, value]) => (
                <div key={label}>
                  <dt>
                    <i>
                      <Icon size={18} />
                    </i>
                    {label}
                  </dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <footer className="cp-personal-footer">
              <span>Trạng thái nhân viên</span>
              <CustomerStatus status={text("status")} />
            </footer>
          </section>
          <aside className="cp-sidebar">
            <ProfileSection
              title="Bảo mật tài khoản"
              description="Kiểm tra thông tin đăng nhập và bảo vệ tài khoản."
              icon={ShieldCheck}
              tone="orange"
            >
              {success && (
                <div className="cp-feedback" role="status">
                  Đổi mật khẩu thành công.
                </div>
              )}
              <ProfileRow
                label="Đổi mật khẩu"
                icon={KeyRound}
                onClick={() => {
                  mutation.reset();
                  setError("");
                  setSuccess(false);
                  setOpen(true);
                }}
              />
              <ProfileRow
                label="Xác thực nhiều lớp"
                icon={ShieldCheck}
                note="Chưa hỗ trợ"
                onClick={() => setGuide("Xác thực nhiều lớp")}
              />
              <ProfileRow
                label="Thiết bị đăng nhập"
                icon={UserRound}
                note="Chưa hỗ trợ"
                onClick={() => setGuide("Thiết bị đăng nhập")}
              />
            </ProfileSection>
            <ProfileSection
              title="Thông báo"
              description="Công việc và cảnh báo trong phạm vi được cấp quyền."
              icon={Bell}
            >
              <ProfileRow
                label="Thông báo trên ứng dụng"
                icon={Bell}
                href={`/${user.role}/notifications`}
              />
              <ProfileRow
                label="Thông báo qua Email"
                icon={Mail}
                note="Chưa hỗ trợ"
                onClick={() => setGuide("Thông báo qua Email")}
              />
            </ProfileSection>
            <ProfileSection
              title="Hỗ trợ"
              description="Liên hệ bộ phận quản trị hoặc chi nhánh quản lý."
              icon={Headphones}
            >
              <ProfileRow
                label="Hướng dẫn sử dụng"
                icon={CircleHelp}
                onClick={() => setGuide("Hướng dẫn sử dụng")}
              />
              <ProfileRow
                label="Liên hệ hỗ trợ nội bộ"
                icon={MessageCircle}
                onClick={() => setGuide("Liên hệ hỗ trợ nội bộ")}
              />
            </ProfileSection>
          </aside>
        </div>
      )}
      <Modal
        open={open}
        onOpenChange={(value) => !mutation.isPending && setOpen(value)}
        title="Đổi mật khẩu"
        description="Mật khẩu mới phải có ít nhất 8 ký tự."
      >
        <form className="cp-password-form" onSubmit={submit}>
          <fieldset disabled={mutation.isPending}>
            {[
              ["oldPassword", "Mật khẩu hiện tại"],
              ["newPassword", "Mật khẩu mới"],
              ["confirm", "Xác nhận mật khẩu mới"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  name={key}
                  required
                  type="password"
                  autoComplete={
                    key === "oldPassword" ? "current-password" : "new-password"
                  }
                  minLength={key === "oldPassword" ? undefined : 8}
                />
              </label>
            ))}
          </fieldset>
          {(error || mutation.isError) && (
            <p role="alert">{error || mutation.error?.message}</p>
          )}
          <button className="customer-button" disabled={mutation.isPending}>
            {mutation.isPending ? "Đang cập nhật…" : "Xác nhận đổi mật khẩu"}
          </button>
        </form>
      </Modal>
      <Modal
        open={!!guide}
        onOpenChange={(value) => !value && setGuide(null)}
        title={guide ?? "Hỗ trợ"}
        description="Hồ sơ nhân viên D4 Bank."
      >
        <div className="cp-guide">
          <p>
            {guide === "Cập nhật thông tin"
              ? "Liên hệ quản trị viên hoặc bộ phận nhân sự để xác minh và cập nhật hồ sơ. Chỉnh sửa trực tiếp chưa được hỗ trợ trên web."
              : guide === "Hướng dẫn sử dụng"
                ? "Sử dụng menu để mở các phân hệ được cấp quyền. Tìm kiếm, lọc và phân trang danh sách để tra cứu. Kiểm tra thông tin trước khi xác nhận thao tác nghiệp vụ."
                : guide === "Liên hệ hỗ trợ nội bộ"
                  ? "Liên hệ quản lý chi nhánh hoặc quản trị viên hệ thống để được hỗ trợ về tài khoản và nghiệp vụ. Không chia sẻ mật khẩu hoặc thông tin truy cập."
                  : "Tính năng này chưa được hỗ trợ cho tài khoản nhân viên trên web."}
          </p>
        </div>
      </Modal>
    </div>
  );
}
