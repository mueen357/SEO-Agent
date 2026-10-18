/**
 * Client-Side Durable Storage Engine using IndexedDB.
 * Survives side panel closure, page navigation, and browser restarts.
 */

import type {
  StandaloneAuditJob,
  StandaloneCrawlPage,
  StandaloneSeoFinding,
  StandaloneTechFinding,
} from '../types';

const DB_NAME = 'WebsiteAuditAgent_StandaloneDB';
const DB_VERSION = 1;

export class StandaloneAuditStorage {
  private static dbPromise: Promise<IDBDatabase> | null = null;

  public static async getDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not supported in this environment.'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;

        // 1. Audits store
        if (!db.objectStoreNames.contains('audits')) {
          const store = db.createObjectStore('audits', { keyPath: 'id' });
          store.createIndex('hostname', 'hostname', { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // 2. Crawled pages store
        if (!db.objectStoreNames.contains('pages')) {
          const store = db.createObjectStore('pages', { keyPath: 'id' });
          store.createIndex('auditId', 'auditId', { unique: false });
          store.createIndex('url', 'url', { unique: false });
        }

        // 3. SEO findings store
        if (!db.objectStoreNames.contains('findings')) {
          const store = db.createObjectStore('findings', { keyPath: 'id' });
          store.createIndex('auditId', 'auditId', { unique: false });
          store.createIndex('ruleId', 'ruleId', { unique: false });
        }

        // 4. Technology findings store
        if (!db.objectStoreNames.contains('technologies')) {
          const store = db.createObjectStore('technologies', { keyPath: 'id' });
          store.createIndex('auditId', 'auditId', { unique: false });
          store.createIndex('technologyId', 'technologyId', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  public static async saveJob(job: StandaloneAuditJob): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('audits', 'readwrite');
      tx.objectStore('audits').put(job);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public static async getJob(id: string): Promise<StandaloneAuditJob | undefined> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('audits', 'readonly');
      const req = tx.objectStore('audits').get(id);
      req.onsuccess = () => resolve(req.result || undefined);
      req.onerror = () => reject(req.error);
    });
  }

  public static async getLatestJob(): Promise<StandaloneAuditJob | undefined> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('audits', 'readonly');
      const store = tx.objectStore('audits');
      const req = store.openCursor(null, 'prev');
      req.onsuccess = () => {
        const cursor = req.result;
        resolve(cursor ? (cursor.value as StandaloneAuditJob) : undefined);
      };
      req.onerror = () => reject(req.error);
    });
  }

  public static async savePage(page: StandaloneCrawlPage): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pages', 'readwrite');
      tx.objectStore('pages').put(page);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public static async getPagesForAudit(auditId: string): Promise<StandaloneCrawlPage[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pages', 'readonly');
      const index = tx.objectStore('pages').index('auditId');
      const req = index.getAll(IDBKeyRange.only(auditId));
      req.onsuccess = () => resolve((req.result as StandaloneCrawlPage[]) || []);
      req.onerror = () => reject(req.error);
    });
  }

  public static async saveFindings(findings: StandaloneSeoFinding[]): Promise<void> {
    if (!findings.length) return;
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('findings', 'readwrite');
      const store = tx.objectStore('findings');
      for (const f of findings) {
        store.put(f);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public static async getFindingsForAudit(auditId: string): Promise<StandaloneSeoFinding[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('findings', 'readonly');
      const index = tx.objectStore('findings').index('auditId');
      const req = index.getAll(IDBKeyRange.only(auditId));
      req.onsuccess = () => resolve((req.result as StandaloneSeoFinding[]) || []);
      req.onerror = () => reject(req.error);
    });
  }

  public static async saveTechnologies(techs: StandaloneTechFinding[]): Promise<void> {
    if (!techs.length) return;
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('technologies', 'readwrite');
      const store = tx.objectStore('technologies');
      for (const t of techs) {
        store.put(t);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public static async getTechnologiesForAudit(auditId: string): Promise<StandaloneTechFinding[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('technologies', 'readonly');
      const index = tx.objectStore('technologies').index('auditId');
      const req = index.getAll(IDBKeyRange.only(auditId));
      req.onsuccess = () => resolve((req.result as StandaloneTechFinding[]) || []);
      req.onerror = () => reject(req.error);
    });
  }
}
