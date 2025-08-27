import type { AppContext } from "../app_context";
import type { GenerationParams, ProcessingUnitType } from "../params";

export interface SchedulerRecorder {
  startGenerationJob(
    ctx: AppContext,
    generationId: string,
    params: GenerationParams,
    processingUnit: ProcessingUnitType,
  ): Promise<void>;

  stopGenerationJob(ctx: AppContext, generationId: string): Promise<void>;
}
