import { Actor, stage } from "domo-actors";
import { syncedStore, getYjsDoc, observeDeep } from "@syncedstore/core";
import { WebsocketProvider } from "y-websocket";
import { IndexeddbPersistence } from "y-indexeddb";
// embed-begin
//...
import { Counter, SyncedCounter } from "./Counter.js";

// Create synced store
type StoreType = {
  data: {
    count?: number;
  };
};
const store = syncedStore<StoreType>({ data: {} });
const doc = getYjsDoc(store);

// WebSocket server URL (overridable via ?ws= URL parameter)
function resolveWsServer(): string {
  try {
    const params = new URLSearchParams(location.search);
    const ws = params.get("ws");
    if (ws && ws.startsWith("ws")) {
      return ws;
    }
  } catch {
    // ignore
  }
  // __WS_SERVER_URL__ will be replaced during build with production URL
  const INJECTED_WS_SERVER = "__WS_SERVER_URL__";
  return INJECTED_WS_SERVER || "ws://localhost:9870";
}

// Shared secret (injected during build from CI secrets)
const WS_SECRET = "__WS_SECRET__";

const wsServerUrl = resolveWsServer();
if (typeof window !== "undefined") {
  (window as any).wsServerUrl = wsServerUrl;
}

// WebsocketProvider constructs URL as: serverUrl + '/' + roomName
// So we need: ws://host:port?secret=... and room name separately
// The provider will create: ws://host:port/domo-actors-counter?secret=...
const wsProvider = new WebsocketProvider(
  wsServerUrl,
  "domo-actors-counter",
  doc,
  {
    params: { secret: WS_SECRET },
  },
);
const awareness = wsProvider.awareness;
new IndexeddbPersistence("domo-actors-counter", doc);

// Actor reference
let syncedCounterActor: SyncedCounter | null = null;

// Update actor when store changes (Yjs handles sync automatically)
observeDeep(store, () => {
  const value = store.data.count || 0;
  if (syncedCounterActor) {
    syncedCounterActor.updateFromRemote(value);
  }
});

// Initialize count
if (store.data.count === undefined) {
  doc.transact(() => {
    store.data.count = 0;
  }, doc.clientID);
}

// Update peer count UI
function updatePeerCount() {
  const el = document.getElementById("peer-count");
  if (!el) return;
  const states = awareness.getStates();
  const selfClientID = doc.clientID;
  const peerCount = Array.from(states.keys()).filter(
    (id) => id !== selfClientID,
  ).length;
  el.textContent = peerCount.toString();
}

awareness.on("update", () => updatePeerCount());
wsProvider.on("status", ({ status }) => {
  const el = document.getElementById("connection-status");
  if (el) {
    const connected = status === "connected";
    el.innerHTML = connected
      ? '<svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" style="color: #28a745; vertical-align: middle;"><path d="M6 0a.5.5 0 0 1 .5.5V3h3V.5a.5.5 0 0 1 1 0V3h1a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-1v3a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5V7H4a.5.5 0 0 1-.5-.5v-3A.5.5 0 0 1 4 3h1V.5A.5.5 0 0 1 6 0z"/></svg>'
      : '<svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" style="color: #dc3545; vertical-align: middle;"><path d="M6 0a.5.5 0 0 1 .5.5V3h3V.5a.5.5 0 0 1 1 0V3h1a.5.5 0 0 1 .5.5v3a.5.5 0 0 1-.5.5h-1v3a.5.5 0 0 1-.5.5h-5a.5.5 0 0 1-.5-.5V7H4a.5.5 0 0 1-.5-.5v-3A.5.5 0 0 1 4 3h1V.5A.5.5 0 0 1 6 0z" opacity="0.5"/><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg>';
  }
  if (status === "connected") updatePeerCount();
});

class CounterActor extends Actor implements SyncedCounter {
  private lastKnownCount = 0;

  constructor() {
    super();
  }

  initialize() {
    this.lastKnownCount = store.data.count || 0;
    this.update();
  }

  updateFromRemote(value: number) {
    if (value !== this.lastKnownCount) {
      this.lastKnownCount = value;
      this.update();
    }
  }

  increment() {
    doc.transact(() => {
      store.data.count = (store.data.count || 0) + 1;
    }, doc.clientID);
    this.lastKnownCount = store.data.count || 0;
    this.update();
  }

  decrement() {
    doc.transact(() => {
      store.data.count = (store.data.count || 0) - 1;
    }, doc.clientID);
    this.lastKnownCount = store.data.count || 0;
    this.update();
  }

  private update() {
    const el = document.getElementById("synced-count");
    if (el) el.textContent = (store.data.count || 0).toString();
  }
}

export function createSyncedCounter() {
  const appStage = (window as any).appStage || stage();

  const syncedCounter = (appStage.actorFor as any)({
    instantiator: () => ({
      instantiate: () => {
        const actor = new CounterActor();
        setTimeout(() => actor.initialize(), 0);
        return actor;
      },
    }),
    type: () => "SyncedCounter",
  }) as SyncedCounter;

  syncedCounterActor = syncedCounter;

  return syncedCounter;
}
// embed-end
