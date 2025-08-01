import { AppContext } from "../app_context";
import { Agreement } from "@golem-sdk/golem-js";
import { VanityResult } from "./result";

export interface GolemSessionRecorder {
  // return providerJobID
  agreementAcquired(
    ctx: AppContext,
    jobId: string,
    agreement: Agreement,
  ): Promise<string>;

  jobStarted(ctx: AppContext, jobProviderId: string): Promise<void>;
  jobCompleted(ctx: AppContext, jobProviderId: string): Promise<void>;
  jobStopped(ctx: AppContext, jobProviderId: string): Promise<void>;
  jobFailed(
    ctx: AppContext,
    jobProviderId: string,
    error: string,
  ): Promise<void>;
  resultFailedParsing(ctx: AppContext, jobProviderId: string): Promise<void>;
  resultInvalidVanityKey(ctx: AppContext, jobProviderId: string): Promise<void>;

  proofsStore(
    ctx: AppContext,
    jobId: string,
    results: VanityResult[],
  ): Promise<void>;
}

export function withJobProviderID(
  ctx: AppContext,
  jobProviderId: string,
): AppContext {
  return ctx.withValue("provider_job_id", jobProviderId);
}

export function getJobProviderID(ctx: AppContext): string {
  const jobProviderId = ctx.getValue<string>("provider_job_id");
  if (typeof jobProviderId !== "string" || jobProviderId.length === 0) {
    throw new Error("Job Provider ID not found in AppContext");
  }
  return jobProviderId;
}
