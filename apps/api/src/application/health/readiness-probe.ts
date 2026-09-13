export interface ReadinessProbe {
  check(): Promise<void>;
  close?(): Promise<void>;
}
