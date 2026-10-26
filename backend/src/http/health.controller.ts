import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Public } from '../security/decorators';
@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}
  @Public() @Get() health() { return this.db.function('banking_api.health'); }
}
