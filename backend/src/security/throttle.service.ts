import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RedisService } from './redis.service';

@Injectable()
export class SecurityThrottle {
  constructor(private readonly redis: RedisService) {}
  async check(scope: string, identity: string, limit: number, seconds: number): Promise<void> {
    this.redis.assertReady();
    const key = `security:attempts:${scope}:${createHash('sha256').update(identity).digest('hex')}`;
    const count = Number(await this.redis.client.eval(`
      local count=redis.call('INCR',KEYS[1])
      if count==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end
      return count`, { keys: [key], arguments: [String(seconds)] }));
    if (count > limit) throw new HttpException('Quá nhiều lần thử. Vui lòng thử lại sau.', HttpStatus.TOO_MANY_REQUESTS);
  }
}
