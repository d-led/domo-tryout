import { Actor, Protocol, stage } from 'domo-actors'

interface Counter {
  increment(): void
  decrement(): void
}

class CounterActor extends Actor implements Counter {
  private count = 0

  constructor() { super() }

  increment() { this.count++; this.update() }
  decrement() { this.count--; this.update() }

  private update() {
    const el = document.getElementById('count')
    if (el) el.textContent = this.count.toString()
  }
}

const counter = stage().actorFor<Counter>({
  instantiator: () => ({ instantiate: () => new CounterActor() }),
  type: () => 'Counter'
})

setInterval(() => counter.increment(), 1000)
if (typeof window !== 'undefined') (window as any).counter = counter
