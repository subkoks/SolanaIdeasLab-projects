export class QueueService {
  private connected = false
  private pendingJobs = 0
  private processedJobs = 0

  public async connect(): Promise<void> {
    this.connected = true
  }

  public async disconnect(): Promise<void> {
    this.connected = false
  }

  public async healthCheck(): Promise<boolean> {
    return this.connected
  }

  public startProcessors(): void {
    this.connected = true
  }

  public enqueue(): void {
    this.pendingJobs += 1
  }

  public complete(): void {
    if (this.pendingJobs > 0) {
      this.pendingJobs -= 1
    }

    this.processedJobs += 1
  }

  public async getActiveConnections(): Promise<number> {
    return this.connected ? 1 : 0
  }

  public async getQueueSize(): Promise<number> {
    return this.pendingJobs
  }

  public getProcessedJobs(): number {
    return this.processedJobs
  }
}
