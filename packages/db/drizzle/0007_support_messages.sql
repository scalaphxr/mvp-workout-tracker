CREATE TABLE "support_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"email" text,
	"message" text NOT NULL,
	"app_version" text NOT NULL,
	"device" text NOT NULL,
	"last_sync_at" timestamp with time zone,
	"locale" text NOT NULL,
	"ip" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_messages_ip_idx" ON "support_messages" USING btree ("ip","created_at");