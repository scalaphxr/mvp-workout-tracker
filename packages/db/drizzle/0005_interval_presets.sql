CREATE TABLE "interval_presets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"title" text NOT NULL,
	"work_sec" integer NOT NULL,
	"rest_sec" integer NOT NULL,
	"rounds" integer NOT NULL,
	"cycles" integer NOT NULL,
	"cycle_rest_sec" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interval_presets" ADD CONSTRAINT "interval_presets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interval_presets_sync_idx" ON "interval_presets" USING btree ("user_id","sync_seq");