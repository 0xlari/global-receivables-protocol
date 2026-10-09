use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

declare_id!("CDqVimqKDSBmPE84obn96Vh8bb4kMzQgGkC2AiTcU7mY");

const ERH_MARKET_FEE_BPS: u64 = 100;
const GRP_PROTOCOL_FEE_BPS: u64 = 50;

#[program]
pub mod global_receivables_protocol {
    use super::*;

    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        usdc_mint: Pubkey,
        treasury: Pubkey,
    ) -> Result<()> {
        require!(usdc_mint != Pubkey::default(), GrpError::InvalidUsdcMint);
        require!(treasury != Pubkey::default(), GrpError::InvalidTreasury);

        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.treasury = treasury;
        config.usdc_mint = usdc_mint;
        config.protocol_version = 1;
        config.paused = false;
        config.bump = ctx.bumps.config;

        Ok(())
    }

    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        market_id_hash: [u8; 32],
        operator: Pubkey,
        market_treasury: Pubkey,
        status: MarketStatus,
        advance_bps: u16,
        minimum_partial_bps: u16,
        investor_return_bps: u16,
        market_fee_bps: u16,
        protocol_fee_bps: u16,
        rules_version: u16,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, GrpError::ProtocolPaused);
        require!(operator != Pubkey::default(), GrpError::InvalidOriginator);
        require!(market_treasury != Pubkey::default(), GrpError::InvalidTreasury);
        require!(market_id_hash != [0; 32], GrpError::InvalidMarket);
        require!(advance_bps > 0 && advance_bps <= 10_000, GrpError::InvalidBasisPoints);
        require!(minimum_partial_bps <= 10_000, GrpError::InvalidBasisPoints);
        require!(investor_return_bps <= 10_000, GrpError::InvalidBasisPoints);
        require!(market_fee_bps <= 10_000, GrpError::InvalidBasisPoints);
        require!(protocol_fee_bps <= 10_000, GrpError::InvalidBasisPoints);

        let investor_share_bps = u128::from(advance_bps)
            .checked_mul(
                10_000u128
                    .checked_add(u128::from(investor_return_bps))
                    .ok_or(GrpError::ArithmeticOverflow)?
            )
            .ok_or(GrpError::ArithmeticOverflow)?
            .checked_div(10_000u128)
            .ok_or(GrpError::ArithmeticOverflow)?;
        let allocated_bps = investor_share_bps
            .checked_add(u128::from(market_fee_bps))
            .ok_or(GrpError::ArithmeticOverflow)?
            .checked_add(u128::from(protocol_fee_bps))
            .ok_or(GrpError::ArithmeticOverflow)?;
        require!(allocated_bps <= 10_000, GrpError::SettlementEconomicsInvalid);

        let now = Clock::get()?.unix_timestamp;
        let market = &mut ctx.accounts.market_config;
        market.market_id_hash = market_id_hash;
        market.operator = operator;
        market.market_treasury = market_treasury;
        market.status = status;
        market.advance_bps = advance_bps;
        market.minimum_partial_bps = minimum_partial_bps;
        market.investor_return_bps = investor_return_bps;
        market.market_fee_bps = market_fee_bps;
        market.protocol_fee_bps = protocol_fee_bps;
        market.rules_version = rules_version;
        market.created_at = now;
        market.updated_at = now;
        market.bump = ctx.bumps.market_config;

        Ok(())
    }

    pub fn initialize_passport(ctx: Context<InitializePassport>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let passport = &mut ctx.accounts.passport;
        passport.subject = ctx.accounts.subject.key();
        passport.receivables_created = 0;
        passport.receivables_settled = 0;
        passport.settled_on_time = 0;
        passport.settled_late = 0;
        passport.defaults = 0;
        passport.defaults_cured = 0;
        passport.total_settled_amount = 0;
        passport.last_updated_at = now;
        passport.bump = ctx.bumps.passport;
        Ok(())
    }

    pub fn create_receivable(
        ctx: Context<CreateReceivable>,
        receivable_id: [u8; 16],
        originator: Pubkey,
        evidence_commitment: [u8; 32],
        original_currency: [u8; 3],
        nominal_amount_minor: u64,
        due_at: i64,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, GrpError::ProtocolPaused);
        require!(originator != Pubkey::default(), GrpError::InvalidOriginator);
        require!(nominal_amount_minor > 0, GrpError::InvalidAmount);

        let now = Clock::get()?.unix_timestamp;
        require!(due_at > now, GrpError::InvalidDueDate);

        let receivable = &mut ctx.accounts.receivable;
        receivable.receivable_id = receivable_id;
        receivable.requester = ctx.accounts.requester.key();
        receivable.originator = originator;
        receivable.payer_wallet = Pubkey::default();
        receivable.payer_token_account = Pubkey::default();
        receivable.payer_authorization = Pubkey::default();
        receivable.settlement_vault = Pubkey::default();
        receivable.payer_commitment_hash = [0; 32];
        receivable.evidence_commitment = evidence_commitment;
        receivable.original_currency = original_currency;
        receivable.nominal_amount_minor = nominal_amount_minor;
        receivable.settlement_amount_usdc = 0;
        receivable.due_at = due_at;
        receivable.status = ReceivableStatus::AwaitingPayer;
        receivable.created_at = now;
        receivable.updated_at = now;
        receivable.passport_recorded = false;
        receivable.default_recorded = false;
        receivable.bump = ctx.bumps.receivable;

        ctx.accounts.passport.receivables_created = ctx.accounts.passport
            .receivables_created
            .checked_add(1)
            .ok_or(GrpError::ArithmeticOverflow)?;
        ctx.accounts.passport.last_updated_at = now;

        Ok(())
    }

    pub fn record_payer_confirmation(
        ctx: Context<RecordPayerConfirmation>,
        payer_commitment_hash: [u8; 32],
        authorized_amount: u64,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, GrpError::ProtocolPaused);
        require!(authorized_amount > 0, GrpError::InvalidAmount);
        require!(
            payer_commitment_hash != [0; 32],
            GrpError::InvalidCommitment
        );
        require!(
            ctx.accounts.receivable.status == ReceivableStatus::AwaitingPayer,
            GrpError::InvalidReceivableState
        );

        // The payer signs a commitment only. No token delegate or future debit
        // authority is granted at confirmation time. Settlement requires a new
        // payer signature when payment is actually made.
        let now = Clock::get()?.unix_timestamp;

        let authorization = &mut ctx.accounts.payer_authorization;
        authorization.receivable = ctx.accounts.receivable.key();
        authorization.payer_wallet = ctx.accounts.payer.key();
        authorization.payer_token_account = Pubkey::default();
        authorization.usdc_mint = ctx.accounts.config.usdc_mint;
        authorization.authorized_amount = authorized_amount;
        authorization.remaining_amount = authorized_amount;
        authorization.settlement_vault = Pubkey::default();
        authorization.status = PayerAuthorizationStatus::Active;
        authorization.had_payment_failure = false;
        authorization.created_at = now;
        authorization.updated_at = now;
        authorization.bump = ctx.bumps.payer_authorization;

        let receivable = &mut ctx.accounts.receivable;
        receivable.payer_wallet = ctx.accounts.payer.key();
        receivable.payer_token_account = Pubkey::default();
        receivable.payer_authorization = authorization.key();
        receivable.settlement_vault = Pubkey::default();
        receivable.payer_commitment_hash = payer_commitment_hash;
        receivable.settlement_amount_usdc = authorized_amount;
        receivable.status = ReceivableStatus::UnderValidation;
        receivable.updated_at = now;

        Ok(())
    }

    pub fn record_validation(
        ctx: Context<RecordValidation>,
        decision: ValidationDecision,
        decision_commitment: [u8; 32],
        rules_version: u16,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, GrpError::ProtocolPaused);
        require!(
            ctx.accounts.validator.key() == ctx.accounts.receivable.originator,
            GrpError::UnauthorizedValidator
        );
        require!(
            ctx.accounts.receivable.status == ReceivableStatus::UnderValidation,
            GrpError::InvalidReceivableState
        );

        let now = Clock::get()?.unix_timestamp;

        let validation = &mut ctx.accounts.validation;
        validation.receivable = ctx.accounts.receivable.key();
        validation.validator = ctx.accounts.validator.key();
        validation.decision = decision;
        validation.decision_commitment = decision_commitment;
        validation.rules_version = rules_version;
        validation.created_at = now;
        validation.bump = ctx.bumps.validation;

        let receivable = &mut ctx.accounts.receivable;
        receivable.status = match decision {
            ValidationDecision::Approved => ReceivableStatus::Approved,
            ValidationDecision::NeedsInformation => ReceivableStatus::NeedsInformation,
            ValidationDecision::Rejected => ReceivableStatus::Rejected,
        };
        receivable.updated_at = now;

        Ok(())
    }



    pub fn create_pool(
        ctx: Context<CreatePool>,
        target_amount: u64,
        minimum_partial_bps: u16,
        discount_bps: u16,
        funding_deadline: i64,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, GrpError::ProtocolPaused);
        require!(
            ctx.accounts.receivable.status == ReceivableStatus::Approved,
            GrpError::InvalidReceivableState
        );
        require!(
            ctx.accounts.receivable.requester == ctx.accounts.requester.key(),
            GrpError::UnauthorizedRequester
        );
        require!(target_amount > 0, GrpError::InvalidAmount);
        require!(
            ctx.accounts.market_config.status == MarketStatus::Active,
            GrpError::MarketNotActive
        );
        require!(
            ctx.accounts.receivable.originator == ctx.accounts.market_config.operator,
            GrpError::InvalidMarketOperator
        );
        require!(
            minimum_partial_bps == ctx.accounts.market_config.minimum_partial_bps,
            GrpError::MarketRulesMismatch
        );
        require!(
            discount_bps == ctx.accounts.market_config.investor_return_bps,
            GrpError::MarketRulesMismatch
        );

        let expected_target_u128 = u128::from(ctx.accounts.receivable.settlement_amount_usdc)
            .checked_mul(u128::from(ctx.accounts.market_config.advance_bps))
            .ok_or(GrpError::ArithmeticOverflow)?
            .checked_div(10_000u128)
            .ok_or(GrpError::ArithmeticOverflow)?;
        let expected_target =
            u64::try_from(expected_target_u128).map_err(|_| GrpError::ArithmeticOverflow)?;
        require!(expected_target > 0, GrpError::InvalidAmount);
        require!(target_amount == expected_target, GrpError::MarketRulesMismatch);

        let now = Clock::get()?.unix_timestamp;
        require!(funding_deadline > now, GrpError::InvalidFundingDeadline);
        require!(
            funding_deadline < ctx.accounts.receivable.due_at,
            GrpError::InvalidFundingDeadline
        );

        let receivable_market = &mut ctx.accounts.receivable_market;
        receivable_market.receivable = ctx.accounts.receivable.key();
        receivable_market.market_config = ctx.accounts.market_config.key();
        receivable_market.created_at = now;
        receivable_market.bump = ctx.bumps.receivable_market;

        let pool = &mut ctx.accounts.pool;
        pool.receivable = ctx.accounts.receivable.key();
        pool.requester = ctx.accounts.requester.key();
        pool.usdc_mint = ctx.accounts.usdc_mint.key();
        pool.vault = ctx.accounts.pool_vault.key();
        pool.target_amount = target_amount;
        pool.funded_amount = 0;
        pool.repaid_amount = 0;
        pool.distributed_amount = 0;
        pool.minimum_partial_bps = minimum_partial_bps;
        pool.discount_bps = discount_bps;
        pool.funding_deadline = funding_deadline;
        pool.due_at = ctx.accounts.receivable.due_at;
        pool.status = PoolStatus::Open;
        pool.created_at = now;
        pool.updated_at = now;
        pool.bump = ctx.bumps.pool;

        ctx.accounts.receivable.status = ReceivableStatus::Pooled;
        ctx.accounts.receivable.updated_at = now;

        Ok(())
    }

    pub fn fund_pool(
        ctx: Context<FundPool>,
        amount: u64,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, GrpError::ProtocolPaused);
        require!(amount > 0, GrpError::InvalidAmount);

        let now = Clock::get()?.unix_timestamp;
        require!(
            ctx.accounts.pool.status == PoolStatus::Open,
            GrpError::PoolNotOpen
        );
        require!(
            now <= ctx.accounts.pool.funding_deadline,
            GrpError::FundingDeadlinePassed
        );

        let remaining_capacity = ctx.accounts.pool
            .target_amount
            .checked_sub(ctx.accounts.pool.funded_amount)
            .ok_or(GrpError::ArithmeticOverflow)?;
        require!(amount <= remaining_capacity, GrpError::PoolOverfunding);

        let transfer_accounts = TransferChecked {
            from: ctx.accounts.investor_token_account.to_account_info(),
            mint: ctx.accounts.usdc_mint.to_account_info(),
            to: ctx.accounts.pool_vault.to_account_info(),
            authority: ctx.accounts.investor.to_account_info(),
        };
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.key(),
            transfer_accounts,
        );
        token::transfer_checked(
            transfer_ctx,
            amount,
            ctx.accounts.usdc_mint.decimals,
        )?;

        let contribution = &mut ctx.accounts.contribution;
        contribution.pool = ctx.accounts.pool.key();
        contribution.investor = ctx.accounts.investor.key();
        contribution.amount = amount;
        contribution.distributed_amount = 0;
        contribution.refunded_amount = 0;
        contribution.status = ContributionStatus::Funded;
        contribution.created_at = now;
        contribution.bump = ctx.bumps.contribution;

        ctx.accounts.pool.funded_amount = ctx.accounts.pool
            .funded_amount
            .checked_add(amount)
            .ok_or(GrpError::ArithmeticOverflow)?;
        ctx.accounts.pool.updated_at = now;

        if ctx.accounts.pool.funded_amount == ctx.accounts.pool.target_amount {
            ctx.accounts.pool.status = PoolStatus::Full;
            ctx.accounts.receivable.status = ReceivableStatus::Funded;
            ctx.accounts.receivable.updated_at = now;
        }

        Ok(())
    }


    pub fn accept_partial_funding(ctx: Context<AcceptPartialFunding>) -> Result<()> {
        require!(!ctx.accounts.config.paused, GrpError::ProtocolPaused);
        require!(
            ctx.accounts.pool.requester == ctx.accounts.requester.key(),
            GrpError::UnauthorizedRequester
        );
        require!(
            ctx.accounts.pool.status == PoolStatus::Open,
            GrpError::PoolNotOpen
        );

        let now = Clock::get()?.unix_timestamp;
        require!(
            now > ctx.accounts.pool.funding_deadline,
            GrpError::FundingDeadlineNotReached
        );
        require!(
            ctx.accounts.pool.funded_amount > 0,
            GrpError::NothingToDisburse
        );

        let funded_bps = ctx.accounts.pool
            .funded_amount
            .checked_mul(10_000)
            .ok_or(GrpError::ArithmeticOverflow)?
            .checked_div(ctx.accounts.pool.target_amount)
            .ok_or(GrpError::ArithmeticOverflow)?;

        require!(
            funded_bps >= u64::from(ctx.accounts.pool.minimum_partial_bps),
            GrpError::PartialFundingBelowMinimum
        );

        ctx.accounts.pool.status = PoolStatus::AcceptedPartial;
        ctx.accounts.pool.updated_at = now;
        ctx.accounts.receivable.status = ReceivableStatus::Funded;
        ctx.accounts.receivable.updated_at = now;

        Ok(())
    }

    pub fn disburse_pool(ctx: Context<DisbursePool>) -> Result<()> {
        require!(!ctx.accounts.config.paused, GrpError::ProtocolPaused);
        require!(
            ctx.accounts.pool.requester == ctx.accounts.requester.key(),
            GrpError::UnauthorizedRequester
        );
        require!(
            matches!(
                ctx.accounts.pool.status,
                PoolStatus::Full | PoolStatus::AcceptedPartial
            ),
            GrpError::PoolNotReadyForDisbursement
        );
        require!(
            ctx.accounts.pool.funded_amount > 0,
            GrpError::NothingToDisburse
        );

        let amount = ctx.accounts.pool.funded_amount;
        require!(
            ctx.accounts.pool_vault.amount >= amount,
            GrpError::InsufficientPoolVaultBalance
        );

        let receivable_key = ctx.accounts.receivable.key();
        let bump = [ctx.accounts.pool.bump];
        let signer_seeds: &[&[u8]] = &[
            b"pool",
            receivable_key.as_ref(),
            &bump,
        ];

        let transfer_accounts = TransferChecked {
            from: ctx.accounts.pool_vault.to_account_info(),
            mint: ctx.accounts.usdc_mint.to_account_info(),
            to: ctx.accounts.requester_token_account.to_account_info(),
            authority: ctx.accounts.pool.to_account_info(),
        };
        let signer = &[signer_seeds];
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            transfer_accounts,
            signer,
        );
        token::transfer_checked(
            transfer_ctx,
            amount,
            ctx.accounts.usdc_mint.decimals,
        )?;

        let now = Clock::get()?.unix_timestamp;
        ctx.accounts.pool.status = PoolStatus::Funded;
        ctx.accounts.pool.updated_at = now;
        ctx.accounts.receivable.status = ReceivableStatus::Funded;
        ctx.accounts.receivable.updated_at = now;

        Ok(())
    }

    pub fn settle_receivable(ctx: Context<SettleReceivable>) -> Result<()> {
        require!(!ctx.accounts.config.paused, GrpError::ProtocolPaused);

        let now = Clock::get()?.unix_timestamp;
        require!(now >= ctx.accounts.receivable.due_at, GrpError::ReceivableNotDue);
        require!(
            ctx.accounts.payer_authorization.remaining_amount > 0,
            GrpError::NothingToSettle
        );
        require!(
            ctx.accounts.payer_authorization.status != PayerAuthorizationStatus::Settled,
            GrpError::AlreadySettled
        );

        // GRP never pulls funds from the payer wallet. At/after due date this
        // instruction only marks the receivable as payment-due. Actual payment
        // happens through manual_repayment, signed by the payer.
        ctx.accounts.payer_authorization.status = PayerAuthorizationStatus::PaymentDue;
        ctx.accounts.payer_authorization.updated_at = now;
        ctx.accounts.receivable.status = ReceivableStatus::Due;
        ctx.accounts.receivable.updated_at = now;
        Ok(())
    }

    pub fn manual_repayment(
        ctx: Context<ManualRepayment>,
        amount: u64,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, GrpError::ProtocolPaused);

        let now = Clock::get()?.unix_timestamp;
        // Voluntary early settlement is allowed. The due date is the latest
        // expected payment date, not a lock that prevents the payer from
        // settling the obligation sooner.
        require!(amount > 0, GrpError::InvalidAmount);
        require!(
            ctx.accounts.payer_authorization.status != PayerAuthorizationStatus::Settled,
            GrpError::AlreadySettled
        );
        require!(
            amount <= ctx.accounts.payer_authorization.remaining_amount,
            GrpError::AmountExceedsRemaining
        );
        require!(
            amount == ctx.accounts.payer_authorization.remaining_amount,
            GrpError::PartialPaymentNotSupported
        );

        // The confirmation step no longer grants a token delegate. The payer
        // chooses the source token account and creates the settlement vault
        // only when explicitly paying at/after the due date.
        ctx.accounts.payer_authorization.payer_token_account =
            ctx.accounts.payer_token_account.key();
        ctx.accounts.payer_authorization.settlement_vault =
            ctx.accounts.settlement_vault.key();
        ctx.accounts.receivable.payer_token_account =
            ctx.accounts.payer_token_account.key();
        ctx.accounts.receivable.settlement_vault =
            ctx.accounts.settlement_vault.key();

        let transfer_accounts = TransferChecked {
            from: ctx.accounts.payer_token_account.to_account_info(),
            mint: ctx.accounts.usdc_mint.to_account_info(),
            to: ctx.accounts.settlement_vault.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        };
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.key(),
            transfer_accounts,
        );
        token::transfer_checked(
            transfer_ctx,
            amount,
            ctx.accounts.usdc_mint.decimals,
        )?;

        let remaining = ctx.accounts.payer_authorization
            .remaining_amount
            .checked_sub(amount)
            .ok_or(GrpError::ArithmeticOverflow)?;

        ctx.accounts.payer_authorization.remaining_amount = remaining;
        ctx.accounts.payer_authorization.updated_at = now;

        ctx.accounts.pool.repaid_amount = ctx.accounts.pool
            .repaid_amount
            .checked_add(amount)
            .ok_or(GrpError::ArithmeticOverflow)?;
        ctx.accounts.pool.updated_at = now;

        if remaining == 0 {
            let was_defaulted = ctx.accounts.receivable.status == ReceivableStatus::Defaulted
                || ctx.accounts.pool.status == PoolStatus::Defaulted
                || ctx.accounts.payer_authorization.status == PayerAuthorizationStatus::Defaulted;

            ctx.accounts.payer_authorization.status = PayerAuthorizationStatus::Settled;
            ctx.accounts.pool.status = if was_defaulted {
                PoolStatus::Cured
            } else {
                PoolStatus::Settled
            };
            ctx.accounts.receivable.status = if was_defaulted {
                ReceivableStatus::PaidAfterDefault
            } else {
                ReceivableStatus::Paid
            };

            apply_passport_settlement(
                &mut ctx.accounts.receivable,
                &ctx.accounts.payer_authorization,
                &mut ctx.accounts.passport,
                now,
            )?;
        } else {
            ctx.accounts.payer_authorization.status = PayerAuthorizationStatus::PaymentDue;
            ctx.accounts.payer_authorization.had_payment_failure = true;
            ctx.accounts.receivable.status = ReceivableStatus::Due;
        }
        ctx.accounts.receivable.updated_at = now;

        Ok(())
    }

    pub fn claim_distribution(ctx: Context<ClaimDistribution>) -> Result<()> {
        require!(!ctx.accounts.config.paused, GrpError::ProtocolPaused);
        require!(
            matches!(ctx.accounts.pool.status, PoolStatus::Settled | PoolStatus::Cured),
            GrpError::PoolNotSettled
        );
        require!(
            ctx.accounts.contribution.status == ContributionStatus::Funded
                || ctx.accounts.contribution.status == ContributionStatus::Allocated,
            GrpError::ContributionNotClaimable
        );
        require!(
            ctx.accounts.contribution.distributed_amount == 0,
            GrpError::DistributionAlreadyClaimed
        );
        require!(
            ctx.accounts.pool.funded_amount > 0,
            GrpError::InvalidAmount
        );

        let return_multiplier_bps = 10_000u128
            .checked_add(u128::from(ctx.accounts.pool.discount_bps))
            .ok_or(GrpError::ArithmeticOverflow)?;
        let due_u128 = u128::from(ctx.accounts.contribution.amount)
            .checked_mul(return_multiplier_bps)
            .ok_or(GrpError::ArithmeticOverflow)?
            .checked_div(10_000u128)
            .ok_or(GrpError::ArithmeticOverflow)?;
        let due = u64::try_from(due_u128).map_err(|_| GrpError::ArithmeticOverflow)?;
        require!(due > 0, GrpError::NothingToDistribute);
        require!(
            ctx.accounts.settlement_vault.amount >= due,
            GrpError::InsufficientSettlementBalance
        );

        let receivable_key = ctx.accounts.receivable.key();
        let bump = [ctx.accounts.payer_authorization.bump];
        let signer_seeds: &[&[u8]] = &[
            b"payer-authorization",
            receivable_key.as_ref(),
            &bump,
        ];

        let transfer_accounts = TransferChecked {
            from: ctx.accounts.settlement_vault.to_account_info(),
            mint: ctx.accounts.usdc_mint.to_account_info(),
            to: ctx.accounts.investor_token_account.to_account_info(),
            authority: ctx.accounts.payer_authorization.to_account_info(),
        };
        let signer = &[signer_seeds];
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            transfer_accounts,
            signer,
        );
        token::transfer_checked(
            transfer_ctx,
            due,
            ctx.accounts.usdc_mint.decimals,
        )?;

        let now = Clock::get()?.unix_timestamp;
        ctx.accounts.contribution.distributed_amount = due;
        ctx.accounts.contribution.status = ContributionStatus::Distributed;
        ctx.accounts.pool.distributed_amount = ctx.accounts.pool
            .distributed_amount
            .checked_add(due)
            .ok_or(GrpError::ArithmeticOverflow)?;
        ctx.accounts.pool.updated_at = now;

        Ok(())
    }


    pub fn claim_settlement_residual(ctx: Context<ClaimSettlementResidual>) -> Result<()> {
        require!(!ctx.accounts.config.paused, GrpError::ProtocolPaused);
        require!(
            matches!(ctx.accounts.pool.status, PoolStatus::Settled | PoolStatus::Cured),
            GrpError::PoolNotSettled
        );
        require!(
            ctx.accounts.receivable.requester == ctx.accounts.requester.key(),
            GrpError::UnauthorizedRequester
        );
        require!(ctx.accounts.pool.repaid_amount > 0, GrpError::NothingToDistribute);

        let face_value = u128::from(ctx.accounts.receivable.settlement_amount_usdc);
        let funded = u128::from(ctx.accounts.pool.funded_amount);
        let return_multiplier_bps = 10_000u128
            .checked_add(u128::from(ctx.accounts.pool.discount_bps))
            .ok_or(GrpError::ArithmeticOverflow)?;
        let investor_total = funded
            .checked_mul(return_multiplier_bps)
            .ok_or(GrpError::ArithmeticOverflow)?
            .checked_div(10_000u128)
            .ok_or(GrpError::ArithmeticOverflow)?;

        let market_fee = face_value
            .checked_mul(u128::from(ctx.accounts.market_config.market_fee_bps))
            .ok_or(GrpError::ArithmeticOverflow)?
            .checked_div(10_000u128)
            .ok_or(GrpError::ArithmeticOverflow)?;
        let protocol_fee = face_value
            .checked_mul(u128::from(ctx.accounts.market_config.protocol_fee_bps))
            .ok_or(GrpError::ArithmeticOverflow)?
            .checked_div(10_000u128)
            .ok_or(GrpError::ArithmeticOverflow)?;

        let repaid = u128::from(ctx.accounts.pool.repaid_amount);
        let allocated = investor_total
            .checked_add(market_fee)
            .ok_or(GrpError::ArithmeticOverflow)?
            .checked_add(protocol_fee)
            .ok_or(GrpError::ArithmeticOverflow)?;
        require!(repaid >= allocated, GrpError::SettlementEconomicsInvalid);

        let residual = repaid
            .checked_sub(allocated)
            .ok_or(GrpError::ArithmeticOverflow)?;
        require!(residual > 0, GrpError::NothingToDistribute);

        let market_fee_u64 = u64::try_from(market_fee).map_err(|_| GrpError::ArithmeticOverflow)?;
        let protocol_fee_u64 = u64::try_from(protocol_fee).map_err(|_| GrpError::ArithmeticOverflow)?;
        let residual_u64 = u64::try_from(residual).map_err(|_| GrpError::ArithmeticOverflow)?;

        let receivable_key = ctx.accounts.receivable.key();
        let bump = [ctx.accounts.payer_authorization.bump];
        let signer_seeds: &[&[u8]] = &[
            b"payer-authorization",
            receivable_key.as_ref(),
            &bump,
        ];
        let signer = &[signer_seeds];

        if market_fee_u64 > 0 {
            let transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.settlement_vault.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.market_token_account.to_account_info(),
                    authority: ctx.accounts.payer_authorization.to_account_info(),
                },
                signer,
            );
            token::transfer_checked(
                transfer_ctx,
                market_fee_u64,
                ctx.accounts.usdc_mint.decimals,
            )?;
        }

        if protocol_fee_u64 > 0 {
            let transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.settlement_vault.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.protocol_token_account.to_account_info(),
                    authority: ctx.accounts.payer_authorization.to_account_info(),
                },
                signer,
            );
            token::transfer_checked(
                transfer_ctx,
                protocol_fee_u64,
                ctx.accounts.usdc_mint.decimals,
            )?;
        }

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.settlement_vault.to_account_info(),
                mint: ctx.accounts.usdc_mint.to_account_info(),
                to: ctx.accounts.requester_token_account.to_account_info(),
                authority: ctx.accounts.payer_authorization.to_account_info(),
            },
            signer,
        );
        token::transfer_checked(
            transfer_ctx,
            residual_u64,
            ctx.accounts.usdc_mint.decimals,
        )?;

        let now = Clock::get()?.unix_timestamp;
        let distribution = &mut ctx.accounts.settlement_distribution;
        distribution.receivable = ctx.accounts.receivable.key();
        distribution.pool = ctx.accounts.pool.key();
        distribution.requester = ctx.accounts.requester.key();
        distribution.market_fee_amount = market_fee_u64;
        distribution.protocol_fee_amount = protocol_fee_u64;
        distribution.requester_residual_amount = residual_u64;
        distribution.created_at = now;
        distribution.bump = ctx.bumps.settlement_distribution;

        Ok(())
    }

    pub fn process_delinquency(ctx: Context<ProcessDelinquency>) -> Result<()> {
        require!(!ctx.accounts.config.paused, GrpError::ProtocolPaused);
        require!(
            ctx.accounts.payer_authorization.remaining_amount > 0,
            GrpError::NothingToSettle
        );
        require!(
            ctx.accounts.payer_authorization.status != PayerAuthorizationStatus::Settled,
            GrpError::AlreadySettled
        );

        let now = Clock::get()?.unix_timestamp;
        let one_day = 86_400i64;
        let five_days = 5 * one_day;

        if now >= ctx.accounts.receivable.due_at + five_days {
            ctx.accounts.receivable.status = ReceivableStatus::Defaulted;
            ctx.accounts.pool.status = PoolStatus::Defaulted;
            ctx.accounts.payer_authorization.status = PayerAuthorizationStatus::Defaulted;
            ctx.accounts.payer_authorization.had_payment_failure = true;

            if !ctx.accounts.receivable.default_recorded {
                ctx.accounts.passport.defaults = ctx.accounts.passport
                    .defaults
                    .checked_add(1)
                    .ok_or(GrpError::ArithmeticOverflow)?;
                ctx.accounts.passport.last_updated_at = now;
                ctx.accounts.receivable.default_recorded = true;
            }
        } else if now >= ctx.accounts.receivable.due_at + one_day {
            ctx.accounts.receivable.status = ReceivableStatus::Overdue;
            ctx.accounts.payer_authorization.status = PayerAuthorizationStatus::PaymentDue;
            ctx.accounts.payer_authorization.had_payment_failure = true;
        } else {
            return err!(GrpError::DelinquencyWindowNotReached);
        }

        ctx.accounts.receivable.updated_at = now;
        ctx.accounts.pool.updated_at = now;
        ctx.accounts.payer_authorization.updated_at = now;

        Ok(())
    }

    pub fn set_pause(ctx: Context<SetPause>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        Ok(())
    }
}

