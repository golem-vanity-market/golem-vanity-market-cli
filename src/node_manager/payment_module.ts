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
import { debitNotesTable, NewDebitNoteModel } from "../lib/db/schema";
import { getErrorMessage } from "../utils/format";

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
        this.meterDebitNotes(debitNote, "invalid_amount");
        throw new Error(`Invalid amount in debit note: ${debitNote.id}`);
      }

      if (
        VanityPaymentModule.estimatorService.checkIfProviderFailedToDoWork(
          VanityPaymentModule.ctx,
          debitNote.agreementId,
          amountF,
        )
      ) {
        VanityPaymentModule.ctx
          .L()
          .warn(
            `EstimatorService terminated the agreement for debit note ${debitNote.id}`,
          );
        this.meterDebitNotes(debitNote, "terminated");
        return debitNote;
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
        this.meterDebitNotes(debitNote, "not_accepted");
        return debitNote;
      }
      const newDebitNote: NewDebitNoteModel = {
        agreementId: debitNote.agreementId,
        debitNoteId: debitNote.id,
        glmAmount: amountF,
        status: resp.accepted ? "accepted" : "rejected",
      };
      await VanityPaymentModule.ctx
        .getDB()
        .insert(debitNotesTable)
        .values(newDebitNote);
      this.meterDebitNotes(debitNote, newDebitNote.status);
      return await super.acceptDebitNote(debitNote, allocation, amount);
    } catch (error) {
      VanityPaymentModule.ctx
        .L()
        .error(
          `Failed to accept debit note ${debitNote.id}: ${getErrorMessage(error)}`,
        );
      this.meterDebitNotes(debitNote, "error");
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
        this.meterInvoice(invoice, "invalid_amount");
        throw new Error(`Invalid amount in invoice: ${invoice.id}`);
      }
      if (
        VanityPaymentModule.estimatorService.checkIfProviderFailedToDoWork(
          VanityPaymentModule.ctx,
          invoice.agreementId,
          amountF,
        )
      ) {
        VanityPaymentModule.ctx
          .L()
          .warn(
            `EstimatorService terminated the agreement for invoice ${invoice.id}`,
          );
        this.meterInvoice(invoice, "terminated");
        return invoice;
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
        this.meterInvoice(invoice, "not_accepted");
        return invoice;
      }

      this.meterInvoice(invoice, "accepted");
      return await super.acceptInvoice(invoice, allocation, amount);
    } catch (err) {
      VanityPaymentModule.ctx
        .L()
        .error(
          `Failed to accept invoice ${invoice.id}: ${getErrorMessage(err)}`,
        );
      this.meterInvoice(invoice, "error");
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

  meterInvoice(invoice: Invoice, status: string) {
    const m = VanityPaymentModule.ctx.M();
    m.observeProviderInvoice({
      providerId: invoice.provider.id,
      providerName: invoice.provider.name,
      agreementId: invoice.agreementId,
      amount: parseFloat(invoice.amount),
      status,
    });
  }

  meterDebitNotes(debitNote: DebitNote, status: string) {
    const m = VanityPaymentModule.ctx.M();
    m.observeProviderDebitNote({
      providerId: debitNote.provider.id,
      providerName: debitNote.provider.name,
      agreementId: debitNote.agreementId,
      amount: parseFloat(debitNote.totalAmountDue),
      status,
    });
  }
}
