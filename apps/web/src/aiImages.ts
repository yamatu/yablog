type AiStoredImage = {
  id: string;
  memoryId: string;
  name: string;
  type: string;
  size: number;
  createdAt: number;
  blob: Blob;
};

const DB_NAME = "yablog_ai_images_v1";
const STORE = "images";
const VERSION = 1;

const openDb = async (): Promise<IDBDatabase> => {
  return await new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("memoryId", "memoryId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("failed to open indexeddb"));
  });
};

const txDone = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
    tx.onerror = () => reject(tx.error ?? new Error("transaction failed"));
  });

export const aiImages = {
  put: async (args: { memoryId: string; file: File }): Promise<Omit<AiStoredImage, "blob">> => {
    const id = `img_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const rec: AiStoredImage = {
      id,
      memoryId: args.memoryId,
      name: args.file.name || "image",
      type: args.file.type || "application/octet-stream",
      size: args.file.size,
      createdAt: Date.now(),
      blob: args.file,
    };

    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    await txDone(tx);
    db.close();

    const { blob: _blob, ...meta } = rec;
    return meta;
  },

  getBlob: async (id: string): Promise<Blob | null> => {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    const rec = await new Promise<AiStoredImage | undefined>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result as any);
      req.onerror = () => reject(req.error ?? new Error("get failed"));
    }).catch(() => undefined);
    await txDone(tx).catch(() => undefined);
    db.close();
    return rec?.blob ?? null;
  },

  delete: async (id: string) => {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await txDone(tx);
    db.close();
  },

  deleteByMemory: async (memoryId: string) => {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const idx = store.index("memoryId");
    const range = IDBKeyRange.only(memoryId);
    const cursorReq = idx.openCursor(range);
    await new Promise<void>((resolve, reject) => {
      cursorReq.onerror = () => reject(cursorReq.error ?? new Error("cursor failed"));
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return resolve();
        store.delete(cursor.primaryKey);
        cursor.continue();
      };
    });
    await txDone(tx);
    db.close();
  },

  clearAll: async () => {
    const db = await openDb();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    await txDone(tx);
    db.close();
  },
};

