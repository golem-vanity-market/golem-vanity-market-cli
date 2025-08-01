import { AppContext } from "../app_context";
import { Problem } from "../lib/db/schema";
import { GenerationParams, ProcessingUnitType } from "../params";

export interface SchedulerRecorder {
  startGenerationJob(
    ctx: AppContext,
    generationId: string,
    problem: Problem,
    params: GenerationParams,
    processingUnit: ProcessingUnitType,
  ): Promise<void>;
}
