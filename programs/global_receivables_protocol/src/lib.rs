use anchor_lang::prelude::*;

declare_id!("5oQkAGMN2pg7iyPLAzni3dCZgAXn2NbakRKzfwgGU9qM");

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
        receivable.payer_commitment_hash = [0; 32];
        receivable.evidence_commitment = evidence_commitment;
        receivable.original_currency = original_currency;
        receivable.nominal_amount_minor = nominal_amount_minor;
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
    ) -> Result<()> {
        require!(!ctx.accounts.config.paused, GrpError::ProtocolPaused);

        let receivable = &mut ctx.accounts.receivable;
        require!(
            receivable.status == ReceivableStatus::AwaitingPayer,
            GrpError::InvalidReceivableState
        );
        require!(
            payer_commitment_hash != [0; 32],
            GrpError::InvalidCommitment
        );

        receivable.payer_wallet = ctx.accounts.payer.key();
        receivable.payer_token_account = ctx.accounts.payer_token_account.key();
        receivable.payer_commitment_hash = payer_commitment_hash;
        receivable.status = ReceivableStatus::UnderValidation;
        receivable.updated_at = Clock::get()?.unix_timestamp;

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

    pub payer: Signer<'info>,

    /// CHECK: In the next implementation cut this becomes a checked USDC token account
    /// and the payer grants the GRP settlement PDA a bounded delegate allowance.
    pub payer_token_account: UncheckedAccount<'info>,
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
    pub payer_commitment_hash: [u8; 32],
    pub evidence_commitment: [u8; 32],
    pub original_currency: [u8; 3],
    pub nominal_amount_minor: u64,
    pub due_at: i64,
    pub status: ReceivableStatus,
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
pub enum ValidationDecision {
    NeedsInformation,
    Approved,
    Rejected,
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
}
