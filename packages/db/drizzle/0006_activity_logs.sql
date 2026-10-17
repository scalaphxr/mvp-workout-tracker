CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"activity_type" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_sec" integer NOT NULL,
	"intensity" integer,
	"distance_m" double precision,
	"avg_hr" integer,
	"calories" integer,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_logs_sync_idx" ON "activity_logs" USING btree ("user_id","sync_seq");