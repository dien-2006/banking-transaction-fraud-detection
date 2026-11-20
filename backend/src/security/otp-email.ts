import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const logger = new Logger('OtpEmail');

export async function sendOtpEmail(config: ConfigService, email: string, name: string, code: string,
  subject = 'Mã xác thực giao dịch D4 Bank'): Promise<string> {
  const apiKey = config.get<string>('BREVO_API_KEY');
  const sender = config.get<string>('OTP_SENDER_EMAIL');
  if (!apiKey || !sender) throw new ServiceUnavailableException('Dịch vụ gửi OTP chưa được cấu hình. Vui lòng liên hệ quản trị viên.');
  let response: Response;
  try {
    response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { accept: 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ sender: { email: sender, name: config.get<string>('OTP_SENDER_NAME', 'D4 Bank') },
        to: [{ email, name }], subject,
        textContent: `Mã OTP của bạn là ${code}. Mã có hiệu lực trong 5 phút. Không cung cấp mã này cho bất kỳ ai.` }),
    });
  } catch {
    logger.warn('OTP email provider connection failed');
    throw new ServiceUnavailableException('Không kết nối được dịch vụ gửi OTP. Vui lòng thử lại.');
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { code?: unknown };
    const providerCode = typeof detail?.code === 'string' && /^[a-z_]{1,50}$/.test(detail.code) ? detail.code : 'unknown';
    // Never log provider messages: they can contain addresses or credential details.
    logger.warn(`OTP email rejected: status=${response.status}, code=${providerCode}`);
    const message = response.status === 401 || response.status === 403
      ? 'Dịch vụ email chưa được cấp quyền gửi OTP. Vui lòng liên hệ quản trị viên.'
      : response.status === 429
        ? 'Dịch vụ email đang bị giới hạn gửi. Vui lòng thử lại sau.'
        : 'Nhà cung cấp từ chối gửi OTP. Vui lòng liên hệ quản trị viên.';
    throw new ServiceUnavailableException(message);
  }
  const receipt = await response.json().catch(() => null) as { messageId?: unknown } | null;
  if (typeof receipt?.messageId !== 'string' || !receipt.messageId.trim()
    || receipt.messageId.length > 255 || /[\r\n]/.test(receipt.messageId)) {
    logger.warn('OTP email provider returned an invalid receipt');
    throw new ServiceUnavailableException('Chưa xác nhận được yêu cầu gửi OTP. Vui lòng thử lại sau.');
  }
  return receipt.messageId;
}
