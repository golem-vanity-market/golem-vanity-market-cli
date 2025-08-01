import { Agreement } from "@golem-sdk/golem-js";
import { eq } from "drizzle-orm";
import { AppContext } from "../app_context";
import {
  NewProviderJobModel,
  providerJobsTable,
  NewProofModel,
  proofsTable,
} from "../lib/db/schema";
import { GolemSessionRecorder } from "../node_manager/types";
import { VanityResult } from "../node_manager/result";

import { v4 as uuidv4 } from "uuid";

export class GollemSessionRecorderImpl implements GolemSessionRecorder {
  async agreementAcquired(
    ctx: AppContext,
    jobId: string,
    agreement: Agreement,
  ): Promise<string> {
    const id = uuidv4();
    const newProviderJob: NewProviderJobModel = {
      id: id,
      agreementId: agreement.id,
      jobId: jobId,
      status: "pending",
      providerId: agreement.provider.id,
      providerName: agreement.provider.name,
      providerWalletAddress: agreement.provider.walletAddress,
    };

    await ctx.getDB().insert(providerJobsTable).values(newProviderJob);
    return id;
  }

  async jobStarted(ctx: AppContext, jobProviderId: string): Promise<void> {
    await ctx
      .getDB()
      .update(providerJobsTable)
      .set({
        status: "started",
      })
      .where(eq(providerJobsTable.id, jobProviderId));
  }

  async jobCompleted(ctx: AppContext, jobProviderId: string): Promise<void> {
    await ctx
      .getDB()
      .update(providerJobsTable)
      .set({
        status: "completed",
        endTime: new Date().toISOString(),
      })
      .where(eq(providerJobsTable.id, jobProviderId));
  }

  async jobStopped(ctx: AppContext, jobProviderId: string): Promise<void> {
    await ctx
      .getDB()
      .update(providerJobsTable)
      .set({
        status: "completed",
        endTime: new Date().toISOString(),
      })
      .where(eq(providerJobsTable.id, jobProviderId));
  }

  async jobFailed(
    ctx: AppContext,
    jobProviderId: string,
    _error: string,
  ): Promise<void> {
    await ctx
      .getDB()
      .update(providerJobsTable)
      .set({
        status: "failed",
        endTime: new Date().toISOString(),
      })
      .where(eq(providerJobsTable.id, jobProviderId));
  }

  async resultFailedParsing(
    ctx: AppContext,
    jobProviderId: string,
  ): Promise<void> {
    await ctx
      .getDB()
      .update(providerJobsTable)
      .set({
        offence: "nonsense",
      })
      .where(eq(providerJobsTable.id, jobProviderId));
  }

  async resultInvalidVanityKey(
    ctx: AppContext,
    jobProviderId: string,
  ): Promise<void> {
    await ctx
      .getDB()
      .update(providerJobsTable)
      .set({
        offence: "incorrect results",
      })
      .where(eq(providerJobsTable.id, jobProviderId));
  }

  async proofsStore(
    ctx: AppContext,
    jobProviderId: string,
    results: VanityResult[],
  ): Promise<void> {
    const newProofs: NewProofModel[] = results.map((res) => {
      return {
        providerJobId: jobProviderId,
        addr: res.address,
        salt: res.salt,
        pubKey: res.pubKey,
        vanityProblem: {
          type: "prefix",
          specifier: res.pattern,
        },
      };
    });
    await ctx.getDB().insert(proofsTable).values(newProofs);
  }
}
