import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const logger = new Logger('OtpEmail');

export async function sendOtpEmail(config: ConfigService, email: string, name: string, code: string,
  subject = 'Mã xác thực giao dịch D4 Bank'): Promise<string | null> {
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
    logger.warn(`OTP email rejected: status=${response.status}`);
    throw new ServiceUnavailableException('Không thể gửi email OTP. Vui lòng kiểm tra email và thử lại.');
  }
  const receipt = await response.json() as { messageId?: string };
  return receipt.messageId ?? null;
}
