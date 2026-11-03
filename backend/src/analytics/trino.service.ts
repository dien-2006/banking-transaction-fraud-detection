import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

interface TrinoResponse {
  columns?: { name: string }[];
  data?: unknown[][];
  nextUri?: string;
  error?: { message?: string };
}

@Injectable()
export class TrinoService {
  private readonly url?: string;
  private readonly user: string;
  constructor(config: ConfigService) {
    this.url = config.get<string>("TRINO_URL")?.replace(/\/$/, "");
    this.user = config.get<string>("TRINO_USER", "d4-bank-api");
  }
  async query(sql: string): Promise<Record<string, unknown>[]> {
    if (!this.url)
      throw new ServiceUnavailableException(
        "Trino analytics is not configured",
      );
    let response = await this.request(`${this.url}/v1/statement`, {
      method: "POST",
      body: sql,
    });
    const rows: Record<string, unknown>[] = [];
    const deadline = Date.now() + 60_000;
    let columns = response.columns?.map((column) => column.name) ?? [];
    for (;;) {
      if (response.error)
        throw new ServiceUnavailableException(
          response.error.message ?? "Trino query failed",
        );
      if (response.columns)
        columns = response.columns.map((column) => column.name);
      for (const data of response.data ?? [])
        rows.push(
          Object.fromEntries(columns.map((name, index) => [name, data[index]])),
        );
      if (!response.nextUri) return rows;
      if (Date.now() >= deadline)
        throw new ServiceUnavailableException("Trino query timed out");
      response = await this.request(response.nextUri, { method: "GET" });
    }
  }
  async activeRelease(): Promise<{
    schema_name: string;
    batch_id: string;
    published_at: string | null;
  }> {
    let rows: Record<string, unknown>[];
    try {
      rows = await this.query(
        "SELECT schema_name,batch_id,published_at FROM hive.gold.active_release",
      );
    } catch (error) {
      if (
        error instanceof Error &&
        /TABLE_NOT_FOUND|Table .*active_release.*does not exist/i.test(
          error.message,
        )
      )
        return { schema_name: "gold", batch_id: "legacy", published_at: null };
      throw error;
    }
    const row = rows[0];
    if (
      rows.length !== 1 ||
      !row ||
      typeof row.schema_name !== "string" ||
      !/^gold_r_[a-f0-9]{20}$/.test(row.schema_name) ||
      typeof row.batch_id !== "string"
    )
      throw new ServiceUnavailableException("Invalid active Gold release");
    return {
      schema_name: row.schema_name,
      batch_id: row.batch_id,
      published_at:
        typeof row.published_at === "string" ? row.published_at : null,
    };
  }
  private async request(
    url: string,
    init: RequestInit,
  ): Promise<TrinoResponse> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(15_000),
        headers: {
          "X-Trino-User": this.user,
          "X-Trino-Catalog": "hive",
          "X-Trino-Schema": "gold",
        },
      });
    } catch {
      throw new ServiceUnavailableException(
        "Cannot connect to Trino analytics",
      );
    }
    if (!response.ok)
      throw new ServiceUnavailableException(`Trino HTTP ${response.status}`);
    try {
      return (await response.json()) as TrinoResponse;
    } catch {
      throw new ServiceUnavailableException("Invalid Trino analytics response");
    }
  }
}