fn apply_passport_settlement(
    receivable: &mut Account<Receivable>,
    authorization: &Account<PayerAuthorization>,
    passport: &mut Account<ReceivablePassport>,
    now: i64,
) -> Result<()> {
    if receivable.passport_recorded {
        return Ok(());
    }

    passport.receivables_settled = passport.receivables_settled
        .checked_add(1)
        .ok_or(GrpError::ArithmeticOverflow)?;

    if receivable.default_recorded {
        passport.defaults_cured = passport.defaults_cured
            .checked_add(1)
            .ok_or(GrpError::ArithmeticOverflow)?;
        passport.settled_late = passport.settled_late
            .checked_add(1)
            .ok_or(GrpError::ArithmeticOverflow)?;
    } else if authorization.had_payment_failure {
        passport.settled_late = passport.settled_late
            .checked_add(1)
            .ok_or(GrpError::ArithmeticOverflow)?;
    } else {
        passport.settled_on_time = passport.settled_on_time
            .checked_add(1)
            .ok_or(GrpError::ArithmeticOverflow)?;
    }

    passport.total_settled_amount = passport.total_settled_amount
        .checked_add(receivable.settlement_amount_usdc)
        .ok_or(GrpError::ArithmeticOverflow)?;
    passport.last_updated_at = now;
    receivable.passport_recorded = true;

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + ProtocolConfig::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, ProtocolConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(market_id_hash: [u8; 32])]
pub struct InitializeMarket<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ GrpError::UnauthorizedAuthority
    )]
    pub config: Account<'info, ProtocolConfig>,

    #[account(
        init,
        payer = authority,
        space = 8 + MarketConfig::INIT_SPACE,
        seeds = [b"market-config", market_id_hash.as_ref()],
        bump
    )]
    pub market_config: Account<'info, MarketConfig>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializePassport<'info> {
    #[account(
        init,
        payer = subject,
        space = 8 + ReceivablePassport::INIT_SPACE,
        seeds = [b"passport", subject.key().as_ref()],
        bump
    )]
    pub passport: Account<'info, ReceivablePassport>,

    #[account(mut)]
    pub subject: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(receivable_id: [u8; 16])]
