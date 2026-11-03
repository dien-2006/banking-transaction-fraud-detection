import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Query,
} from "@nestjs/common";
import { CurrentUser, Roles } from "../security/decorators";
import { AuthUser } from "../security/auth.guard";
import { TrinoService } from "./trino.service";

const DATASETS = {
  transactions: "vw_transaction_daily_summary",
  risk: "vw_risk_daily_summary",
  reviews: "vw_review_performance",
  models: "vw_model_performance",
  logins: "vw_login_daily_summary",
  loans: "vw_loan_payment_daily_summary",
} as const;
function sql(
  dataset: string,
  limit: string,
  from: string,
  to: string,
  schema: string,
): string {
  if (!Object.hasOwn(DATASETS, dataset))
    throw new ForbiddenException("Unsupported analytics dataset");
  for (const day of [from, to])
    if (
      day &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
        !Number.isFinite(Date.parse(day)) ||
        new Date(day).toISOString().slice(0, 10) !== day)
    )
      throw new BadRequestException("Khoảng ngày không hợp lệ");
  if (from && to && from > to)
    throw new BadRequestException("Ngày bắt đầu phải trước ngày kết thúc");
  if (!/^(gold|gold_r_[a-f0-9]{20})$/.test(schema))
    throw new BadRequestException("Invalid analytics release");
  const conditions =
    dataset === "models"
      ? []
      : [
          from ? `full_date >= DATE '${from}'` : "",
          to ? `full_date <= DATE '${to}'` : "",
        ].filter(Boolean);
  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  return `SELECT * FROM hive.${schema}.${DATASETS[dataset as keyof typeof DATASETS]}${where} ORDER BY ${dataset === "models" ? "model_key" : "full_date DESC"} LIMIT ${Math.floor(Math.min(Math.max(Number(limit) || 100, 1), 1000))}`;
}
@Controller("analytics")
@Roles("admin")
export class AnalyticsController {
  constructor(private readonly trino: TrinoService) {}
  @Get("snapshot")
  snapshot(
    @CurrentUser() user: AuthUser,
    @Query("limit") limit = "1000",
    @Query("from") from = "",
    @Query("to") to = "",
  ) {
    if (user.role !== "admin") throw new ForbiddenException();
    sql("transactions", limit, from, to, "gold");
    return this.loadSnapshot(limit, from, to);
  }
  private async loadSnapshot(limit: string, from: string, to: string) {
    const release = await this.trino.activeRelease();
    const values = await Promise.all(
      Object.keys(DATASETS).map(async (dataset) => [
        dataset,
        await this.trino.query(
          sql(dataset, limit, from, to, release.schema_name),
        ),
      ]),
    );
    return { release, datasets: Object.fromEntries(values) };
  }
  @Get()
  query(
    @CurrentUser() user: AuthUser,
    @Query("dataset") dataset = "transactions",
    @Query("limit") limit = "100",
    @Query("from") from = "",
    @Query("to") to = "",
  ) {
    if (user.role !== "admin") throw new ForbiddenException();
    sql(dataset, limit, from, to, "gold");
    return this.loadDataset(dataset, limit, from, to);
  }
  private async loadDataset(
    dataset: string,
    limit: string,
    from: string,
    to: string,
  ) {
    const release = await this.trino.activeRelease();
    return this.trino.query(sql(dataset, limit, from, to, release.schema_name));
  }
}
