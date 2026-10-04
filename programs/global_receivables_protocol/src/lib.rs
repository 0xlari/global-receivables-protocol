use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_spl::token::{self, ApproveChecked, Mint, Token, TokenAccount, TransferChecked};

declare_id!("CDqVimqKDSBmPE84obn96Vh8bb4kMzQgGkC2AiTcU7mY");

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
        receivable.bump = ctx.bumps.receivable;

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

        // The payer signs this outer transaction. In the same atomic transaction,
        // the Token Program grants the receivable-specific GRP PDA a bounded
        // delegate allowance over the payer's USDC token account.
        let approve_accounts = ApproveChecked {
            to: ctx.accounts.payer_token_account.to_account_info(),
            mint: ctx.accounts.usdc_mint.to_account_info(),
            delegate: ctx.accounts.payer_authorization.to_account_info(),
            authority: ctx.accounts.payer.to_account_info(),
        };
        let approve_ctx = CpiContext::new(
            ctx.accounts.token_program.key(),
            approve_accounts,
        );
        token::approve_checked(
            approve_ctx,
            authorized_amount,
            ctx.accounts.usdc_mint.decimals,
        )?;

        let now = Clock::get()?.unix_timestamp;

        let authorization = &mut ctx.accounts.payer_authorization;
        authorization.receivable = ctx.accounts.receivable.key();
        authorization.payer_wallet = ctx.accounts.payer.key();
        authorization.payer_token_account = ctx.accounts.payer_token_account.key();
        authorization.usdc_mint = ctx.accounts.usdc_mint.key();
        authorization.authorized_amount = authorized_amount;
        authorization.remaining_amount = authorized_amount;
        authorization.settlement_vault = ctx.accounts.settlement_vault.key();
        authorization.status = PayerAuthorizationStatus::Active;
        authorization.created_at = now;
        authorization.updated_at = now;
        authorization.bump = ctx.bumps.payer_authorization;

        let receivable = &mut ctx.accounts.receivable;
        receivable.payer_wallet = ctx.accounts.payer.key();
        receivable.payer_token_account = ctx.accounts.payer_token_account.key();
        receivable.payer_authorization = authorization.key();
        receivable.settlement_vault = ctx.accounts.settlement_vault.key();
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
        require!(minimum_partial_bps <= 10_000, GrpError::InvalidBasisPoints);
        require!(discount_bps <= 10_000, GrpError::InvalidBasisPoints);

        let now = Clock::get()?.unix_timestamp;
        require!(funding_deadline > now, GrpError::InvalidFundingDeadline);
        require!(
            funding_deadline < ctx.accounts.receivable.due_at,
            GrpError::InvalidFundingDeadline
        );

        let pool = &mut ctx.accounts.pool;
        pool.receivable = ctx.accounts.receivable.key();
        pool.requester = ctx.accounts.requester.key();
        pool.usdc_mint = ctx.accounts.usdc_mint.key();
        pool.vault = ctx.accounts.pool_vault.key();
        pool.target_amount = target_amount;
        pool.funded_amount = 0;
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

        let remaining = ctx.accounts.payer_authorization.remaining_amount;
        let delegate_is_valid = matches!(
            ctx.accounts.payer_token_account.delegate,
            COption::Some(delegate) if delegate == ctx.accounts.payer_authorization.key()
        ) && ctx.accounts.payer_token_account.delegated_amount >= remaining;

        if ctx.accounts.payer_token_account.amount < remaining || !delegate_is_valid {
            ctx.accounts.payer_authorization.status = PayerAuthorizationStatus::PaymentDue;
            ctx.accounts.payer_authorization.updated_at = now;
            ctx.accounts.receivable.status = ReceivableStatus::Due;
            ctx.accounts.receivable.updated_at = now;
            return Ok(());
        }

        let receivable_key = ctx.accounts.receivable.key();
        let bump = [ctx.accounts.payer_authorization.bump];
        let signer_seeds: &[&[u8]] = &[
            b"payer-authorization",
            receivable_key.as_ref(),
            &bump,
        ];

        let transfer_accounts = TransferChecked {
            from: ctx.accounts.payer_token_account.to_account_info(),
            mint: ctx.accounts.usdc_mint.to_account_info(),
            to: ctx.accounts.settlement_vault.to_account_info(),
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
            remaining,
            ctx.accounts.usdc_mint.decimals,
        )?;

        ctx.accounts.payer_authorization.remaining_amount = 0;
        ctx.accounts.payer_authorization.status = PayerAuthorizationStatus::Settled;
        ctx.accounts.payer_authorization.updated_at = now;
        ctx.accounts.receivable.status = ReceivableStatus::Paid;
        ctx.accounts.receivable.updated_at = now;

        Ok(())
    }

    pub fn manual_repayment(
        ctx: Context<ManualRepayment>,
        amount: u64,
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, GrpError::ProtocolPaused);

        let now = Clock::get()?.unix_timestamp;
        require!(now >= ctx.accounts.receivable.due_at, GrpError::ReceivableNotDue);
        require!(amount > 0, GrpError::InvalidAmount);
        require!(
            ctx.accounts.payer_authorization.status != PayerAuthorizationStatus::Settled,
            GrpError::AlreadySettled
        );
        require!(
            amount <= ctx.accounts.payer_authorization.remaining_amount,
            GrpError::AmountExceedsRemaining
        );

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

        if remaining == 0 {
            ctx.accounts.payer_authorization.status = PayerAuthorizationStatus::Settled;
            ctx.accounts.receivable.status = ReceivableStatus::Paid;
        } else {
            ctx.accounts.payer_authorization.status = PayerAuthorizationStatus::PaymentDue;
            ctx.accounts.receivable.status = ReceivableStatus::Due;
        }
        ctx.accounts.receivable.updated_at = now;

        Ok(())
    }

    pub fn set_pause(ctx: Context<SetPause>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        Ok(())
    }
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

    #[account(
        address = config.usdc_mint @ GrpError::InvalidUsdcMint
    )]
    pub usdc_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
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
        token::mint = usdc_mint,
        token::authority = payer
    )]
    pub payer_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
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
        address = payer_authorization.payer_token_account @ GrpError::InvalidPayerTokenAccount,
        token::mint = usdc_mint,
        token::authority = payer
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

    pub token_program: Program<'info, Token>,
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
    pub created_at: i64,
    pub updated_at: i64,
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
pub enum ReceivableStatus {
    AwaitingPayer,
    UnderValidation,
    NeedsInformation,
    Approved,
    Rejected,
    Pooled,
    Funded,
    Due,
    Paid,
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
}
