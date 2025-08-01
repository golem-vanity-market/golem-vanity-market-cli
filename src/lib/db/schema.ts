import {
  integer,
  real,
  sqliteTable,
  text,
  numeric,
} from "drizzle-orm/sqlite-core";
import { InferInsertModel, InferSelectModel, sql } from "drizzle-orm";

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
export type ProcessingUnit = (typeof processingUnitNames)[number];
export type JobStatus = (typeof statusNames)[number];
export type JobOffence = (typeof offenceNames)[number];

export type problemType = "prefix" | "suffix";

export interface Problem {
  type: problemType;
  specifier: string;
}

export const jobsTable = sqliteTable("job", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  vanityProblem: text({ mode: "json" }).notNull().$type<Problem>(),
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
  agreementId: text("agreement_id"),
  status: text({ enum: statusNames }).notNull().$type<JobStatus>(),
  offence: text({ enum: offenceNames }).$type<JobOffence>(),
  providerId: text("provider_id").notNull(),
  providerName: text("provider_name").notNull(),
  providerWalletAddress: text("provider_wallet_address").notNull(),
  glmSpent: numeric("glm_spent"),
  hashRate: numeric("hash_rate"),
  vanityAdditionalProblems: text({ mode: "json" }).$type<Problem[]>(),
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
