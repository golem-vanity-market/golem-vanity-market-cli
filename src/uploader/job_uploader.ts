import type { ProofEntryResult } from "./../estimator/proof";
import type { AppContext } from "./../app_context";
import { getCruncherVersion } from "./../node_manager/config";

export class ExternalJobUploader {
  private uploadBase: string;
  private cruncherVersion: string = getCruncherVersion();

  //@todo, read yagna id from config
  constructor(uploadBase: string) {
    this.uploadBase = uploadBase;
  }

  public async createRemoteJob(
    ctx: AppContext,
    providerId: string,
    providerWalletAddress: string,
    providerName: string,
  ): Promise<string> {
    const newJob = {
      miner: {
        provNodeId: providerId,
        provRewardAddress: providerWalletAddress,
        provName: providerName,
        provExtraInfo: "extra-info",
      },
      cruncherVer: this.cruncherVersion,
      requestorId: process.env.YAGNA_ID, // @todo: read properly
    };
    const resp = await fetch(`${this.uploadBase}/api/job/new`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(newJob),
    });

    if (!resp.ok) {
      const error = await resp.text();
      ctx.L().error(`Failed to create new job for total estimator: ${error}`);
      throw new Error(`Failed to create new job for total estimator`);
    }
    const res = await resp.json();
    ctx.L().info(`Created new job for total estimator: ${JSON.stringify(res)}`);

    if (!res.uid || typeof res.uid !== "string") {
      ctx
        .L()
        .error(`Invalid response from job uploader: ${JSON.stringify(res)}`);
      throw new Error(`Invalid response from job uploader`);
    }
    return res.uid as string;
  }

  public async uploadProofsToCentralServer(
    ctx: AppContext,
    proofQueue: ProofEntryResult[],
    uploadUid: string,
    agreementId: string,
  ): Promise<void> {
    const uploadMany = [];
    for (const entry of proofQueue) {
      uploadMany.push({
        salt: entry.salt,
        address: entry.addr,
        factory: entry.pubKey,
      });
    }

    const resp = await fetch(`${this.uploadBase}/api/fancy/new_many`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: uploadMany,
        extra: {
          jobId: uploadUid,
          reportedHashes: 0,
          reportedCost: 0,
        },
      }),
    });
    if (!resp.ok) {
      const error = await resp.text();
      ctx.L().error(`Failed to upload proofs for job ${agreementId}: ${error}`);
      throw new Error(`Failed to upload proofs for job ${agreementId}`);
    }

    const res = await resp.json();
    const totalScore = res.totalScore || 0;

    if (totalScore > 0) {
      ctx.L().info(`Accepted proofs on central server: ${totalScore}.`);
    } else {
      ctx.L().info(`No accepted proofs on central server.`);
    }
  }
}
