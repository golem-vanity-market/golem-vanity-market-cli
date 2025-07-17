import * as otl from "@opentelemetry/api";

/**
 * Wrapper around OpenTelemetry metrics API providing simplified metric collection
 */
export class MetricsCollector {
  private commandDuration?: otl.Histogram;

  public static newCollector(meter: otl.Meter): MetricsCollector {
    const c = new MetricsCollector();
    c.commandDuration = meter.createHistogram("command_duration_sec", {
      description: "Duration of CLI commands in seconds",
      unit: "s",
    });
    return c;
  }

  public observeCLI(status: string, durationSec: number) {
    if (!this.commandDuration) {
      return;
    }
    this.commandDuration.record(durationSec, {
      command: "generate",
      status: status,
    });
  }
}
