import { Injectable, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit,OnModuleDestroy {
  readonly client:ReturnType<typeof createClient>;
  constructor(config:ConfigService){this.client=createClient({url:config.get<string>('REDIS_URL','redis://redis:6379')});}
  async onModuleInit(){this.client.on('error',()=>undefined);await this.client.connect();}
  async onModuleDestroy(){if(this.client.isOpen)await this.client.quit();}
  assertReady(){if(!this.client.isReady)throw new ServiceUnavailableException('Security cache is unavailable');}
}