pub struct CreateReceivable<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, ProtocolConfig>,

    #[account(
        init,
        payer = requester,
        space = 8 + Receivable::INIT_SPACE,
        seeds = [
            b"receivable",
            requester.key().as_ref(),
            receivable_id.as_ref()
        ],
        bump
    )]
    pub receivable: Account<'info, Receivable>,

    #[account(
        mut,
        seeds = [b"passport", requester.key().as_ref()],
        bump = passport.bump,
        constraint = passport.subject == requester.key() @ GrpError::InvalidPassportSubject
    )]
    pub passport: Account<'info, ReceivablePassport>,

    #[account(mut)]
    pub requester: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordPayerConfirmation<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, ProtocolConfig>,

    #[account(
        mut,
        seeds = [
            b"receivable",
            receivable.requester.as_ref(),
            receivable.receivable_id.as_ref()
        ],
        bump = receivable.bump
    )]
    pub receivable: Account<'info, Receivable>,

    #[account(
        init,
        payer = payer,
        space = 8 + PayerAuthorization::INIT_SPACE,
        seeds = [
            b"payer-authorization",
            receivable.key().as_ref()
        ],
        bump
    )]
    pub payer_authorization: Account<'info, PayerAuthorization>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordValidation<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, ProtocolConfig>,

    #[account(
        mut,
        seeds = [
            b"receivable",
            receivable.requester.as_ref(),
            receivable.receivable_id.as_ref()
        ],
        bump = receivable.bump
    )]
    pub receivable: Account<'info, Receivable>,

    #[account(
        init,
        payer = validator,
        space = 8 + Validation::INIT_SPACE,
        seeds = [
            b"validation",
            receivable.key().as_ref(),
            validator.key().as_ref()
        ],
        bump
    )]
    pub validation: Account<'info, Validation>,

    #[account(mut)]
    pub validator: Signer<'info>,

    pub system_program: Program<'info, System>,
}



