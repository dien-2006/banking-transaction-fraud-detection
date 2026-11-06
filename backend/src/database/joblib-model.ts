import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { Logger, ServiceUnavailableException } from '@nestjs/common';

export interface JoblibIdentity {
  version: string; sha256: string; metadataSha256: string; databaseName: string;
}
export interface JoblibPrediction extends JoblibIdentity { probability: number }

/** One bounded, persistent Python process per API instance; no object-store requests. */
export class JoblibFraudModel {
  private child?: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private pending = new Map<number, { prediction: boolean; resolve: (p: JoblibIdentity | JoblibPrediction) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  constructor(private readonly config: ConfigService) {}

  private start(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;
    const root = resolve(this.config.get<string>('ML_WORKSPACE_ROOT')
      ?? (existsSync(resolve(process.cwd(), 'ml')) ? process.cwd() : resolve(process.cwd(), '..')));
    const path = this.config.get<string>('JOBLIB_MODEL_PATH', resolve(root, 'models/fraud_detection_model.joblib'));
    const metadata = this.config.get<string>('JOBLIB_METADATA_PATH', resolve(root, 'models/model_metadata.json'));
    const child = spawn(this.config.get<string>('PYTHON_EXECUTABLE', 'python3'),
      ['-u', '-m', 'ml.inference.joblib_predictor'], { cwd: root, env: { ...process.env,
        JOBLIB_MODEL_PATH: path, JOBLIB_METADATA_PATH: metadata, PYTHONDONTWRITEBYTECODE: '1',
        OMP_NUM_THREADS: '1', OPENBLAS_NUM_THREADS: '1', MKL_NUM_THREADS: '1' } });
    this.child = child;
    createInterface({ input: child.stdout }).on('line', line => {
      try {
        const value = JSON.parse(line);
        const item = this.pending.get(value.id);
        if (!item) return;
        clearTimeout(item.timer); this.pending.delete(value.id);
        if (value.error || (item.prediction && (!Number.isFinite(value.probability) || value.probability < 0 || value.probability > 1))
          || !/^[a-f0-9]{64}$/.test(value.sha256) || !/^[a-f0-9]{64}$/.test(value.metadataSha256)
          || value.version !== `joblib-${value.sha256.slice(0, 16)}`
          || value.databaseName !== `fraud_detection_xgb_${value.sha256.slice(0, 16)}`)
          item.reject(new ServiceUnavailableException('Validated joblib inference unavailable'));
        else {
          const { id: _id, error: _error, ...prediction } = value;
          item.resolve(prediction);
        }
      } catch { this.fail(child); }
    });
    child.stderr.on('data', () => Logger.warn('Joblib worker diagnostic; check artifact/library compatibility', 'JoblibFraudModel'));
    child.on('error', () => this.fail(child));
    child.on('exit', () => this.fail(child));
    child.stdin.on('error', () => this.fail(child));
    return child;
  }

  private fail(child: ChildProcessWithoutNullStreams): void {
    if (this.child !== child) return;
    this.child = undefined; child.kill();
    for (const item of this.pending.values()) {
      clearTimeout(item.timer); item.reject(new ServiceUnavailableException('Joblib inference process unavailable'));
    }
    this.pending.clear();
  }

  private request(payload: { features: Record<string, unknown> }, prediction: true): Promise<JoblibPrediction>;
  private request(payload: { operation: 'identity' }, prediction: false): Promise<JoblibIdentity>;
  private request(payload: object, prediction: boolean): Promise<JoblibIdentity | JoblibPrediction> {
    if (this.pending.size >= 32) return Promise.reject(new ServiceUnavailableException('Inference queue is full'));
    const child = this.start(), id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(child), 30_000);
      this.pending.set(id, { prediction, resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, ...payload }) + '\n');
    });
  }
  predict(features: Record<string, unknown>): Promise<JoblibPrediction> { return this.request({ features }, true); }
  identity(): Promise<JoblibIdentity> { return this.request({ operation: 'identity' }, false); }
  close(): void { if (this.child) this.fail(this.child); }
}
