import http from "http";
import url from "url";
import { AppContext } from "../app_context";
import { EstimatorService } from "../estimator_service";
import { GolemSessionManager } from "../node_manager/golem_session";
import { ReputationImpl } from "../reputation/reputation";
import { Scheduler } from "../scheduler";

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
  scheduler: Scheduler,
  reputation: ReputationImpl,
) {
  const addr = listenAddr.replace("http://", "").replace("https://", "");
  const host = addr.split(":")[0];
  const port = parseInt(addr.split(":")[1], 10);

  const server = http.createServer((req, res) => {
    void (async () => {
      const parsedUrl = url.parse(req.url || "", true);
      const pathname = parsedUrl.pathname || "";

      const sendJSON = (status: number, data: object) => {
        res.writeHead(status, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
        });

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
                reject(new Error(`Invalid json: ${String(err)}`));
              }
            }
          });
        });
      };

      try {
        //handle preflight requests <- this saves a lot of headache with setting proxy
        if (req.method === "OPTIONS") {
          res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400",
            "Content-Length": "0",
            "Content-Type": "text/plain charset=UTF-8",
          });
          res.end();
          return;
        }

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

        if (req.method === "GET" && pathname === "/workers/max") {
          const workerCount = scheduler.getNumberOfWorkers();
          return sendJSON(200, {
            workerCount,
            timestamp: new Date().toISOString(),
          });
        }
        if (req.method === "GET" && pathname === "/problem") {
          return sendJSON(200, {
            problem: {},
            timestamp: new Date().toISOString(),
          });
        }
        if (req.method === "POST" && pathname === "/workers/max/set") {
          let bodyData;
          try {
            bodyData = await parseBody();
          } catch {
            return sendJSON(400, { error: "Invalid JSON" });
          }

          const { maxWorkers } = bodyData as { maxWorkers: number };

          if (typeof maxWorkers !== "number" || maxWorkers < 0) {
            return sendJSON(400, {
              error: "maxWorkers must be a non-negative number",
            });
          }

          appCtx.L().info(`Setting maximum workers to ${maxWorkers}`);
          scheduler.setNumberOfWorkers(maxWorkers);
          return sendJSON(200, {
            message: "Maximum workers updated successfully",
          });
        }

        if (req.method === "GET" && pathname === "/workers/active") {
          const workerCount = scheduler.getTaskOpenedCount();
          return sendJSON(200, {
            workerCount,
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
    })().catch((err) => {
      appCtx.L().error("Unhandled error in request handler:", err);
    });
  });

  server.listen(port, host, () => {
    appCtx.L().info(`Native status server running at ${listenAddr}/status`);
  });
}
