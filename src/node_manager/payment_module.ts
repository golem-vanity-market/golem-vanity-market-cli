import {
  Allocation,
  Logger,
  PaymentModuleImpl,
  YagnaApi,
} from "@golem-sdk/golem-js";
import { AppContext } from "../app_context";
import { EstimatorService } from "../estimator_service";
import {
  CreateAllocationParams,
  DebitNote,
  Invoice,
} from "@golem-sdk/golem-js/dist/payment";
import { GolemServices } from "@golem-sdk/golem-js/dist/golem-network";
import { PaymentModuleOptions } from "@golem-sdk/golem-js/dist/payment/payment.module";

export class VanityPaymentModule extends PaymentModuleImpl {
  public static estimatorService: EstimatorService;
  public static ctx: AppContext;

  constructor(deps: GolemServices, options?: PaymentModuleOptions) {
    super(deps, options);
  }

  async acceptDebitNote(
    debitNote: DebitNote,
    allocation: Allocation,
    amount: string,
  ): Promise<DebitNote> {
    try {
      VanityPaymentModule.ctx.consoleInfo(
        "Accepting debit note:",
        debitNote.id,
      );

      const amountF = parseFloat(debitNote.totalAmountDue);

      if (isNaN(amountF) || amountF < 0) {
        VanityPaymentModule.ctx
          .L()
          .error(`Invalid amount in debit note: ${debitNote.id}`);
        throw new Error(`Invalid amount in debit note: ${debitNote.id}`);
      }
      const resp = VanityPaymentModule.estimatorService.reportCosts(
        debitNote.agreementId,
        amountF,
      );

      if (!resp.accepted) {
        VanityPaymentModule.ctx
          .L()
          .error(
            `Failed to report costs for debit note ${debitNote.id}: ${resp.reason}`,
          );
        throw new Error(
          `Failed to report costs for debit note ${debitNote.id}: ${resp.reason}`,
        );
      }
      return await super.acceptDebitNote(debitNote, allocation, amount);
    } catch (error) {
      VanityPaymentModule.ctx
        .L()
        .error(`Failed to accept debit note ${debitNote.id}: ${error}`);
      throw error;
    }
  }
  async acceptInvoice(
    invoice: Invoice,
    allocation: Allocation,
    amount: string,
  ) {
    try {
      const amountF = parseFloat(invoice.amount);

      if (isNaN(amountF) || amountF < 0) {
        VanityPaymentModule.ctx
          .L()
          .error(`Invalid amount in invoice: ${invoice.id}`);
        throw new Error(`Invalid amount in invoice: ${invoice.id}`);
      }
      const resp = VanityPaymentModule.estimatorService.reportCosts(
        invoice.agreementId,
        amountF,
      );
      if (!resp.accepted) {
        VanityPaymentModule.ctx
          .L()
          .error(
            `Failed to report costs for invoice ${invoice.id}: ${resp.reason}`,
          );
        return invoice;
      }
      return await super.acceptInvoice(invoice, allocation, amount);
    } catch (err) {
      VanityPaymentModule.ctx
        .L()
        .error(`Failed to accept invoice ${invoice.id}: ${err}`);
      throw err;
    }
  }

  // golem-js doesn't implement amending allocations
  async amendAllocation(
    allocation: Allocation,
    newParams: CreateAllocationParams,
  ): Promise<Allocation> {
    const yagnaAPi: YagnaApi = this["yagnaApi"];
    const logger: Logger = this["logger"];
    try {
      logger.debug("Amending allocation", {
        allocationId: allocation.id,
        ...newParams,
      });
      const now = new Date();
      const newTimeout = new Date(
        +now + newParams.expirationSec * 1000,
      ).toISOString();
      const newAllocationModel = await yagnaAPi.payment.amendAllocation(
        allocation.id,
        {
          timeout: newTimeout,
          totalAmount: newParams.budget.toString(),
        },
      );
      logger.info("Allocation amended", {
        allocationId: allocation.id,
        ...newParams,
      });
      return new Allocation(newAllocationModel);
    } catch (err) {
      logger.error("Error amending allocation", { err });
      throw err;
    }
  }
}
