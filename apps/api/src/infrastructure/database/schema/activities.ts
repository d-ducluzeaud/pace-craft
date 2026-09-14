import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    ownerId: uuid("owner_id").notNull(),
    sport: text("sport", { enum: ["running", "cycling", "swimming"] }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, precision: 3 }).notNull(),
    durationSeconds: bigint("duration_seconds", { mode: "number" }).notNull(),
    distanceMeters: bigint("distance_meters", { mode: "number" }).notNull(),
    effort: integer("effort"),
    averageHeartRate: bigint("average_heart_rate", { mode: "number" }),
    maxHeartRate: bigint("max_heart_rate", { mode: "number" }),
    averagePower: doublePrecision("average_power"),
    maxPower: doublePrecision("max_power"),
    averageSwolf: doublePrecision("average_swolf"),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    index("activities_owner_history_idx").on(
      table.ownerId,
      table.startedAt.desc().nullsFirst(),
      table.id.desc().nullsFirst(),
    ),
    check("activities_sport", sql`${table.sport} in ('running', 'cycling', 'swimming')`),
    check("activities_started_in_past", sql`${table.startedAt} < ${table.createdAt}`),
    check("activities_duration", sql`${table.durationSeconds} between 1 and 9007199254740991`),
    check("activities_distance", sql`${table.distanceMeters} between 1 and 9007199254740991`),
    check("activities_effort", sql`${table.effort} between 0 and 10`),
    check(
      "activities_heart_rate",
      sql`(
    (${table.averageHeartRate} is null and ${table.maxHeartRate} is null) or
    (${table.averageHeartRate} is not null and ${table.maxHeartRate} is not null
      and ${table.averageHeartRate} > 0 and ${table.maxHeartRate} <= 9007199254740991
      and ${table.averageHeartRate} <= ${table.maxHeartRate})
  )`,
    ),
    check(
      "activities_power",
      sql`(
    (${table.averagePower} is null and ${table.maxPower} is null) or
    (${table.sport} in ('running', 'cycling')
      and ${table.averagePower} is not null and ${table.maxPower} is not null
      and ${table.averagePower} >= 0 and ${table.maxPower} < 'Infinity'::float8
      and ${table.averagePower} <= ${table.maxPower})
  )`,
    ),
    check(
      "activities_swolf",
      sql`${table.averageSwolf} is null or
    (${table.sport} = 'swimming' and ${table.averageSwolf} > 0 and ${table.averageSwolf} < 'Infinity'::float8)`,
    ),
    check(
      "activities_completed",
      sql`${table.durationSeconds} <= extract(epoch from (${table.createdAt} - ${table.startedAt}))`,
    ),
    check("activities_timestamp_order", sql`${table.updatedAt} >= ${table.createdAt}`),
  ],
);
