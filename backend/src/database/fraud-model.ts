import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const FEATURES = ['amount_log', 'is_new_device', 'is_unusual_time',
  'transactions_last_10m', 'failed_logins_last_30m', 'amount_to_average_ratio'] as const;
export interface FraudArtifact {
  version: string;
  intercept: number;
  weights: Record<string, number>;
}
export function validateArtifact(value: unknown): FraudArtifact {
  const model = value as FraudArtifact;
  if (!model || typeof model.version !== 'string' || !model.version.trim()
    || !model.weights || Array.isArray(model.weights)
    || Object.keys(model.weights).length !== FEATURES.length
    || !FEATURES.every(k => typeof model.weights[k] === 'number' && Number.isFinite(model.weights[k]))
    || typeof model.intercept !== 'number' || !Number.isFinite(model.intercept))
    throw new Error('Invalid fraud artifact');
  return model;
}

/** Reads only a local file, retains the last valid version on a broken reload. */
export class CachedFraudModel {
  private model?: FraudArtifact;
  private mtime?: number;
  constructor(private readonly config: ConfigService) {}
  snapshot(): { artifact: FraudArtifact; databaseName: string } {
    const path = this.config.get<string>('MODEL_CACHE_PATH')
      ?? resolve(process.cwd(), '../ml/artifacts/fraud_detection/v1/model.json');
    try {
      const mtime = statSync(path).mtimeMs;
      if (!this.model || mtime !== this.mtime) {
        const candidate = validateArtifact(JSON.parse(readFileSync(path, 'utf8')));
        this.model = candidate;
        this.mtime = mtime;
      }
    } catch (error) {
      if (!this.model && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        try {
          const bundled = this.config.get<string>('MODEL_BOOTSTRAP_PATH', '/app/ml-artifacts/model.json');
          this.model = validateArtifact(JSON.parse(readFileSync(bundled, 'utf8')));
        } catch { throw new ServiceUnavailableException('No validated fraud model is available'); }
      }
      if (!this.model) throw new ServiceUnavailableException('No validated fraud model is available');
      Logger.warn('Fraud cache unavailable or invalid; retaining last validated artifact', 'CachedFraudModel');
    }
    const mapping = JSON.parse(this.config.get<string>('MODEL_DB_MAPPING') || '{}') as Record<string, string>;
    // A promoted version must have an explicit, auditable existing DB identity.
    // Bootstrap v1 uses its documented convention; never tag a new candidate as v1.
    const databaseName = mapping[this.model.version]
      ?? (this.model.version === 'v1' ? this.config.get<string>('MODEL_DB_NAME', 'fraud_detection_v1') : undefined);
    if (!databaseName) throw new ServiceUnavailableException('Fraud model version has no database mapping');
    return { artifact: this.model, databaseName };
  }
}
