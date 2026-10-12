/**
 * Backend API Client & Health Check Service
 */

import type { BackendHealthResponse } from '../types/audit';

const DEFAULT_API_BASE = 'http://127.0.0.1:8000';

export async function checkBackendHealth(baseUrl: string = DEFAULT_API_BASE): Promise<BackendHealthResponse> {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      return {
        status: 'degraded',
        service: `HTTP ${response.status}`,
        checkedAt: Date.now(),
        latencyMs
      };
    }

    const data = await response.json();
    return {
      status: data.status === 'ok' ? 'ok' : 'degraded',
      service: data.service || 'website-audit-api',
      checkedAt: Date.now(),
      latencyMs
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    return {
      status: 'offline',
      service: 'FastAPI Offline (127.0.0.1:8000)',
      checkedAt: Date.now(),
      latencyMs
    };
  }
}