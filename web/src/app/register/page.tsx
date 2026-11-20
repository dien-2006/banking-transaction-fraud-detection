import { AuthSimple } from "@/components/auth-simple";
import { RegisterForm } from "@/features/auth/register-form";

export default function RegisterPage() {
  return <AuthSimple title="Đăng ký D4 Bank" description="Tạo tài khoản đăng nhập khách hàng bằng email của bạn. Mã khách hàng được hệ thống tự động cấp khi đăng ký thành công.">
    <RegisterForm />
  </AuthSimple>;
}
