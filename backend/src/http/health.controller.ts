import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Public } from '../security/decorators';
@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}
  @Public() @Get() async health() {
    const [database, riskModel] = await Promise.all([
      this.db.function<Record<string,unknown>>('banking_api.health'), this.db.riskModelHealth(),
    ]);
    return { ...database, riskModel };
  }
}
