import http from "http";
import url from "url";
import { AppContext } from "../app_context";
import { EstimatorService } from "../estimator_service";
import { GolemSessionManager } from "../node_manager/golem_session";
import { ReputationImpl } from "../reputation/reputation";

interface SetParams {
  minimumSpeed: number;
  minimumEfficiency: number;
  singlePassSeconds: number;
}

export function startStatusServer(
  appCtx: AppContext,
  listenAddr: string,
  estimatorService: EstimatorService,
  golemSessionManager: GolemSessionManager,
  reputation: ReputationImpl,
) {
  const addr = listenAddr.replace("http://", "").replace("https://", "");
  const host = addr.split(":")[0];
  const port = parseInt(addr.split(":")[1], 10);

  const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url || "", true);
    const pathname = parsedUrl.pathname || "";

    const sendJSON = (status: number, data: object) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };

    const parseBody = async (): Promise<object> => {
      return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (err) {
            if (err instanceof Error) {
              reject(err);
            } else {
              reject(new Error(`Invalid json: ${err}`));
            }
          }
        });
      });
    };

    try {
      // === Routes ===
      if (req.method === "GET" && pathname === "/status") {
        const estimators = estimatorService.allEstimatorsInfo();
        const rentals = golemSessionManager.getRentalStatus();

        // Match estimators with rentals
        for (const estimator of estimators.estimators) {
          if (rentals.activeRentals) {
            for (const rental of rentals.activeRentals) {
              if (estimator.jobId === rental.agreementId) {
                estimator.rental = rental;
              }
            }
          }
        }

        return sendJSON(200, {
          sessions: estimators,
          timestamp: new Date().toISOString(),
        });
      }

      if (req.method === "GET" && pathname === "/estimator/total") {
        return sendJSON(200, {
          sessions: estimatorService.totalOnly(),
          timestamp: new Date().toISOString(),
        });
      }

      if (req.method === "GET" && pathname === "/proposals") {
        return sendJSON(200, {
          proposals: golemSessionManager.getProposals(),
          timestamp: new Date().toISOString(),
        });
      }

      if (req.method === "GET" && pathname === "/rentals") {
        return sendJSON(200, {
          rentals: golemSessionManager.getRentalStatus(),
          timestamp: new Date().toISOString(),
        });
      }

      if (req.method === "GET" && pathname === "/providers/banned") {
        return sendJSON(200, {
          bannedProviders: reputation.bannedProviders(),
          timestamp: new Date().toISOString(),
        });
      }

      if (req.method === "POST" && pathname === "/providers/banned/reset") {
        if (reputation.numberOfBannedProviders() === 0) {
          appCtx.L().info("No banned providers to reset");
          return sendJSON(200, { message: "No banned providers to reset" });
        }
        appCtx.L().info("Resetting banned providers");
        reputation.reset(appCtx);
        return sendJSON(200, {
          message: "Banned providers reset successfully",
        });
      }

      if (req.method === "GET" && pathname === "/operation/params") {
        const params = estimatorService.getDynamicParams();
        if (!params) {
          return sendJSON(404, { error: "Generation parameters not set" });
        }
        return sendJSON(200, {
          params,
          timestamp: new Date().toISOString(),
        });
      }

      if (req.method === "POST" && pathname === "/operation/params/set") {
        let bodyData;
        try {
          bodyData = await parseBody();
        } catch {
          return sendJSON(400, { error: "Invalid JSON" });
        }

        const { minimumSpeed, minimumEfficiency, singlePassSeconds } =
          bodyData as SetParams;

        if (
          typeof minimumSpeed !== "number" ||
          typeof minimumEfficiency !== "number" ||
          typeof singlePassSeconds !== "number"
        ) {
          return sendJSON(400, {
            error:
              "minimumSpeed, minimumEfficiency, and singlePassSeconds must be numbers",
          });
        }

        const params = estimatorService.getDynamicParams();
        if (!params) {
          return sendJSON(404, { error: "Generation parameters not set" });
        }

        const updatedParams = {
          ...params,
          minimumAcceptedEfficiency: minimumEfficiency,
          minimumAcceptedSpeed: minimumSpeed,
        };

        if (JSON.stringify(updatedParams) !== JSON.stringify(params)) {
          appCtx
            .L()
            .info(
              `Setting new dynamic parameters: ${JSON.stringify(updatedParams)}`,
            );
          estimatorService.setDynamicParams(updatedParams);
        } else {
          appCtx.L().info("Dynamic parameters unchanged");
        }

        return sendJSON(200, { message: "Parameters updated successfully" });
      }

      // Default 404
      sendJSON(404, { error: "Not Found" });
    } catch (err) {
      appCtx.L().error("Error processing request:", err);
      sendJSON(500, { error: "Internal Server Error" });
    }
  });

  server.listen(port, host, () => {
    appCtx.L().info(`Native status server running at ${listenAddr}/status`);
  });
}
