ALTER TABLE "nostr_auth_challenges" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "supabase_auth_user_id" uuid;--> statement-breakpoint
ALTER TABLE "nostr_auth_challenges" ADD CONSTRAINT "nostr_auth_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nostr_auth_challenges_user_idx" ON "nostr_auth_challenges" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_supabase_auth_user_id_unique" UNIQUE("supabase_auth_user_id");