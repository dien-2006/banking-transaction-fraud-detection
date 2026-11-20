import { AuthSimple } from "@/components/auth-simple";
import { RegisterForm } from "@/features/auth/register-form";

export default function ActivatePage() {
  return <AuthSimple title="Kích hoạt ngân hàng trực tuyến" description="Đã được chi nhánh tạo hồ sơ? Dùng mã khách hàng và email đã đăng ký để xác minh OTP, rồi tự đặt tên đăng nhập và mật khẩu.">
    <RegisterForm mode="activation" />
  </AuthSimple>;
}
