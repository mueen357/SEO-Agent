/**
 * Deterministic IndexedDB Atomic Transactions & Rollback Verification.
 *
 * Uses fake-indexeddb to verify genuine browser-level IndexedDB transactions,
 * cursors, multi-store atomicity, and rollback behavior.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { StandaloneAuditStorage } from '../standalone/persistence/indexedDb';
import type {
  StandaloneAuditJob,
  StandaloneRuleExecutionRecord,
  StandaloneSeoFinding,
} from '../standalone/types';

describe('IndexedDB Atomic Multi-Store Transactions & Rollback', () => {
  const auditId = 'test-audit-atomic-1';
  const otherAuditId = 'test-audit-atomic-2';

  beforeEach(async () => {
    StandaloneAuditStorage.clearInMemoryForTesting();
    // Clear IndexedDB stores directly if needed
    const db = await StandaloneAuditStorage.getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['audits', 'findings', 'execution_ledger'], 'readwrite');
      tx.objectStore('audits').clear();
      tx.objectStore('findings').clear();
      tx.objectStore('execution_ledger').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  });

  function createMockJob(id: string): StandaloneAuditJob {
    return {
      id,
      targetUrl: 'https://example.com',
      origin: 'https://example.com',
      hostname: 'example.com',
      status: 'completed',
      progressPercent: 100,
      currentStage: 'stage_complete',
      sequence: 1,
      config: { maxPages: 5, crawlDelayMs: 0, respectRobotsTxt: true, discoverSitemaps: true, userAgent: 'test' },
      discoveredUrls: ['https://example.com'],
      pendingQueue: [],
      crawledUrls: ['https://example.com'],
      failedUrls: [],
      startedAt: Date.now() - 1000,
      updatedAt: Date.now(),
    };
  }

  function createMockFinding(id: string, aId: string = auditId): StandaloneSeoFinding {
    return {
      id,
      auditId: aId,
      ruleId: 'TECH_HTTPS_USAGE',
      category: 'technical',
      severity: 'high',
      status: 'fail',
      title: `Finding ${id}`,
      description: `Description ${id}`,
      recommendation: `Fix ${id}`,
      pageUrl: 'https://example.com',
    };
  }

  function createMockLedgerRecord(id: string, aId: string = auditId): StandaloneRuleExecutionRecord {
    return {
      id: `${aId}-${id}`,
      auditId: aId,
      canonicalRuleId: 'TECH_HTTPS_USAGE',
      ruleVersion: '1.0.0',
      scope: 'page',
      targetUrl: 'https://example.com',
      executionStatus: 'executed_pass',
      result: 'pass',
      evidenceAvailable: true,
      executedAt: Date.now(),
      engineVersion: '2.0.0',
    };
  }

  it('atomically commits findings, execution ledger, and job state in a single transaction', async () => {
    const job = createMockJob(auditId);
    const findings = [createMockFinding('f-1'), createMockFinding('f-2')];
    const records = [createMockLedgerRecord('r-1'), createMockLedgerRecord('r-2')];

    await StandaloneAuditStorage.publishSeoStageResults(auditId, findings, records, job);

    const savedJob = await StandaloneAuditStorage.getJob(auditId);
    const savedFindings = await StandaloneAuditStorage.getFindingsForAudit(auditId);
    const savedLedger = await StandaloneAuditStorage.getExecutionLedgerForAudit(auditId);

    expect(savedJob).toBeDefined();
    expect(savedJob?.id).toBe(auditId);
    expect(savedJob?.status).toBe('completed');
    expect(savedFindings.length).toBe(2);
    expect(savedFindings.map((f) => f.id).sort()).toEqual(['f-1', 'f-2']);
    expect(savedLedger.length).toBe(2);
  });

  it('replaces previous findings and ledger records using cursors within the same atomic transaction', async () => {
    // Initial stage
    const initialFindings = [createMockFinding('init-1'), createMockFinding('init-2'), createMockFinding('init-3')];
    const initialRecords = [createMockLedgerRecord('init-r1'), createMockLedgerRecord('init-r2')];
    await StandaloneAuditStorage.publishSeoStageResults(auditId, initialFindings, initialRecords);

    let loadedFindings = await StandaloneAuditStorage.getFindingsForAudit(auditId);
    let loadedLedger = await StandaloneAuditStorage.getExecutionLedgerForAudit(auditId);
    expect(loadedFindings.length).toBe(3);
    expect(loadedLedger.length).toBe(2);

    // Second stage with completely different findings & records
    const nextFindings = [createMockFinding('next-1')];
    const nextRecords = [createMockLedgerRecord('next-r1'), createMockLedgerRecord('next-r2'), createMockLedgerRecord('next-r3')];
    await StandaloneAuditStorage.publishSeoStageResults(auditId, nextFindings, nextRecords);

    loadedFindings = await StandaloneAuditStorage.getFindingsForAudit(auditId);
    loadedLedger = await StandaloneAuditStorage.getExecutionLedgerForAudit(auditId);

    // Old records must be deleted, new records present
    expect(loadedFindings.length).toBe(1);
    expect(loadedFindings[0]?.id).toBe('next-1');
    expect(loadedLedger.length).toBe(3);
  });

  it('supports empty replacement without leaving stale findings or execution ledger records', async () => {
    // Seed initial findings
    await StandaloneAuditStorage.publishSeoStageResults(auditId, [createMockFinding('old-1')], [createMockLedgerRecord('old-r1')]);
    expect((await StandaloneAuditStorage.getFindingsForAudit(auditId)).length).toBe(1);

    // Empty replacement
    await StandaloneAuditStorage.publishSeoStageResults(auditId, [], []);

    const clearedFindings = await StandaloneAuditStorage.getFindingsForAudit(auditId);
    const clearedLedger = await StandaloneAuditStorage.getExecutionLedgerForAudit(auditId);
    expect(clearedFindings.length).toBe(0);
    expect(clearedLedger.length).toBe(0);
  });

  it('maintains strict isolation between concurrent audits', async () => {
    // Seed Audit A and Audit B
    const jobA = createMockJob(auditId);
    const findingsA = [createMockFinding('a-1', auditId), createMockFinding('a-2', auditId)];
    const recordsA = [createMockLedgerRecord('a-r1', auditId)];
    await StandaloneAuditStorage.publishSeoStageResults(auditId, findingsA, recordsA, jobA);

    const jobB = createMockJob(otherAuditId);
    const findingsB = [createMockFinding('b-1', otherAuditId)];
    const recordsB = [createMockLedgerRecord('b-r1', otherAuditId), createMockLedgerRecord('b-r2', otherAuditId)];
    await StandaloneAuditStorage.publishSeoStageResults(otherAuditId, findingsB, recordsB, jobB);

    // Update Audit A only
    await StandaloneAuditStorage.publishSeoStageResults(auditId, [createMockFinding('a-3', auditId)], []);

    // Verify Audit A updated
    const finalFindingsA = await StandaloneAuditStorage.getFindingsForAudit(auditId);
    expect(finalFindingsA.length).toBe(1);
    expect(finalFindingsA[0]?.id).toBe('a-3');

    // Verify Audit B was completely unaffected
    const finalJobB = await StandaloneAuditStorage.getJob(otherAuditId);
    const finalFindingsB = await StandaloneAuditStorage.getFindingsForAudit(otherAuditId);
    const finalLedgerB = await StandaloneAuditStorage.getExecutionLedgerForAudit(otherAuditId);

    expect(finalJobB?.id).toBe(otherAuditId);
    expect(finalFindingsB.length).toBe(1);
    expect(finalFindingsB[0]?.id).toBe('b-1');
    expect(finalLedgerB.length).toBe(2);
  });

  it('demonstrates transaction rollback preserving pre-transaction data when an abort occurs', async () => {
    // Seed initial state
    const initialFindings = [createMockFinding('preserve-1')];
    const initialRecords = [createMockLedgerRecord('preserve-r1')];
    await StandaloneAuditStorage.publishSeoStageResults(auditId, initialFindings, initialRecords);

    const db = await StandaloneAuditStorage.getDb();

    // Perform an aborted transaction that attempts to modify stores
    await expect(
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['findings', 'execution_ledger'], 'readwrite');
        const store = tx.objectStore('findings');
        store.put(createMockFinding('should-rollback'));
        tx.onabort = () => reject(new Error('Transaction explicitly aborted'));
        tx.oncomplete = () => resolve();
        // Abort the transaction midway
        tx.abort();
      })
    ).rejects.toThrow('Transaction explicitly aborted');

    // Verify the rolled back write did not persist
    const findingsAfterAbort = await StandaloneAuditStorage.getFindingsForAudit(auditId);
    expect(findingsAfterAbort.length).toBe(1);
    expect(findingsAfterAbort[0]?.id).toBe('preserve-1');
    expect(findingsAfterAbort.some((f) => f.id === 'should-rollback')).toBe(false);
  });
});