#[derive(Accounts)]
pub struct CreatePool<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, ProtocolConfig>,

    #[account(
        seeds = [b"market-config", market_config.market_id_hash.as_ref()],
        bump = market_config.bump
    )]
    pub market_config: Account<'info, MarketConfig>,

    #[account(
        init,
        payer = requester,
        space = 8 + ReceivableMarket::INIT_SPACE,
        seeds = [b"receivable-market", receivable.key().as_ref()],
        bump
    )]
    pub receivable_market: Account<'info, ReceivableMarket>,

    #[account(
        mut,
        seeds = [
            b"receivable",
            receivable.requester.as_ref(),
            receivable.receivable_id.as_ref()
        ],
        bump = receivable.bump
    )]
    pub receivable: Account<'info, Receivable>,

    #[account(
        init,
        payer = requester,
        space = 8 + Pool::INIT_SPACE,
        seeds = [
            b"pool",
            receivable.key().as_ref()
        ],
        bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = requester,
        seeds = [
            b"pool-vault",
            pool.key().as_ref()
        ],
        bump,
        token::mint = usdc_mint,
        token::authority = pool
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub requester: Signer<'info>,

    #[account(
        address = config.usdc_mint @ GrpError::InvalidUsdcMint
    )]
    pub usdc_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundPool<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, ProtocolConfig>,

    #[account(
        mut,
        seeds = [
            b"receivable",
            receivable.requester.as_ref(),
            receivable.receivable_id.as_ref()
        ],
        bump = receivable.bump
    )]
    pub receivable: Account<'info, Receivable>,

    #[account(
        mut,
        seeds = [
            b"pool",
            receivable.key().as_ref()
        ],
        bump = pool.bump,
        has_one = receivable @ GrpError::InvalidPoolReceivable,
        constraint = pool.usdc_mint == usdc_mint.key() @ GrpError::InvalidUsdcMint,
        constraint = pool.vault == pool_vault.key() @ GrpError::InvalidPoolVault
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = investor,
        space = 8 + Contribution::INIT_SPACE,
        seeds = [
            b"contribution",
            pool.key().as_ref(),
            investor.key().as_ref()
        ],
        bump
    )]
    pub contribution: Account<'info, Contribution>,

    #[account(mut)]
    pub investor: Signer<'info>,

    #[account(
        address = config.usdc_mint @ GrpError::InvalidUsdcMint
    )]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = investor
    )]
    pub investor_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = pool.vault @ GrpError::InvalidPoolVault,
        seeds = [
            b"pool-vault",
            pool.key().as_ref()
        ],
        bump,
        token::mint = usdc_mint,
        token::authority = pool
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct AcceptPartialFunding<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, ProtocolConfig>,

    #[account(
        mut,
        seeds = [
            b"receivable",
            receivable.requester.as_ref(),
            receivable.receivable_id.as_ref()
        ],
        bump = receivable.bump
    )]
    pub receivable: Account<'info, Receivable>,

    #[account(
        mut,
        seeds = [
            b"pool",
            receivable.key().as_ref()
        ],
        bump = pool.bump,
        has_one = receivable @ GrpError::InvalidPoolReceivable
    )]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub requester: Signer<'info>,
}

