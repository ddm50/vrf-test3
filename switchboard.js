const {Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram} = require( "@solana/web3.js");
const {BorshInstructionCoder, utils, web3} = require( "@project-serum/anchor");
const anchor =require( "@project-serum/anchor");
const idl = require( "../idls/vrf_clien.json")

const sbv2 = require('@switchboard-xyz/switchboard-v2')
const {SwitchboardTestContext, promiseWithTimeout} = require("@switchboard-xyz/sbv2-utils");
const {VrfAccount, OracleQueueAccount} = require("@switchboard-xyz/switchboard-v2");
const {TOKEN_PROGRAM_ID} = require("@project-serum/anchor/dist/cjs/utils/token.js");

/**
 * @param {anchor.Program}  program - Solana Program
 * @param {PublicKey} vrfStateKey
 * @param {PublicKey} vendor
 * @param {PublicKey} player
 * @param {PublicKey} house
 * @returns Promise<{ state: PublicKey, vrf: PublicKey, payer: PublicKey, vendor: PublicKey, player: PublicKey, house: PublicKey, systemProgram: PublicKey }> This is the result
 */


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const RequestRandomnessCoinflip = async (program, provider, vrfStateKey, vendor, player, house, uuid) => {
    var         switchboard = await SwitchboardTestContext.loadDevnetQueue(
        provider,
        undefined,
        5_000_000 // .005 wSOL
    );
    const state = await program.account.vrfClientState.fetch(vrfStateKey);
    const vrfAccount = new sbv2.VrfAccount({
        program: switchboard.program,
        publicKey: state.vrf,
    });
    const vrfState = await vrfAccount.loadData();
    // const queueAccount = new sbv2.OracleQueueAccount({
    //     program: switchboard.program,
    //     publicKey: vrfState.oracleQueue,
    // });
    var queueAccount =  new OracleQueueAccount({ program: switchboard.program, publicKey: new PublicKey("F8ce7MsckeZAbAGmxjJNetxYXQa9mKr9nnrC3qKubyYy") });

    const queueState = await queueAccount.loadData();
    const [permissionAccount, permissionBump] = sbv2.PermissionAccount.fromSeed(
        switchboard.program,
        queueState.authority,
        queueAccount.publicKey,
        vrfAccount.publicKey
    );
    const [programStateAccount, switchboardStateBump] =
        sbv2.ProgramStateAccount.fromSeed(switchboard.program);

    console.log('sleep')
    await sleep(70000);
    console.log('run')

    const request_signature = await program.methods
        .play({
            switchboardStateBump,
            permissionBump,
        })
        .accounts({
            state: vrfStateKey,
            vrf: vrfAccount.publicKey,
            oracleQueue: queueAccount.publicKey,
            queueAuthority: queueState.authority,
            dataBuffer: queueState.dataBuffer,
            permission: permissionAccount.publicKey.toString(),
            escrow: vrfState.escrow,
            programState: programStateAccount.publicKey,
            switchboardProgram: switchboard.program.programId,
            payerWallet: switchboard.payerTokenWallet,
            payerAuthority: vendor,
            recentBlockhashes: anchor.web3.SYSVAR_RECENT_BLOCKHASHES_PUBKEY,
            tokenProgram: TOKEN_PROGRAM_ID,
            player: player,
            vendor: vendor,
            house: house,
            uuid
        })
        .rpc();

    console.log(`request_randomness transaction signature: ${request_signature}`);
   // console.log("VRF STATE: ", vrfState)

    const result = await awaitCallback(program, provider, vrfStateKey, 60_000).catch(err => {
        console.log('here comes the errorrr', err)
    });
    console.log(`VrfClient Result: ${result}`);
}
/**
 * @param {anchor.Program}  program - Solana Program
 * @param provider
 * @param {Wallet} payer
 * @param {PublicKey} player
 * @returns Promise<{ state: PublicKey, vrf: PublicKey, payer: PublicKey, vendor: PublicKey, player: PublicKey, house: PublicKey, systemProgram: PublicKey }> This is the result
 */

