/**
 * WZRD-EDIT: IndexedDB-backed storage for the browser editor.
 *
 * The upstream web adapter keeps project state in `localStorage`, which caps
 * out around 5MB of UTF-16 and throws `QuotaExceededError` synchronously — a
 * single project with a few text overlays and a media index gets close, and the
 * failure surfaced as `save()` returning `false` with nothing shown to the
 * user. IndexedDB is orders of magnitude larger, stores structured clones
 * instead of JSON strings, and is available in every browser we target.
 *
 * Existing `qcut:`-prefixed localStorage entries are migrated on first use, so
 * a returning user keeps their projects.
 */

const DB_NAME = "qcut";
const DB_VERSION = 1;
const STORE = "kv";
const LEGACY_PREFIX = "qcut:";
const MIGRATION_FLAG = "qcut:idb-migrated";

/** Thrown when the browser refuses to store more data. */
export class StorageQuotaError extends Error {
	constructor(readonly key: string, cause: unknown) {
		super(
			`Out of browser storage while saving "${key}". Free up space or remove unused projects, then try again.`
		);
		this.name = "StorageQuotaError";
		this.cause = cause;
	}
}

function isQuotaError(error: unknown): boolean {
	return (
		error instanceof DOMException &&
		(error.name === "QuotaExceededError" ||
			error.name === "NS_ERROR_DOM_QUOTA_REACHED")
	);
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
	if (dbPromise) return dbPromise;

	dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(STORE)) {
				request.result.createObjectStore(STORE);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
		request.onblocked = () =>
			reject(new Error("IndexedDB upgrade blocked by another open tab"));
	}).catch((error) => {
		// Let a later call retry rather than caching a rejected promise forever.
		dbPromise = null;
		throw error;
	});

	return dbPromise;
}

async function withStore<T>(
	mode: IDBTransactionMode,
	run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await openDatabase();
	const tx = db.transaction(STORE, mode);
	const result = await promisify(run(tx.objectStore(STORE)));
	await new Promise<void>((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error);
	});
	return result;
}

/**
 * Ask the browser to exempt our data from eviction under storage pressure.
 * Best-effort: Chrome grants it based on engagement, Safari ignores it.
 */
export async function requestPersistentStorage(): Promise<boolean> {
	try {
		if (!navigator.storage?.persist) return false;
		if (await navigator.storage.persisted()) return true;
		return await navigator.storage.persist();
	} catch {
		return false;
	}
}

/** Move `qcut:`-prefixed localStorage entries into IndexedDB, once. */
async function migrateFromLocalStorage(): Promise<void> {
	if (typeof localStorage === "undefined") return;
	if (localStorage.getItem(MIGRATION_FLAG)) return;

	const entries: Array<[string, string]> = [];
	for (let i = 0; i < localStorage.length; i++) {
		const key = localStorage.key(i);
		if (!key?.startsWith(LEGACY_PREFIX) || key === MIGRATION_FLAG) continue;
		const raw = localStorage.getItem(key);
		if (raw !== null) entries.push([key.slice(LEGACY_PREFIX.length), raw]);
	}

	for (const [key, raw] of entries) {
		// Only migrate keys IndexedDB does not already own: a value written this
		// session is newer than anything left behind in localStorage.
		const existing = await withStore("readonly", (store) => store.get(key));
		if (existing !== undefined) continue;

		let value: unknown = raw;
		try {
			value = JSON.parse(raw);
		} catch {
			// Keep the raw string, matching the localStorage adapter's behaviour.
		}
		await withStore("readwrite", (store) => store.put(value, key));
	}

	localStorage.setItem(MIGRATION_FLAG, new Date().toISOString());
}

let migration: Promise<void> | null = null;

function ensureMigrated(): Promise<void> {
	if (!migration) {
		migration = migrateFromLocalStorage().catch((error) => {
			console.warn(
				"[QCut/vercel] localStorage → IndexedDB migration failed:",
				error
			);
		});
	}
	return migration;
}

export const indexedDbStorage = {
	async save(key: string, data: unknown): Promise<boolean> {
		await ensureMigrated();
		try {
			await withStore("readwrite", (store) => store.put(data, key));
			return true;
		} catch (error) {
			if (isQuotaError(error)) throw new StorageQuotaError(key, error);
			throw error;
		}
	},

	async load(key: string): Promise<unknown> {
		await ensureMigrated();
		const value = await withStore("readonly", (store) => store.get(key));
		return value === undefined ? null : value;
	},

	async remove(key: string): Promise<boolean> {
		await ensureMigrated();
		await withStore("readwrite", (store) => store.delete(key));
		return true;
	},

	async list(): Promise<string[]> {
		await ensureMigrated();
		const keys = await withStore("readonly", (store) => store.getAllKeys());
		return keys.map(String);
	},

	async clear(): Promise<boolean> {
		await ensureMigrated();
		await withStore("readwrite", (store) => store.clear());
		return true;
	},
};
