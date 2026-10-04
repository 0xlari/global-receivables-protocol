CREATE OR REPLACE FUNCTION enforce_identity_evidence_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (CASE OLD.status
    WHEN 'PENDING' THEN NEW.status IN ('VERIFIED', 'REVOKED')
    WHEN 'VERIFIED' THEN NEW.status IN ('REVOKED', 'EXPIRED')
    ELSE false
  END) THEN
    RAISE EXCEPTION 'invalid identity evidence transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER identity_evidences_transition_guard
BEFORE UPDATE OF status ON identity_evidences
FOR EACH ROW EXECUTE FUNCTION enforce_identity_evidence_transition();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_collateral_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (CASE OLD.status
    WHEN 'PROPOSED' THEN NEW.status IN ('ACTIVE', 'REVOKED')
    WHEN 'ACTIVE' THEN NEW.status IN ('RELEASED', 'REVOKED', 'EXPIRED')
    ELSE false
  END) THEN
    RAISE EXCEPTION 'invalid collateral transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER collaterals_transition_guard
BEFORE UPDATE OF status ON collaterals
FOR EACH ROW EXECUTE FUNCTION enforce_collateral_transition();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_reputation_fact_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status <> 'ACTIVE' OR NEW.status NOT IN ('REVOKED', 'EXPIRED') THEN
    RAISE EXCEPTION 'invalid reputation fact transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER reputation_facts_transition_guard
BEFORE UPDATE OF status ON reputation_facts
FOR EACH ROW EXECUTE FUNCTION enforce_reputation_fact_transition();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_consent_revocation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.user_id <> NEW.user_id
    OR OLD.type <> NEW.type
    OR OLD.policy_version <> NEW.policy_version
    OR OLD.granted_at <> NEW.granted_at
    OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
  THEN
    RAISE EXCEPTION 'consent grants are immutable and revocation is permanent'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER consents_revocation_guard
BEFORE UPDATE ON consents
FOR EACH ROW EXECUTE FUNCTION enforce_consent_revocation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_credit_limit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'credit limit events are append-only'
    USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER credit_limit_events_append_only
BEFORE UPDATE OR DELETE ON credit_limit_events
FOR EACH ROW EXECUTE FUNCTION prevent_credit_limit_event_mutation();
