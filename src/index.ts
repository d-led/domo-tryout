import { Actor, Protocol, stage } from 'domo-actors'
import { Counter } from './Counter.js'
import { createSyncedCounter } from './synced-counter.js'

// Create shared stage
const appStage = stage()
if (typeof window !== 'undefined') {
  (window as any).appStage = appStage
}

// Create synced counter first
const syncedCounter = createSyncedCounter()

// embed-begin
class CounterActor extends Actor implements Counter {
  private count = 0
  private syncedCounter: Counter

  constructor(syncedCounter: Counter) {
    super()
    this.syncedCounter = syncedCounter
  }

  increment() { 
    this.count++;
    this.update();
    this.syncedCounter.increment()
  }
  
  decrement() { 
    this.count--;
    this.update();
    this.syncedCounter.decrement()
  }

  private update() {
    const el = document.getElementById('count')
    if (el) el.textContent = this.count.toString()
  }
}

const counter = appStage.actorFor<Counter>({
  instantiator: () => ({ instantiate: () => new CounterActor(syncedCounter) }),
  type: () => 'Counter'
})

setInterval(() => {
  counter.increment()
}, 1000)
// embed-end
if (typeof window !== 'undefined') {
  (window as any).counter = counter
}
