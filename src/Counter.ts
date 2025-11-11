export interface Counter {
  increment(): void
  decrement(): void
}

export interface SyncedCounter extends Counter {
  updateFromRemote(value: number): void
}

