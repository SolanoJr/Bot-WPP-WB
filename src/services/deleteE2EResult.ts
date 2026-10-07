import fs from 'node:fs';
import path from 'node:path';

export function persistDeleteE2EResult(result: Record<string, any>, file?: string): string {
  const destination = file || process.env.DELETE_E2E_RESULTS_FILE || path.join(process.cwd(), 'laboratorio', 'delete-e2e-results.jsonl');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.appendFileSync(destination, `${JSON.stringify(result)}\n`, { encoding: 'utf8', mode: 0o600 });
  return destination;
}
