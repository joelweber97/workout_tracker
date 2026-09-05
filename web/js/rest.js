// Rest countdown between sets.
//
// Wall-clock based rather than tick-counting: iOS throttles timers in a
// backgrounded tab, so a counter that decremented on each tick would drift or
// freeze. Reading the difference against a fixed end time is always correct on
// return, however long the phone was in a pocket.

class RestTimer {
  #endAt = null;
  #total = 0;
  #interval = null;
  #listeners = new Set();
  #onFinish = null;

  subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #emit() { for (const fn of this.#listeners) fn(); }

  get running() { return this.#endAt !== null; }
  get total() { return this.#total; }

  get remaining() {
    if (this.#endAt === null) return 0;
    return Math.max(0, (this.#endAt - Date.now()) / 1000);
  }

  get progress() {
    if (!this.#total) return 0;
    return Math.min(1, 1 - this.remaining / this.#total);
  }

  start(seconds, onFinish) {
    if (seconds <= 0) return;
    this.stop(false);
    this.#total = seconds;
    this.#endAt = Date.now() + seconds * 1000;
    this.#onFinish = onFinish ?? null;
    this.#interval = setInterval(() => {
      this.#emit();
      if (this.remaining <= 0) this.#finish();
    }, 250);
    this.#emit();
  }

  add(seconds) {
    if (this.#endAt === null) return;
    this.#endAt += seconds * 1000;
    this.#total += seconds;
    this.#emit();
  }

  stop(emit = true) {
    clearInterval(this.#interval);
    this.#interval = null;
    this.#endAt = null;
    this.#total = 0;
    this.#onFinish = null;
    if (emit) this.#emit();
  }

  #finish() {
    const callback = this.#onFinish;
    this.stop(false);
    this.#emit();
    callback?.();
  }
}

export const restTimer = new RestTimer();
