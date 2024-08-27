import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { ContractWallet } from "../target/types/contract_wallet";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";

function logTransactionSignature(transactionSignature: string) {
    const cluster = "custom&customUrl=http%3A%2F%2Flocalhost%3A8899";

    console.log(
        `https://explorer.solana.com/tx/${transactionSignature}?cluster=${cluster}`,
    );
}

describe("contract-wallet", async () => {
    // Configure the client to use the local cluster.
    anchor.setProvider(anchor.AnchorProvider.env());

    const program = anchor.workspace.ContractWallet as Program<ContractWallet>;

    const charlie = Keypair.generate();
    const bob = Keypair.generate();
    const paymaster = (program.provider as anchor.AnchorProvider).wallet as anchor.Wallet;

    const [bobWalletPDA, _] = await anchor.web3.PublicKey.findProgramAddress(
        [bob.publicKey.toBuffer()],
        program.programId
    );

    console.log("Program ID:", program.programId.toBase58());
    console.log("Charlie's public key:", charlie.publicKey.toBase58());
    console.log("Bob's public key:", bob.publicKey.toBase58());
    console.log("Paymaster's public key:", paymaster.publicKey.toBase58());
    console.log("Bob's Wallet PDA:", bobWalletPDA.toBase58());

    it("Initializes the program", async () => {
        const tx = await program.methods.initialize().rpc();
        console.log("Program initialized, transaction signature", tx);
        logTransactionSignature(tx); // Log transaction signature
    });

    it("Creates an EOA for Charlie and airdrops 1 SOL", async () => {
        const airdropSignature = await program.provider.connection.requestAirdrop(
            charlie.publicKey,
            LAMPORTS_PER_SOL
        );
        await program.provider.connection.confirmTransaction(airdropSignature);
        console.log("Airdropped 1 SOL to Charlie's EOA", charlie.publicKey.toBase58());
        logTransactionSignature(airdropSignature); // Log transaction signature
    });

    it("Creates a wallet for Bob and airdrops 3 SOL", async () => {
        const tx = await program.methods.createWallet()
            .accounts({
                paymaster: paymaster.publicKey,
                userInterface: bob.publicKey,
            })
            .signers([paymaster.payer, bob])
            .rpc();
        console.log("Created wallet for Bob, transaction signature", tx);
        logTransactionSignature(tx); // Log transaction signature

        const airdropSignature = await program.provider.connection.requestAirdrop(
            bobWalletPDA,
            3 * LAMPORTS_PER_SOL
        );
        await program.provider.connection.confirmTransaction(airdropSignature);
        console.log("Airdropped 3 SOL to Bob's Wallet", bob.publicKey.toBase58());
        logTransactionSignature(airdropSignature); // Log transaction signature
    });

    it("Transfers 1 SOL from Bob's contract wallet to Charlie's EOA. Paymaster gets refunded.", async () => {
    
        const bobPreBalance = await program.provider.connection.getBalance(bobWalletPDA);
        const charliePreBalance = await program.provider.connection.getBalance(charlie.publicKey);
        const paymasterPreBalance = await program.provider.connection.getBalance(paymaster.publicKey);
        const transferAmount = new anchor.BN(LAMPORTS_PER_SOL);
        let refundAmount = new anchor.BN(0);

        {
            const transferTransaction = await program.methods.transfer(transferAmount, refundAmount)
                .accounts({
                    paymaster: paymaster.publicKey,
                    to: charlie.publicKey,
                    userInterface: bob.publicKey,
                })
                .signers([paymaster.payer, bob])
                .transaction();

            const latestBlockhash = await program.provider.connection.getLatestBlockhash();
            transferTransaction.recentBlockhash = latestBlockhash.blockhash;
            transferTransaction.feePayer = paymaster.publicKey;

            const estimatedRefund = await program.provider.connection.getFeeForMessage(
                transferTransaction.compileMessage()
            );


            refundAmount = new anchor.BN(estimatedRefund.value);
        }

        expect(refundAmount.toNumber()).to.be.greaterThan(0);

        const tx = await program.methods.transfer(transferAmount, refundAmount)
            .accounts({
                paymaster: paymaster.publicKey,
                to: charlie.publicKey,
                userInterface: bob.publicKey,
            })
            .signers([paymaster.payer, bob])
            .rpc({
                commitment: "confirmed"
            });

        console.log("Transferred 1 SOL from Bob's wallet to Charlie's EOA, transaction signature", tx);
        logTransactionSignature(tx); // Log transaction signature

        // Get Charlie's balance after the transfer
        const charliePostBalance = await program.provider.connection.getBalance(charlie.publicKey);

        // Calculate the expected balance
        const expectedBalance = charliePreBalance + transferAmount.toNumber();

        // Check if Charlie's balance has increased by the transfer amount
        expect(charliePostBalance).to.equal(expectedBalance);
        console.log(`Charlie's balance increased from ${charliePreBalance} to ${charliePostBalance}`);

        // Check if the paymaster got refunded
        const paymasterPostBalance = await program.provider.connection.getBalance(paymaster.publicKey);
        expect(paymasterPostBalance).to.equal(paymasterPreBalance);

        const bobPostBalance = await program.provider.connection.getBalance(bobWalletPDA);
        expect(bobPostBalance).to.equal(bobPreBalance-transferAmount.toNumber()-refundAmount.toNumber());
    });
});