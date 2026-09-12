export interface ReadinessOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

export function waitForDeployment(server: string, options?: ReadinessOptions): Promise<void>;
