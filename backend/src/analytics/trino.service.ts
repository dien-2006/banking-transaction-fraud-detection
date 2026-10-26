import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface TrinoResponse { columns?: { name: string }[]; data?: unknown[][]; nextUri?: string; error?: { message?: string } }

@Injectable()
export class TrinoService {
  private readonly url?: string;
  private readonly user: string;
  constructor(config: ConfigService) {
    this.url = config.get<string>('TRINO_URL')?.replace(/\/$/, '');
    this.user = config.get<string>('TRINO_USER', 'd4-bank-api');
  }
  async query(sql: string): Promise<Record<string, unknown>[]> {
    if (!this.url) throw new ServiceUnavailableException('Trino analytics is not configured');
    let response = await this.request(`${this.url}/v1/statement`, { method: 'POST', body: sql });
    const rows: Record<string, unknown>[] = [];
    let columns = response.columns?.map((column) => column.name) ?? [];
    for (;;) {
      if (response.error) throw new ServiceUnavailableException(response.error.message ?? 'Trino query failed');
      if (response.columns) columns = response.columns.map((column) => column.name);
      for (const data of response.data ?? []) rows.push(Object.fromEntries(columns.map((name, index) => [name, data[index]])));
      if (!response.nextUri) return rows;
      response = await this.request(response.nextUri, { method: 'GET' });
    }
  }
  private async request(url: string, init: RequestInit): Promise<TrinoResponse> {
    const response = await fetch(url, { ...init, headers: { 'X-Trino-User': this.user, 'X-Trino-Catalog': 'hive', 'X-Trino-Schema': 'gold' } });
    if (!response.ok) throw new ServiceUnavailableException(`Trino HTTP ${response.status}`);
    return response.json() as Promise<TrinoResponse>;
  }
}
