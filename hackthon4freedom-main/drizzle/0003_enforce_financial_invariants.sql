CREATE OR REPLACE FUNCTION enforce_receivable_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (CASE OLD.status
    WHEN 'DRAFT' THEN NEW.status IN ('AWAITING_CLIENT')
    WHEN 'AWAITING_CLIENT' THEN NEW.status IN ('UNDER_VALIDATION', 'REJECTED')
    WHEN 'UNDER_VALIDATION' THEN NEW.status IN ('NEEDS_CORRECTION', 'REJECTED', 'APPROVED')
    WHEN 'NEEDS_CORRECTION' THEN NEW.status IN ('AWAITING_CLIENT', 'REJECTED')
    WHEN 'APPROVED' THEN NEW.status IN ('POOLED')
    WHEN 'POOLED' THEN NEW.status IN ('ADVANCED')
    WHEN 'ADVANCED' THEN NEW.status IN ('DUE')
    WHEN 'DUE' THEN NEW.status IN ('PAID', 'DEFAULTED')
    WHEN 'PAID' THEN NEW.status IN ('CLOSED')
    WHEN 'DEFAULTED' THEN NEW.status IN ('PAID', 'CLOSED')
    ELSE false
  END) THEN
    RAISE EXCEPTION 'invalid receivable transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER receivables_transition_guard
BEFORE UPDATE OF status ON receivables
FOR EACH ROW EXECUTE FUNCTION enforce_receivable_transition();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_pool_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (CASE OLD.status
    WHEN 'DRAFT' THEN NEW.status IN ('OPEN', 'CANCELLED')
    WHEN 'OPEN' THEN NEW.status IN ('FULL', 'PARTIAL_EXPIRED', 'CANCELLED')
    WHEN 'FULL' THEN NEW.status IN ('DISBURSING')
    WHEN 'PARTIAL_EXPIRED' THEN NEW.status IN ('ACCEPTED_PARTIAL', 'REFUNDING')
    WHEN 'ACCEPTED_PARTIAL' THEN NEW.status IN ('DISBURSING')
    WHEN 'REFUNDING' THEN NEW.status IN ('CANCELLED')
    WHEN 'DISBURSING' THEN NEW.status IN ('FUNDED', 'DISPUTED')
    WHEN 'FUNDED' THEN NEW.status IN ('SETTLING', 'DISPUTED')
    WHEN 'SETTLING' THEN NEW.status IN ('SETTLED', 'COVERED', 'DISPUTED')
    WHEN 'COVERED' THEN NEW.status IN ('SETTLED', 'DISPUTED')
    WHEN 'DISPUTED' THEN NEW.status IN ('SETTLING', 'CANCELLED')
    ELSE false
  END) THEN
    RAISE EXCEPTION 'invalid pool transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER pools_transition_guard
BEFORE UPDATE OF status ON pools
FOR EACH ROW EXECUTE FUNCTION enforce_pool_transition();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_contribution_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (CASE OLD.status
    WHEN 'CREATED' THEN NEW.status IN ('INVOICE_ISSUED', 'FAILED')
    WHEN 'INVOICE_ISSUED' THEN NEW.status IN ('PENDING', 'EXPIRED', 'FAILED')
    WHEN 'PENDING' THEN NEW.status IN ('SETTLED', 'EXPIRED', 'FAILED')
    WHEN 'SETTLED' THEN NEW.status IN ('ALLOCATED', 'REFUND_PENDING')
    WHEN 'ALLOCATED' THEN NEW.status IN ('DISTRIBUTED', 'REFUND_PENDING')
    WHEN 'REFUND_PENDING' THEN NEW.status IN ('REFUNDED')
    ELSE false
  END) THEN
    RAISE EXCEPTION 'invalid contribution transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER contribution_intents_transition_guard
BEFORE UPDATE OF status ON contribution_intents
FOR EACH ROW EXECUTE FUNCTION enforce_contribution_transition();
--> statement-breakpoint
CREATE TRIGGER contributions_transition_guard
BEFORE UPDATE OF status ON contributions
FOR EACH ROW EXECUTE FUNCTION enforce_contribution_transition();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_validation_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NOT (CASE OLD.status
    WHEN 'PENDING' THEN NEW.status IN ('RUNNING')
    WHEN 'RUNNING' THEN NEW.status IN ('NEEDS_REVIEW', 'PASSED', 'FAILED')
    WHEN 'NEEDS_REVIEW' THEN NEW.status IN ('PASSED', 'FAILED')
    ELSE false
  END) THEN
    RAISE EXCEPTION 'invalid validation transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER validations_transition_guard
