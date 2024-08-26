use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("GgXwZPKgaWpEAUrmxMrgmnKY7MJf61QsRphTHnPrdSiQ");

// This is a smart contract wallet that can be used to send and receive SOL and SPL tokens
#[program]
pub mod contract_wallet {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }

    pub fn create_wallet(ctx: Context<CreateWallet>) -> Result<()> {
        msg!("Wallet created for: {}", ctx.accounts.user_interface.key());
        Ok(())
    }

    pub fn transfer(ctx: Context<TransferSol>, transfer_amount: u64, refund_amount: u64) -> Result<()> {
        //TODO: Check RBAC
        
        // Transfer
        ctx.accounts.from.sub_lamports(transfer_amount)?;
        ctx.accounts.to.add_lamports(transfer_amount)?;

        // Refund paymaster.
        ctx.accounts.paymaster.add_lamports(refund_amount)?;
        ctx.accounts.from.sub_lamports(refund_amount)?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct TransferSol<'info> {
    #[account(mut)]
    pub paymaster: Signer<'info>,

    #[account(
        mut,
        seeds = [user_interface.key().as_ref()],
        bump
    )]
    /// CHECK: This is the wallet account (PDA)
    pub from: UncheckedAccount<'info>,

    #[account(mut)]
    /// CHECK: This is the recipient account
    pub to: AccountInfo<'info>,

    #[account(mut)]
    pub user_interface: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Initialize {
}

#[derive(Accounts)]
pub struct CreateWallet<'info> {
    #[account(mut)]
    pub paymaster: Signer<'info>,

    #[account(
        init,
        payer = paymaster,
        space = 8,  // Discriminator
        seeds = [user_interface.key().as_ref()],
        bump
    )]
    /// CHECK: This is the wallet account
    pub wallet: UncheckedAccount<'info>,

    #[account(mut)]
    pub user_interface: Signer<'info>,

    pub system_program: Program<'info, System>,
}