import { Allocation, PaymentModuleImpl } from "@golem-sdk/golem-js";
import { AppContext } from "../app_context";
import { EstimatorService } from "../estimator_service";
import { DebitNote, Invoice } from "@golem-sdk/golem-js/dist/payment";
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
    console.log("Accepting debit note:", debitNote.id);

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
      return debitNote;
      //throw new Error(`Failed to report costs for debit note: ${resp.reason}`);
    }
    return super.acceptDebitNote(debitNote, allocation, amount);
  }
  async acceptInvoice(
    invoice: Invoice,
    allocation: Allocation,
    amount: string,
  ) {
    const amountF = parseFloat(invoice.amount);

    if (isNaN(amountF) || amountF < 0) {
      VanityPaymentModule.ctx
        .L()
        .error(`Invalid amount in debit note: ${invoice.id}`);
      throw new Error(`Invalid amount in debit note: ${invoice.id}`);
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
      //throw new Error(`Failed to report costs for debit note: ${resp.reason}`);
    }
    return super.acceptInvoice(invoice, allocation, amount);
  }
}
