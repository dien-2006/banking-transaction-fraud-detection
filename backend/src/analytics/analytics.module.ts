import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { TrinoService } from './trino.service';
@Module({ controllers:[AnalyticsController],providers:[TrinoService] })
export class AnalyticsModule {}