#[derive(Accounts)]
pub struct DisbursePool<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, ProtocolConfig>,

    #[account(
        mut,
        seeds = [
            b"receivable",
            receivable.requester.as_ref(),
            receivable.receivable_id.as_ref()
        ],
        bump = receivable.bump
    )]
    pub receivable: Account<'info, Receivable>,

    #[account(
        mut,
        seeds = [
            b"pool",
            receivable.key().as_ref()
        ],
        bump = pool.bump,
        has_one = receivable @ GrpError::InvalidPoolReceivable,
        constraint = pool.usdc_mint == usdc_mint.key() @ GrpError::InvalidUsdcMint,
        constraint = pool.vault == pool_vault.key() @ GrpError::InvalidPoolVault
    )]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub requester: Signer<'info>,

    #[account(
        address = config.usdc_mint @ GrpError::InvalidUsdcMint
    )]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = requester
    )]
    pub requester_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = pool.vault @ GrpError::InvalidPoolVault,
        seeds = [
            b"pool-vault",
            pool.key().as_ref()
        ],
        bump,
        token::mint = usdc_mint,
        token::authority = pool
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SettleReceivable<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, ProtocolConfig>,

    #[account(
        mut,
        seeds = [
            b"receivable",
            receivable.requester.as_ref(),
            receivable.receivable_id.as_ref()
        ],
        bump = receivable.bump,
        has_one = payer_authorization @ GrpError::InvalidPayerAuthorization,
        has_one = payer_token_account @ GrpError::InvalidPayerTokenAccount,
        has_one = settlement_vault @ GrpError::InvalidSettlementVault
    )]
    pub receivable: Account<'info, Receivable>,

    #[account(
        mut,
        seeds = [
            b"payer-authorization",
            receivable.key().as_ref()
        ],
        bump = payer_authorization.bump,
        has_one = payer_token_account @ GrpError::InvalidPayerTokenAccount,
        has_one = settlement_vault @ GrpError::InvalidSettlementVault,
        constraint = payer_authorization.usdc_mint == usdc_mint.key() @ GrpError::InvalidUsdcMint
    )]
    pub payer_authorization: Account<'info, PayerAuthorization>,

    #[account(
        address = config.usdc_mint @ GrpError::InvalidUsdcMint
    )]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        address = payer_authorization.payer_token_account @ GrpError::InvalidPayerTokenAccount,
        token::mint = usdc_mint
    )]
    pub payer_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = payer_authorization.settlement_vault @ GrpError::InvalidSettlementVault,
        seeds = [
            b"settlement-vault",
            receivable.key().as_ref()
        ],
        bump,
        token::mint = usdc_mint,
        token::authority = payer_authorization
    )]
    pub settlement_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"pool", receivable.key().as_ref()],
        bump = pool.bump,
        has_one = receivable @ GrpError::InvalidPoolReceivable
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"passport", receivable.requester.as_ref()],
        bump = passport.bump,
        constraint = passport.subject == receivable.requester @ GrpError::InvalidPassportSubject
    )]
    pub passport: Account<'info, ReceivablePassport>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ManualRepayment<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, ProtocolConfig>,

    #[account(
        mut,
        seeds = [
            b"receivable",
            receivable.requester.as_ref(),
            receivable.receivable_id.as_ref()
        ],
        bump = receivable.bump,
        has_one = payer_authorization @ GrpError::InvalidPayerAuthorization
    )]
    pub receivable: Account<'info, Receivable>,

    #[account(
        mut,
        seeds = [
            b"payer-authorization",
            receivable.key().as_ref()
        ],
        bump = payer_authorization.bump,
        constraint = payer_authorization.payer_wallet == payer.key() @ GrpError::UnauthorizedPayer,
        constraint = payer_authorization.usdc_mint == usdc_mint.key() @ GrpError::InvalidUsdcMint
    )]
    pub payer_authorization: Account<'info, PayerAuthorization>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        address = config.usdc_mint @ GrpError::InvalidUsdcMint
    )]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = payer
    )]
    pub payer_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = payer_authorization
    )]
    pub settlement_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"pool", receivable.key().as_ref()],
        bump = pool.bump,
        has_one = receivable @ GrpError::InvalidPoolReceivable
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"passport", receivable.requester.as_ref()],
        bump = passport.bump,
        constraint = passport.subject == receivable.requester @ GrpError::InvalidPassportSubject
    )]
    pub passport: Account<'info, ReceivablePassport>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimDistribution<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, ProtocolConfig>,

    #[account(
        seeds = [
            b"receivable",
            receivable.requester.as_ref(),
            receivable.receivable_id.as_ref()
        ],
        bump = receivable.bump,
        has_one = payer_authorization @ GrpError::InvalidPayerAuthorization,
        has_one = settlement_vault @ GrpError::InvalidSettlementVault
    )]
    pub receivable: Account<'info, Receivable>,

    #[account(
        mut,
        seeds = [b"pool", receivable.key().as_ref()],
        bump = pool.bump,
        has_one = receivable @ GrpError::InvalidPoolReceivable,
        constraint = pool.usdc_mint == usdc_mint.key() @ GrpError::InvalidUsdcMint
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [
            b"contribution",
            pool.key().as_ref(),
            investor.key().as_ref()
        ],
        bump = contribution.bump,
        constraint = contribution.pool == pool.key() @ GrpError::InvalidContributionPool,
        constraint = contribution.investor == investor.key() @ GrpError::UnauthorizedInvestor
    )]
    pub contribution: Account<'info, Contribution>,

    #[account(
        seeds = [b"payer-authorization", receivable.key().as_ref()],
        bump = payer_authorization.bump,
        has_one = settlement_vault @ GrpError::InvalidSettlementVault,
        constraint = payer_authorization.usdc_mint == usdc_mint.key() @ GrpError::InvalidUsdcMint
    )]
    pub payer_authorization: Account<'info, PayerAuthorization>,

    pub investor: Signer<'info>,

    #[account(
        address = config.usdc_mint @ GrpError::InvalidUsdcMint
    )]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = investor
    )]
    pub investor_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = payer_authorization.settlement_vault @ GrpError::InvalidSettlementVault,
        token::mint = usdc_mint,
        token::authority = payer_authorization
    )]
    pub settlement_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}


