import type { AppContext } from "../app_context";
import type { Agreement } from "@golem-sdk/golem-js";
import type { VanityResult } from "./result";
import { ProviderJobModel } from "../lib/db/schema";

export interface Reputation {
  isProviderBanned(providerId: string): boolean;

  ban(ctx: AppContext, providerId: string, reason: string): boolean;
}
export interface GolemSessionRecorder {
  agreementCreate(
    ctx: AppContext,
    jobId: string,
    agreement: Agreement,
  ): Promise<void>;

  // return providerJobID
  providerJobCreate(
    ctx: AppContext,
    jobId: string,
    agreement: Agreement,
  ): Promise<string>;

  providerJobStarted(ctx: AppContext, providerJobId: string): Promise<void>;
  providerJobCompleted(ctx: AppContext, providerJobId: string): Promise<void>;
  addHashRate(
    ctx: AppContext,
    providerJobId: string,
    hashRate: number,
  ): Promise<void>;
  providerJobStopped(ctx: AppContext, providerJobId: string): Promise<void>;
  providerJobFailed(
    ctx: AppContext,
    providerJobId: string,
    error: string,
  ): Promise<void>;
  resultFailedParsing(ctx: AppContext, providerJobId: string): Promise<void>;
  resultInvalidVanityKey(ctx: AppContext, providerJobId: string): Promise<void>;

  proofsStore(
    ctx: AppContext,
    providerJobId: string,
    results: VanityResult[],
  ): Promise<void>;

  getProviderJob(
    ctx: AppContext,
    providerJobId: string,
  ): Promise<ProviderJobModel[]>;
}

export function withProviderJobID(
  ctx: AppContext,
  providerJobId: string,
): AppContext {
  return ctx.withValue("provider_job_id", providerJobId);
}

export function getProviderJobId(ctx: AppContext): string {
  const providerJobId = ctx.getValue<string>("provider_job_id");
  if (typeof providerJobId !== "string" || providerJobId.length === 0) {
    throw new Error("Job Provider ID not found in AppContext");
  }
  return providerJobId;
}
