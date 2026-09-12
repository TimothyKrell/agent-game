export interface ReadinessOptions {
  timeoutMs?: number;
  intervalMs?: number;
  stableForMs?: number;
}

export function waitForDeployment(server: string, options?: ReadinessOptions): Promise<void>;