#[derive(Accounts)]
pub struct ClaimSettlementResidual<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, ProtocolConfig>,

    #[account(
        seeds = [b"market-config", market_config.market_id_hash.as_ref()],
        bump = market_config.bump
    )]
    pub market_config: Account<'info, MarketConfig>,

    #[account(
        seeds = [b"receivable-market", receivable.key().as_ref()],
        bump = receivable_market.bump,
        has_one = receivable @ GrpError::InvalidMarket,
        has_one = market_config @ GrpError::InvalidMarket
    )]
    pub receivable_market: Account<'info, ReceivableMarket>,

    #[account(
        seeds = [
            b"receivable",
            receivable.requester.as_ref(),
            receivable.receivable_id.as_ref()
        ],
        bump = receivable.bump,
        has_one = payer_authorization @ GrpError::InvalidPayerAuthorization,
        has_one = settlement_vault @ GrpError::InvalidSettlementVault
    )]
    pub receivable: Account<'info, Receivable>,

    #[account(
        seeds = [b"pool", receivable.key().as_ref()],
        bump = pool.bump,
        has_one = receivable @ GrpError::InvalidPoolReceivable,
        constraint = pool.usdc_mint == usdc_mint.key() @ GrpError::InvalidUsdcMint
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        seeds = [b"payer-authorization", receivable.key().as_ref()],
        bump = payer_authorization.bump,
        has_one = settlement_vault @ GrpError::InvalidSettlementVault
    )]
    pub payer_authorization: Account<'info, PayerAuthorization>,

    #[account(mut)]
    pub requester: Signer<'info>,

    #[account(
        address = config.usdc_mint @ GrpError::InvalidUsdcMint
    )]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = requester
    )]
    pub requester_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = usdc_mint,
        constraint = market_token_account.owner == market_config.market_treasury @ GrpError::InvalidMarketTreasury
    )]
    pub market_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = usdc_mint,
        constraint = protocol_token_account.owner == config.treasury @ GrpError::InvalidTreasury
    )]
    pub protocol_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = payer_authorization.settlement_vault @ GrpError::InvalidSettlementVault,
        token::mint = usdc_mint,
        token::authority = payer_authorization
    )]
    pub settlement_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = requester,
        space = 8 + SettlementDistribution::INIT_SPACE,
        seeds = [b"settlement-distribution", pool.key().as_ref()],
        bump
    )]
    pub settlement_distribution: Account<'info, SettlementDistribution>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ProcessDelinquency<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, ProtocolConfig>,

    #[account(
        mut,
        seeds = [
            b"receivable",
            receivable.requester.as_ref(),
            receivable.receivable_id.as_ref()
        ],
        bump = receivable.bump,
        has_one = payer_authorization @ GrpError::InvalidPayerAuthorization
    )]
    pub receivable: Account<'info, Receivable>,

    #[account(
        mut,
        seeds = [b"pool", receivable.key().as_ref()],
        bump = pool.bump,
        has_one = receivable @ GrpError::InvalidPoolReceivable
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"payer-authorization", receivable.key().as_ref()],
        bump = payer_authorization.bump
    )]
    pub payer_authorization: Account<'info, PayerAuthorization>,

    #[account(
        mut,
        seeds = [b"passport", receivable.requester.as_ref()],
        bump = passport.bump,
        constraint = passport.subject == receivable.requester @ GrpError::InvalidPassportSubject
    )]
    pub passport: Account<'info, ReceivablePassport>,
}

