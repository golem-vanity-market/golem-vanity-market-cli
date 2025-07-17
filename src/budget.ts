import { GolemSessionManager } from "./node_manager/golem_session";

export class BudgetMonitor {
  private budgetAlertThreshold: number = 0.1; // Default threshold for low budget alert (10% of total budget)

  constructor(private readonly sessionManager: GolemSessionManager) {}

  /**
   * Return `true` if the budget is sufficient to continue work, `false` otherwise.
   */
  public async hasSufficientBudget(): Promise<boolean> {
    const allocationId = this.sessionManager.getAllocationId();
    const allocation = await this.sessionManager
      .getGolemNetwork()
      .payment.getAllocation(allocationId);
    return (
      Number(allocation.remainingAmount) / Number(allocation.totalAmount) >
      this.budgetAlertThreshold
    );
  }

  public async displayBudgetInfo(): Promise<void> {
    const allocationId = this.sessionManager.getAllocationId();
    const allocation = await this.sessionManager
      .getGolemNetwork()
      .payment.getAllocation(allocationId);
    console.log(
      `Remaining budget: ${Number(allocation.remainingAmount).toFixed(3)} GLM (out of ${Number(allocation.totalAmount).toFixed(3)} GLM)`,
    );
  }
}
