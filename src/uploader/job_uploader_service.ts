import type { AppContext } from "./../app_context";
import type { ProofEntryResult } from "./../estimator/proof";
import { ExternalJobUploader } from "./job_uploader";
import type { JobUploaderService } from "./../node_manager/job_uploader";

class JobUploaderServiceImpl implements JobUploaderService {
  private proofQueue: Map<string, ProofEntryResult[]> = new Map();

  private uploadUids: Map<string, string | null> = new Map();
  private ctx;
  private jobUploader: ExternalJobUploader;

  constructor(ctx: AppContext, jobUploader: ExternalJobUploader) {
    this.ctx = ctx;
    this.jobUploader = jobUploader;
  }

  public async initJobIfNotInitialized(
    jobId: string,
    providerName: string,
    providerId: string,
    providerWalletAddress: string,
  ) {
    if (!this.uploadUids.has(jobId)) {
      const uploadUid =
        (await this.jobUploader.createRemoteJob(
          this.ctx,
          providerId,
          providerWalletAddress,
          providerName,
        )) ?? null;
      this.uploadUids.set(jobId, uploadUid);
      const queue: ProofEntryResult[] = [];
      this.proofQueue.set(jobId, queue);
    }
  }

  public async process(agreementId: string): Promise<void> {
    const proofQueue = this.proofQueue.get(agreementId);
    this.proofQueue.set(agreementId, []); // Clear the proof queue after processing

    if (!proofQueue) {
      this.ctx.L().error(`No proof queue found for agreement ${agreementId}.`);
      throw new Error(`No proof queue found for agreement ${agreementId}.`);
    }

    const uploadUid = this.uploadUids.get(agreementId);
    if (!uploadUid) {
      this.ctx.L().error(`Estimator for job ${agreementId} not found.`);
      throw Error("Estimator not found for job: " + agreementId);
    }

    await this.jobUploader.uploadProofsToCentralServer(
      this.ctx,
      proofQueue,
      uploadUid,
      agreementId,
    );
  }

  public pushProofToQueue(result: ProofEntryResult): boolean {
    const jId = result.jobId;
    const queue = this.proofQueue.get(jId);
    if (!queue) {
      this.ctx.L().error(`No proof queue found for job ${jId}.`);
      throw new Error(`No proof queue found for job ${jId}.`);
    }
    queue.push(result);
    return true;
  }
}

export function newJobUploaderService(
  ctx: AppContext,
  uploaderBaseUrl: string,
): JobUploaderService {
  const jobUploaderService = new JobUploaderServiceImpl(
    ctx,
    new ExternalJobUploader(uploaderBaseUrl),
  );
  return jobUploaderService;
}