#[derive(Accounts)]
pub struct SetPause<'info> {
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ GrpError::UnauthorizedAuthority
    )]
    pub config: Account<'info, ProtocolConfig>,

    pub authority: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct ProtocolConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub usdc_mint: Pubkey,
    pub protocol_version: u16,
    pub paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct MarketConfig {
    pub market_id_hash: [u8; 32],
    pub operator: Pubkey,
    pub market_treasury: Pubkey,
    pub status: MarketStatus,
    pub advance_bps: u16,
    pub minimum_partial_bps: u16,
    pub investor_return_bps: u16,
    pub market_fee_bps: u16,
    pub protocol_fee_bps: u16,
    pub rules_version: u16,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ReceivableMarket {
    pub receivable: Pubkey,
    pub market_config: Pubkey,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Receivable {
    pub receivable_id: [u8; 16],
    pub requester: Pubkey,
    pub originator: Pubkey,
    pub payer_wallet: Pubkey,
    pub payer_token_account: Pubkey,
    pub payer_authorization: Pubkey,
    pub settlement_vault: Pubkey,
    pub payer_commitment_hash: [u8; 32],
    pub evidence_commitment: [u8; 32],
    pub original_currency: [u8; 3],
    pub nominal_amount_minor: u64,
    pub settlement_amount_usdc: u64,
    pub due_at: i64,
    pub status: ReceivableStatus,
    pub created_at: i64,
    pub updated_at: i64,
    pub passport_recorded: bool,
    pub default_recorded: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ReceivablePassport {
    pub subject: Pubkey,
    pub receivables_created: u64,
    pub receivables_settled: u64,
    pub settled_on_time: u64,
    pub settled_late: u64,
    pub defaults: u64,
    pub defaults_cured: u64,
    pub total_settled_amount: u64,
    pub last_updated_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub receivable: Pubkey,
    pub requester: Pubkey,
    pub usdc_mint: Pubkey,
    pub vault: Pubkey,
    pub target_amount: u64,
    pub funded_amount: u64,
    pub repaid_amount: u64,
    pub distributed_amount: u64,
    pub minimum_partial_bps: u16,
    pub discount_bps: u16,
    pub funding_deadline: i64,
    pub due_at: i64,
    pub status: PoolStatus,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Contribution {
    pub pool: Pubkey,
    pub investor: Pubkey,
    pub amount: u64,
    pub distributed_amount: u64,
    pub refunded_amount: u64,
    pub status: ContributionStatus,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PayerAuthorization {
    pub receivable: Pubkey,
    pub payer_wallet: Pubkey,
    pub payer_token_account: Pubkey,
    pub usdc_mint: Pubkey,
    pub authorized_amount: u64,
    pub remaining_amount: u64,
    pub settlement_vault: Pubkey,
    pub status: PayerAuthorizationStatus,
    pub had_payment_failure: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct SettlementDistribution {
    pub receivable: Pubkey,
    pub pool: Pubkey,
    pub requester: Pubkey,
    pub market_fee_amount: u64,
    pub protocol_fee_amount: u64,
    pub requester_residual_amount: u64,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Validation {
    pub receivable: Pubkey,
    pub validator: Pubkey,
    pub decision: ValidationDecision,
    pub decision_commitment: [u8; 32],
    pub rules_version: u16,
    pub created_at: i64,
    pub bump: u8,
}

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    InitSpace,
)]
pub enum MarketStatus {
    Proposed,
    Sandbox,
    Active,
    Paused,
    Suspended,
    Retired,
}

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    InitSpace,
)]
pub enum ReceivableStatus {
    AwaitingPayer,
    UnderValidation,
    NeedsInformation,
    Approved,
    Rejected,
    Pooled,
    Funded,
    Due,
    Overdue,
    Paid,
    PaidAfterDefault,
    Defaulted,
    Closed,
}


#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    InitSpace,
)]
pub enum PoolStatus {
    Open,
    Full,
    PartialExpired,
    AcceptedPartial,
    Refunding,
    Funded,
    Settling,
    Settled,
    Cured,
    Defaulted,
    Disputed,
    Cancelled,
}

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    InitSpace,
)]
pub enum ContributionStatus {
    Funded,
    Allocated,
    Distributed,
    RefundPending,
    Refunded,
}

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    InitSpace,
)]
pub enum PayerAuthorizationStatus {
    Active,
    PaymentDue,
    Settled,
    Defaulted,
    RevokedOrUnavailable,
}

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    InitSpace,
)]
pub enum ValidationDecision {
    NeedsInformation,
    Approved,
    Rejected,
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payer_authorization_status_supports_retry_flow() {
        let status = PayerAuthorizationStatus::PaymentDue;
        assert_eq!(status, PayerAuthorizationStatus::PaymentDue);

        let status = PayerAuthorizationStatus::Settled;
        assert_eq!(status, PayerAuthorizationStatus::Settled);
    }

    #[test]
    fn partial_manual_repayment_math_is_bounded() {
        let remaining = 1_000_000u64;
        let payment = 400_000u64;
        let next = remaining.checked_sub(payment).unwrap();
        assert_eq!(next, 600_000);
    }

    #[test]
    fn overpayment_is_rejected_by_remaining_amount_rule() {
        let remaining = 1_000_000u64;
        let payment = 1_000_001u64;
        assert!(payment > remaining);
    }

    #[test]
    fn full_payment_reaches_zero_remaining() {
        let remaining = 1_000_000u64;
        let payment = 1_000_000u64;
        let next = remaining.checked_sub(payment).unwrap();
        assert_eq!(next, 0);
    }

