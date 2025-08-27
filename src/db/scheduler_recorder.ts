import { eq, sql } from "drizzle-orm";
import { AppContext } from "../app_context";
import { NewJobModel, jobsTable } from "../lib/db/schema";
import { GenerationParams, ProcessingUnitType } from "../params";
import { SchedulerRecorder } from "../scheduler/types";

export class SchedulerRecorderImpl implements SchedulerRecorder {
  async startGenerationJob(
    ctx: AppContext,
    generationId: string,
    params: GenerationParams,
    processingUnit: ProcessingUnitType,
  ): Promise<void> {
    const newJob: NewJobModel = {
      id: generationId,
      publicKey: params.publicKey,
      vanityProblems: params.problems,
      numWorkers: params.numberOfWorkers,
      budgetGlm: params.budgetLimit,
      processingUnit: processingUnit,
    };
    await ctx.getDB().insert(jobsTable).values(newJob);
  }

  async stopGenerationJob(
    ctx: AppContext,
    generationId: string,
  ): Promise<void> {
    await ctx
      .getDB()
      .update(jobsTable)
      .set({ endedAt: sql`(current_timestamp)` })
      .where(eq(jobsTable.id, generationId));
  }
}
