CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"owner_id" uuid NOT NULL,
	"sport" text NOT NULL,
	"started_at" timestamp(3) with time zone NOT NULL,
	"duration_seconds" bigint NOT NULL,
	"distance_meters" bigint NOT NULL,
	"effort" integer,
	"average_heart_rate" bigint,
	"max_heart_rate" bigint,
	"average_power" double precision,
	"max_power" double precision,
	"average_swolf" double precision,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_sport" CHECK ("sport" in ('running', 'cycling', 'swimming')),
	CONSTRAINT "activities_started_in_past" CHECK ("started_at" < "created_at"),
	CONSTRAINT "activities_duration" CHECK ("duration_seconds" between 1 and 9007199254740991),
	CONSTRAINT "activities_distance" CHECK ("distance_meters" between 1 and 9007199254740991),
	CONSTRAINT "activities_effort" CHECK ("effort" between 0 and 10),
	CONSTRAINT "activities_heart_rate" CHECK ((
    ("average_heart_rate" is null and "max_heart_rate" is null) or
    ("average_heart_rate" is not null and "max_heart_rate" is not null
      and "average_heart_rate" > 0 and "max_heart_rate" <= 9007199254740991
      and "average_heart_rate" <= "max_heart_rate")
  )),
	CONSTRAINT "activities_power" CHECK ((
    ("average_power" is null and "max_power" is null) or
    ("sport" in ('running', 'cycling')
      and "average_power" is not null and "max_power" is not null
      and "average_power" >= 0 and "max_power" < 'Infinity'::float8
      and "average_power" <= "max_power")
  )),
	CONSTRAINT "activities_swolf" CHECK ("average_swolf" is null or
    ("sport" = 'swimming' and "average_swolf" > 0 and "average_swolf" < 'Infinity'::float8)),
	CONSTRAINT "activities_timestamp_order" CHECK ("updated_at" >= "created_at")
);