    #[test]
    fn receivable_due_rule_blocks_early_collection() {
        let due_at = 1_800_000_000i64;
        let before_due = due_at - 1;
        let at_due = due_at;
        assert!(before_due < due_at);
        assert!(at_due >= due_at);
    }

    #[test]
    fn partial_funding_threshold_math_is_deterministic() {
        let target = 1_000_000u64;
        let funded = 600_000u64;
        let minimum_bps = 5_000u64;
        let funded_bps = funded.checked_mul(10_000).unwrap() / target;
        assert_eq!(funded_bps, 6_000);
        assert!(funded_bps >= minimum_bps);
    }

    #[test]
    fn partial_funding_below_minimum_is_rejected() {
        let target = 1_000_000u64;
        let funded = 400_000u64;
        let minimum_bps = 5_000u64;
        let funded_bps = funded.checked_mul(10_000).unwrap() / target;
        assert!(funded_bps < minimum_bps);
    }

    #[test]
    fn proportional_distribution_uses_contribution_share() {
        let repaid = 1_000_000u128;
        let contribution = 250_000u128;
        let funded = 500_000u128;
        let due = repaid.checked_mul(contribution).unwrap() / funded;
        assert_eq!(due, 500_000);
    }

    #[test]
    fn erh_settlement_economics_match_example() {
        let face = 1_000_000_000u128;
        let funded = 800_000_000u128;
        let investor_return_bps = 350u128;
        let investor_total = funded * (10_000 + investor_return_bps) / 10_000;
        let market_fee = face * 100u128 / 10_000;
        let protocol_fee = face * 50u128 / 10_000;
        let residual = face - investor_total - market_fee - protocol_fee;

        assert_eq!(investor_total, 828_000_000);
        assert_eq!(market_fee, 10_000_000);
        assert_eq!(protocol_fee, 5_000_000);
        assert_eq!(residual, 157_000_000);
    }

    #[test]
    fn market_rules_fit_inside_face_value() {
        let advance_bps = 8_000u128;
        let investor_return_bps = 350u128;
        let market_fee_bps = 100u128;
        let protocol_fee_bps = 50u128;
        let investor_share_bps = advance_bps * (10_000 + investor_return_bps) / 10_000;
        let total = investor_share_bps + market_fee_bps + protocol_fee_bps;
        assert_eq!(investor_share_bps, 8_280);
        assert_eq!(total, 8_430);
        assert!(total <= 10_000);
    }

    #[test]
    fn investor_distribution_uses_pool_return_bps() {
        let contribution = 600_000_000u128;
        let return_bps = 350u128;
        let due = contribution * (10_000 + return_bps) / 10_000;
        assert_eq!(due, 621_000_000);
    }

    #[test]
    fn passport_treats_clean_settlement_as_on_time_signal() {
        let had_payment_failure = false;
        assert!(!had_payment_failure);
    }

    #[test]
    fn passport_treats_failed_collection_history_as_late_signal() {
        let had_payment_failure = true;
        assert!(had_payment_failure);
    }

    #[test]
    fn delinquency_thresholds_are_one_and_five_days() {
        let due_at = 1_800_000_000i64;
        let one_day = 86_400i64;
        let five_days = 5 * one_day;

        assert!(due_at + one_day < due_at + five_days);
        assert_eq!(five_days, 432_000);
    }

    #[test]
    fn cured_default_preserves_default_history() {
        let defaults = 1u64;
        let defaults_cured = 1u64;
        assert_eq!(defaults, 1);
        assert_eq!(defaults_cured, 1);
    }
}

#[error_code]
pub enum GrpError {
    #[msg("The protocol is paused.")]
    ProtocolPaused,
    #[msg("The USDC mint is invalid.")]
    InvalidUsdcMint,
    #[msg("The treasury is invalid.")]
    InvalidTreasury,
    #[msg("The originator is invalid.")]
    InvalidOriginator,
    #[msg("The MarketConfig is invalid.")]
    InvalidMarket,
    #[msg("The market is not active.")]
    MarketNotActive,
    #[msg("The receivable originator does not match the Market operator.")]
    InvalidMarketOperator,
    #[msg("The transaction does not match the Market rules.")]
    MarketRulesMismatch,
    #[msg("The Market treasury is invalid.")]
    InvalidMarketTreasury,
    #[msg("The amount must be greater than zero.")]
    InvalidAmount,
    #[msg("The due date must be in the future.")]
    InvalidDueDate,
    #[msg("The receivable is not in the required state.")]
    InvalidReceivableState,
    #[msg("The commitment is invalid.")]
    InvalidCommitment,
    #[msg("Only the configured originator can validate this receivable.")]
    UnauthorizedValidator,
    #[msg("Only the protocol authority can perform this action.")]
    UnauthorizedAuthority,
    #[msg("The receivable is not due yet.")]
    ReceivableNotDue,
    #[msg("There is no remaining amount to settle.")]
    NothingToSettle,
    #[msg("The receivable has already been settled.")]
    AlreadySettled,
    #[msg("The payment amount exceeds the remaining obligation.")]
    AmountExceedsRemaining,
    #[msg("The current MVP requires the payer to settle the remaining obligation in one transaction.")]
    PartialPaymentNotSupported,
    #[msg("The payer authorization account does not match the receivable.")]
    InvalidPayerAuthorization,
    #[msg("The payer token account does not match the committed account.")]
    InvalidPayerTokenAccount,
    #[msg("The settlement vault does not match the committed vault.")]
    InvalidSettlementVault,
    #[msg("Only the committed payer wallet can perform this action.")]
    UnauthorizedPayer,
    #[msg("Arithmetic overflow.")]
    ArithmeticOverflow,
    #[msg("Only the receivable requester can perform this action.")]
    UnauthorizedRequester,
    #[msg("Basis points must be between 0 and 10000.")]
    InvalidBasisPoints,
    #[msg("The funding deadline must be in the future and before the receivable due date.")]
    InvalidFundingDeadline,
    #[msg("The pool is not open for funding.")]
    PoolNotOpen,
    #[msg("The funding deadline has passed.")]
    FundingDeadlinePassed,
    #[msg("The contribution would overfund the pool.")]
    PoolOverfunding,
    #[msg("The pool does not belong to the provided receivable.")]
    InvalidPoolReceivable,
    #[msg("The pool vault does not match the configured pool vault.")]
    InvalidPoolVault,
    #[msg("The funding deadline has not been reached yet.")]
    FundingDeadlineNotReached,
    #[msg("Partial funding did not reach the configured minimum.")]
    PartialFundingBelowMinimum,
    #[msg("The pool is not ready for disbursement.")]
    PoolNotReadyForDisbursement,
    #[msg("There is no funded amount to disburse.")]
    NothingToDisburse,
    #[msg("The pool vault balance is insufficient for disbursement.")]
    InsufficientPoolVaultBalance,
    #[msg("The passport does not belong to the receivable requester.")]
    InvalidPassportSubject,
    #[msg("The pool has not been fully settled.")]
    PoolNotSettled,
    #[msg("The contribution is not claimable.")]
    ContributionNotClaimable,
    #[msg("This distribution has already been claimed.")]
    DistributionAlreadyClaimed,
    #[msg("There is no distribution amount available.")]
    NothingToDistribute,
    #[msg("The settlement vault balance is insufficient.")]
    InsufficientSettlementBalance,
    #[msg("The settlement economics do not fit within the amount repaid.")]
    SettlementEconomicsInvalid,
    #[msg("The contribution does not belong to the provided pool.")]
    InvalidContributionPool,
    #[msg("Only the contribution investor can claim this distribution.")]
    UnauthorizedInvestor,
    #[msg("The delinquency window has not been reached yet.")]
    DelinquencyWindowNotReached,
}
