import EventEmitter from 'events';

interface PollingFunction {
    (): void;
}

export default class PollingService extends EventEmitter {
  private readonly req: PollingFunction;
  private readonly interval: number;
  private intervalId?: ReturnType<typeof setInterval>;

  constructor(req: PollingFunction, interval = 5000) {
    super();

    this.req = req;
    this.interval = interval;
    this.intervalId = undefined;
  }

  start(): void {
    this.intervalId = setInterval(() => this.req(), this.interval);
  }

  stop(): void {
    if (!this.intervalId) {
      return;
    }

    clearInterval(this.intervalId);
  }
}