BEFORE UPDATE OF status ON validations
FOR EACH ROW EXECUTE FUNCTION enforce_validation_transition();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_pool_receivable_eligibility()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  receivable_state receivable_status;
  btc_accepted boolean;
BEGIN
  SELECT status, client_accepted_btc
    INTO receivable_state, btc_accepted
    FROM receivables
    WHERE id = NEW.receivable_id;

  IF receivable_state NOT IN ('APPROVED', 'POOLED') OR btc_accepted IS NOT TRUE THEN
    RAISE EXCEPTION 'pool requires an approved receivable with BTC acceptance'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER pools_receivable_eligibility_guard
BEFORE INSERT OR UPDATE OF receivable_id ON pools
FOR EACH ROW EXECUTE FUNCTION enforce_pool_receivable_eligibility();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_ledger_transaction_balanced()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_transaction_id text;
  target_status ledger_transaction_status;
  posting_count integer;
BEGIN
  IF TG_TABLE_NAME = 'ledger_transactions' THEN
    target_transaction_id := NEW.id;
    target_status := NEW.status;
  ELSE
    IF TG_OP = 'DELETE' THEN
      target_transaction_id := OLD.transaction_id;
    ELSE
      target_transaction_id := NEW.transaction_id;
    END IF;
    SELECT status INTO target_status
      FROM ledger_transactions
      WHERE id = target_transaction_id;
  END IF;

  IF target_status IN ('POSTED', 'REVERSED') THEN
    SELECT count(*) INTO posting_count
      FROM ledger_entries
      WHERE transaction_id = target_transaction_id;

    IF posting_count < 2 OR EXISTS (
      SELECT 1
      FROM ledger_entries
      WHERE transaction_id = target_transaction_id
      GROUP BY asset
      HAVING sum(amount) <> 0
    ) THEN
      RAISE EXCEPTION 'ledger transaction % is not balanced', target_transaction_id
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_entries_balance_guard
AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_ledger_transaction_balanced();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_transaction_post_guard
AFTER INSERT OR UPDATE OF status ON ledger_transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_ledger_transaction_balanced();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION enforce_ledger_account_asset()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  account_asset asset_code;
BEGIN
  SELECT asset INTO account_asset
    FROM ledger_accounts
    WHERE id = NEW.account_id;

  IF account_asset IS DISTINCT FROM NEW.asset THEN
    RAISE EXCEPTION 'ledger entry asset must match its account asset'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_account_asset_guard
BEFORE INSERT OR UPDATE OF account_id, asset ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION enforce_ledger_account_asset();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_posted_ledger_entry_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_transaction_id text;
  target_status ledger_transaction_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_transaction_id := OLD.transaction_id;
  ELSE
    target_transaction_id := NEW.transaction_id;
  END IF;
  SELECT status INTO target_status
    FROM ledger_transactions
    WHERE id = target_transaction_id;

  IF target_status <> 'PENDING' THEN
    RAISE EXCEPTION 'entries of a posted ledger transaction are immutable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER ledger_entries_immutable_after_post
BEFORE INSERT OR UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_posted_ledger_entry_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION assert_pool_funding_consistent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_pool_id text;
  stored_funded_amount bigint;
  allocated_amount bigint;
BEGIN
  IF TG_TABLE_NAME = 'pools' THEN
    target_pool_id := NEW.id;
  ELSE
    IF TG_OP = 'DELETE' THEN
      target_pool_id := OLD.pool_id;
    ELSE
      target_pool_id := NEW.pool_id;
    END IF;
  END IF;

  SELECT funded_amount INTO stored_funded_amount
    FROM pools
    WHERE id = target_pool_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO allocated_amount
    FROM pool_allocations
    WHERE pool_id = target_pool_id;

  IF stored_funded_amount <> allocated_amount THEN
    RAISE EXCEPTION 'pool % funded amount (%) differs from allocations (%)',
      target_pool_id, stored_funded_amount, allocated_amount
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pool_allocations allocation
    JOIN contributions contribution ON contribution.id = allocation.contribution_id
    JOIN contribution_intents intent ON intent.id = contribution.intent_id
    WHERE allocation.pool_id = target_pool_id
      AND (
        allocation.amount <> contribution.amount
        OR intent.pool_id <> allocation.pool_id
        OR contribution.asset <> 'BTC'::asset_code
      )
  ) THEN
    RAISE EXCEPTION 'pool % contains an inconsistent allocation', target_pool_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER pool_allocations_consistency_guard
AFTER INSERT OR UPDATE OR DELETE ON pool_allocations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_pool_funding_consistent();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER pools_funded_amount_consistency_guard
AFTER INSERT OR UPDATE OF funded_amount ON pools
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_pool_funding_consistent();
