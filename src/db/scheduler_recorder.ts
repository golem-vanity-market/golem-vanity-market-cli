import { AppContext } from "../app_context";
import { Problem, NewJobModel, jobsTable } from "../lib/db/schema";
import { GenerationParams, ProcessingUnitType } from "../params";
import { SchedulerRecorder } from "../scheduler/types";

export class SchedulerRecorderImpl implements SchedulerRecorder {
  async startGenerationJob(
    ctx: AppContext,
    generationId: string,
    problem: Problem,
    params: GenerationParams,
    processingUnit: ProcessingUnitType,
  ): Promise<void> {
    const newJob: NewJobModel = {
      id: generationId,
      publicKey: params.publicKey,
      vanityProblem: problem,
      numWorkers: params.numberOfWorkers,
      budgetGlm: params.budgetLimit,
      processingUnit: processingUnit,
    };
    await ctx.getDB().insert(jobsTable).values(newJob);
  }
}
