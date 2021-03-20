import EventEmitter from 'events'

export default class PollingService extends EventEmitter {
  private readonly req: Function
  private readonly interval: number;
  private intervalId?: ReturnType<typeof setInterval>

  constructor(req: Function, interval: number = 5000) {
    super();

    this.req = req;
    this.interval = interval;
    this.intervalId = undefined;
  }

  start(): void {
    this.intervalId = setInterval(() => this.req(), this.interval);
  }

  stop(): void {
    if (!this.intervalId) return;
    clearInterval(this.intervalId);
  }
}
