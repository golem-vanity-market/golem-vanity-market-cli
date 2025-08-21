import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { InferInsertModel, InferSelectModel, sql } from "drizzle-orm";
import { GeneratedAddressCategory } from "../../pattern/pattern";

export const processingUnitNames = ["cpu", "gpu"] as const;
export const statusNames = [
  "pending",
  "started",
  "completed",
  "failed",
  "stopped",
] as const;
export const offenceNames = [
  "ddos",
  "incorrect results",
  "repeat",
  "nonsense",
] as const;
export const debitNoteStatusNames = ["accepted", "rejected"] as const;
export type ProcessingUnit = (typeof processingUnitNames)[number];
export type JobStatus = (typeof statusNames)[number];
export type JobOffence = (typeof offenceNames)[number];
export type DebitNoteStatus = (typeof debitNoteStatusNames)[number];

export type Problem =
  | {
      type: Exclude<GeneratedAddressCategory, "user-prefix" | "user-suffix">;
    }
  | {
      type: "user-prefix";
      specifier: string;
    }
  | {
      type: "user-suffix";
      specifier: string;
    };

export const jobsTable = sqliteTable("job", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  vanityProblems: text({ mode: "json" }).notNull().$type<Problem[]>(),
  numWorkers: integer("num_workers").notNull(),
  budgetGlm: real("budget_glm").notNull(),
  processingUnit: text({ enum: processingUnitNames })
    .notNull()
    .$type<ProcessingUnit>(),
});

export type NewJobModel = InferInsertModel<typeof jobsTable>;
export type JobModel = InferSelectModel<typeof jobsTable>;

export const providerJobsTable = sqliteTable("provider_job", {
  id: text("id").primaryKey(),
  jobId: text("job_id")
    .notNull()
    .references(() => jobsTable.id, { onDelete: "cascade" }),
  agreementId: text("agreement_id")
    .notNull()
    .references(() => agreementsTable.agreementId, { onDelete: "cascade" }),
  status: text({ enum: statusNames }).notNull().$type<JobStatus>(),
  offence: text({ enum: offenceNames }).$type<JobOffence>(),
  hashRate: real("hash_rate"),
  startTime: text("start_time")
    .notNull()
    .default(sql`(current_timestamp)`),
  endTime: text("end_time"),
});

export type ProviderJobModel = InferSelectModel<typeof providerJobsTable>;
export type NewProviderJobModel = InferInsertModel<typeof providerJobsTable>;

export const proofsTable = sqliteTable("proof", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  providerJobId: text("provider_job_id")
    .notNull()
    .references(() => providerJobsTable.id, { onDelete: "cascade" }),
  addr: text("addr").notNull(),
  salt: text("salt").notNull(),
  pubKey: text("pub_key").notNull(),
  vanityProblem: text({ mode: "json" }).notNull().$type<Problem>(),
});

export type ProofModel = InferSelectModel<typeof proofsTable>;
export type NewProofModel = InferInsertModel<typeof proofsTable>;

export const agreementsTable = sqliteTable("agreement", {
  agreementId: text("agreement_id").primaryKey(),
  providerId: text("provider_id").notNull(),
  providerName: text("provider_name").notNull(),
  providerWalletAddress: text("provider_wallet_address").notNull(),
  jobId: text("job_id")
    .notNull()
    .references(() => jobsTable.id, { onDelete: "cascade" }),
});

export type AgremeentModel = InferSelectModel<typeof agreementsTable>;
export type NewAgreementModel = InferInsertModel<typeof agreementsTable>;

export const debitNotesTable = sqliteTable("debitNote", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  debitNoteId: text("debitnote_id"),
  agreementId: text("agreement_id")
    .notNull()
    .references(() => agreementsTable.agreementId, { onDelete: "cascade" }),
  glmAmount: real("glm_amount"),
  timestamp: text("timestamp")
    .notNull()
    .default(sql`(current_timestamp)`),
  status: text({ enum: debitNoteStatusNames })
    .notNull()
    .$type<DebitNoteStatus>(),
});

export type DebitNoteModel = InferSelectModel<typeof debitNotesTable>;
export type NewDebitNoteModel = InferInsertModel<typeof debitNotesTable>;