const GetVRFDetailsCoinflip = async (program, provider, payer, player) => {
    const vrfKeypair = web3.Keypair.generate();
    const uuidKeypair  = Keypair.generate().publicKey;
    var         switchboard = await SwitchboardTestContext.loadDevnetQueue(
        provider,
        undefined,
        5_000_000 // .005 wSOL
        );


    var queue =  new OracleQueueAccount({ program: switchboard.program, publicKey: new PublicKey("F8ce7MsckeZAbAGmxjJNetxYXQa9mKr9nnrC3qKubyYy") });
    console.log("SB: ", queue.publicKey.toString())



    /**
     * VRF Public Key
     * @type {PublicKey}
     */
    let vrfClientKey;

    /**
     * Bump
     * @type {number}
     */
    let vrfClientBump;


    [vrfClientKey, vrfClientBump] = utils.publicKey.findProgramAddressSync(
        [Buffer.from("CLIENTSEED"), vrfKeypair.publicKey.toBytes()],
        program.programId
    );

    var coinflipPDA, coinflipPDABump;
    [coinflipPDA, coinflipPDABump] = utils.publicKey.findProgramAddressSync(
        [Buffer.from("coinflip"), player.toBuffer()],
        program.programId
    );

    const { unpermissionedVrfEnabled, authority, dataBuffer } =
        await switchboard.queue.loadData().catch(err => {
            console.log()
        });



    // @ts-ignore
    const vrfAccount = await VrfAccount.create(switchboard.program, {
        keypair: vrfKeypair,
        authority: vrfClientKey,
         queue: new OracleQueueAccount({ program: switchboard.program, publicKey: new PublicKey("F8ce7MsckeZAbAGmxjJNetxYXQa9mKr9nnrC3qKubyYy") }),
        callback: {
            programId: program.programId,
            signers: [payer],
            accounts: [
                { pubkey: coinflipPDA, isSigner: false, isWritable: true },
                { pubkey: payer.publicKey, isSigner: true, isWritable: true },
                { pubkey: player, isSigner: false, isWritable: true },
                { pubkey: vrfClientKey, isSigner: false, isWritable: true },
                { pubkey: vrfKeypair.publicKey, isSigner: false, isWritable: false },
                {pubkey: SystemProgram.programId, isSigner: false, isWritable: false}
            ],
            ixData: new BorshInstructionCoder(program.idl).encode(
                "consumeResult",
                ""),
        },
    }).catch(err =>{
        console.log(err)
        return false;

    });

    //if (!vrfAccount) return false;
    console.log(`Created VRF Account: ${vrfAccount.publicKey}`);


    // @ts-ignore
    const permissionAccount = await sbv2.PermissionAccount.create(
        switchboard.program,
        {
            authority,
            granter: switchboard.queue.publicKey,
            grantee: vrfAccount.publicKey,
        }
    );
    console.log(`Created Permission Account: ${permissionAccount.publicKey}`);
    if (!unpermissionedVrfEnabled) {
        if (!payer.publicKey.equals(authority)) {
            throw new Error(
                `queue requires PERMIT_VRF_REQUESTS and wrong queue authority provided`
            );
        }

        await permissionAccount.set({
            authority: payer,
            permission: sbv2.SwitchboardPermission.PERMIT_VRF_REQUESTS,
            enable: true,
        });
        console.log(`Set VRF Permissions`);
    }

    return {
        state: vrfClientKey,
        vrf: vrfAccount.publicKey,
        payer: player,
        vendor: payer.publicKey,
        player: player,
        house: coinflipPDA,
        systemProgram: anchor.web3.SystemProgram.programId,
        uuid: uuidKeypair
    }
}



async function awaitCallback(
    program,
    provider,
    vrfClientKey,
    timeoutInterval,
    errorMsg = "Timed out waiting for VRF Client callback"
) {
    let ws = undefined;
    const result= await promiseWithTimeout(
        timeoutInterval,
        new Promise(
            (
                resolve
            ) => {
                ws = provider.connection.onAccountChange(
                    vrfClientKey,
                    async (
                        accountInfo,
                        context
                    ) => {
                        const clientState =
                            program.account.vrfClientState.coder.accounts.decode(
                                "VrfClientState",
                                accountInfo.data
                            );
                        console.log(clientState)
                        if (clientState.result.gt(new anchor.BN(0))) {
                            resolve(clientState.result);
                        }
                    }
                );
            }
        ).finally(async () => {
            if (ws) {
                await provider.connection.removeAccountChangeListener(ws);
            }
            ws = undefined;
        }),
        new Error(errorMsg)
    ).finally(async () => {
        if (ws) {
            await provider.connection.removeAccountChangeListener(ws);
        }
        ws = undefined;
    }).catch(err => {
        console.log('err: ', err)
    });

    return result;
}

module.exports = {
    GetVRFDetailsCoinflip, RequestRandomnessCoinflip
}
