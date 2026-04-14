/** Placeholder domain types — extend as models solidify. */
export type TenantId = string;
export type UserId = string;

export interface HealthCheckResponse {
  ok: boolean;
  service: string;
}
