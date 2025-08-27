import * as otl from "@opentelemetry/api";

export interface ProviderJobMetric {
  providerId: string;
  providerName: string;
  agreementId: string;
  iterationNo: number;
  status: string;
  durationSec: number;
}

export interface ProviderPaymentMetric {
  providerId: string;
  providerName: string;
  agreementId: string;
  amount: number;
  status: string;
}

/**
 * Wrapper around OpenTelemetry metrics API providing simplified metric collection
 *
 * Histogram Buckets:
 * - Provider job duration: Configured in instrumentation.ts with explicit bucket boundaries
 *   optimized for job execution times around the 20s target with fine granularity
 *   Buckets: [1, 5, 10, 18, 19, 20, 21, 22, 25, 30, 40] seconds
 */
export class MetricsCollector {
  private providerJobIterDuration?: otl.Histogram;
  private invoicePerProvider?: otl.Counter;
  private invoicePerProviderCount?: otl.Counter;
  private debitNotePerProvider?: otl.Counter;
  private debitNotePerProviderCount?: otl.Counter;

  public static newCollector(meter: otl.Meter): MetricsCollector {
    const c = new MetricsCollector();

    // Create histogram for provider job durations
    // Bucket boundaries are configured via views in instrumentation.ts
    c.providerJobIterDuration = meter.createHistogram(
      "provider_job_iteration_duration_sec",
      {
        description: "Duration of provider job iterations in seconds",
        unit: "s",
        valueType: otl.ValueType.DOUBLE,
      },
    );

    c.invoicePerProvider = meter.createCounter("provider_invoice_glm_total", {
      description: "Total invoice amount from providers",
      unit: "GLM",
      valueType: otl.ValueType.DOUBLE,
    });

    c.invoicePerProviderCount = meter.createCounter("provider_invoice_count", {
      description: "Total number of invoices from providers",
      unit: "1",
      valueType: otl.ValueType.INT,
    });

    c.debitNotePerProvider = meter.createCounter(
      "provider_debitnote_glm_total",
      {
        description: "Total debit note amount from providers",
        unit: "GLM",
        valueType: otl.ValueType.DOUBLE,
      },
    );

    c.debitNotePerProviderCount = meter.createCounter(
      "provider_debitnote_count",
      {
        description: "Total number of debit notes from providers",
        unit: "1",
        valueType: otl.ValueType.INT,
      },
    );

    return c;
  }

  public observeProviderJob(metrics: ProviderJobMetric) {
    if (!this.providerJobIterDuration) {
      return;
    }
    this.providerJobIterDuration.record(metrics.durationSec, {
      providerId: metrics.providerId,
      providerName: metrics.providerName,
      agreementId: metrics.agreementId,
      iterationNo: metrics.iterationNo,
      status: metrics.status,
    });
  }

  public observeProviderInvoice(metrics: ProviderPaymentMetric) {
    if (!this.invoicePerProvider) {
      return;
    }
    this.invoicePerProvider.add(metrics.amount, {
      providerId: metrics.providerId,
      providerName: metrics.providerName,
      agreementId: metrics.agreementId,
      status: metrics.status,
    });

    this.invoicePerProviderCount?.add(1, {
      providerId: metrics.providerId,
      providerName: metrics.providerName,
      agreementId: metrics.agreementId,
      status: metrics.status,
    });
  }

  public observeProviderDebitNote(metrics: ProviderPaymentMetric) {
    if (!this.debitNotePerProvider) {
      return;
    }
    this.debitNotePerProvider.add(metrics.amount, {
      providerId: metrics.providerId,
      providerName: metrics.providerName,
      agreementId: metrics.agreementId,
      status: metrics.status,
    });

    this.debitNotePerProviderCount?.add(1, {
      providerId: metrics.providerId,
      providerName: metrics.providerName,
      agreementId: metrics.agreementId,
      status: metrics.status,
    });
  }
}
