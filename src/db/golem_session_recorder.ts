import { Agreement } from "@golem-sdk/golem-js";
import { eq } from "drizzle-orm";
import { AppContext } from "../app_context";
import {
  NewProviderJobModel,
  ProviderJobModel,
  providerJobsTable,
  NewProofModel,
  proofsTable,
  agreementsTable,
  NewAgreementModel,
} from "../lib/db/schema";
import { GolemSessionRecorder } from "../node_manager/types";
import { VanityResult } from "../node_manager/result";

import { v4 as uuidv4 } from "uuid";

export class GollemSessionRecorderImpl implements GolemSessionRecorder {
  async agreementCreate(
    ctx: AppContext,
    jobId: string,
    agreement: Agreement,
  ): Promise<void> {
    const newAgreement: NewAgreementModel = {
      agreementId: agreement.id,
      jobId: jobId,
      providerId: agreement.provider.id,
      providerWalletAddress: agreement.provider.walletAddress,
      providerName: agreement.provider.name,
    };
    await ctx
      .getDB()
      .insert(agreementsTable)
      .values(newAgreement)
      .onConflictDoNothing({ target: agreementsTable.agreementId });
  }

  async providerJobCreate(
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
      startTime: new Date().toISOString(),
    };

    await ctx.getDB().insert(providerJobsTable).values(newProviderJob);
    return id;
  }

  async providerJobStarted(
    ctx: AppContext,
    providerJobId: string,
  ): Promise<void> {
    await ctx
      .getDB()
      .update(providerJobsTable)
      .set({
        status: "started",
      })
      .where(eq(providerJobsTable.id, providerJobId));
  }

  async providerJobCompleted(
    ctx: AppContext,
    providerJobId: string,
  ): Promise<void> {
    await ctx
      .getDB()
      .update(providerJobsTable)
      .set({
        status: "completed",
        endTime: new Date().toISOString(),
      })
      .where(eq(providerJobsTable.id, providerJobId));
  }

  async addHashRate(
    ctx: AppContext,
    providerJobId: string,
    hashRate: number,
  ): Promise<void> {
    await ctx
      .getDB()
      .update(providerJobsTable)
      .set({
        hashRate: hashRate,
      })
      .where(eq(providerJobsTable.id, providerJobId));
  }

  async providerJobStopped(
    ctx: AppContext,
    providerJobId: string,
  ): Promise<void> {
    await ctx
      .getDB()
      .update(providerJobsTable)
      .set({
        status: "stopped",
        endTime: new Date().toISOString(),
      })
      .where(eq(providerJobsTable.id, providerJobId));
  }

  async providerJobFailed(
    ctx: AppContext,
    providerJobId: string,
    _error: string,
  ): Promise<void> {
    await ctx
      .getDB()
      .update(providerJobsTable)
      .set({
        status: "failed",
        endTime: new Date().toISOString(),
      })
      .where(eq(providerJobsTable.id, providerJobId));
  }

  async resultFailedParsing(
    ctx: AppContext,
    providerJobId: string,
  ): Promise<void> {
    await ctx
      .getDB()
      .update(providerJobsTable)
      .set({
        offence: "nonsense",
      })
      .where(eq(providerJobsTable.id, providerJobId));
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
    providerJobId: string,
    results: VanityResult[],
  ): Promise<void> {
    const newProofs: NewProofModel[] = results.map((res) => {
      const bestProblem = res.matchingProblems.reduce((best, current) => {
        if (best.difficulty < current.difficulty) {
          return current;
        }
        return best;
      });
      return {
        providerJobId: providerJobId,
        addr: res.address,
        salt: res.salt,
        pubKey: res.pubKey,
        vanityProblem: bestProblem.problem,
      };
    });
    await ctx.getDB().insert(proofsTable).values(newProofs);
  }

  async getProviderJob(
    ctx: AppContext,
    providerJobId: string,
  ): Promise<ProviderJobModel[]> {
    return ctx
      .getDB()
      .select()
      .from(providerJobsTable)
      .where(eq(providerJobsTable.id, providerJobId));
  }
}
