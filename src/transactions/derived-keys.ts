import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import {
  AuthorizeDerivedKeyRequest,
  AuthorizeDerivedKeyResponse,
  ConstructedTransactionResponse,
  DerivedPrivateUserInfo,
  RequestOptions,
  TransactionSpendingLimitResponse,
  TxRequestWithOptionalFeesAndExtraData
} from "../backend-types";
import { PartialWithRequiredFields } from "../data";
import {
  bs58PublicKeyToCompressedBytes,
  encodeUTF8ToBytes,
  TransactionExtraDataKV,
  TransactionMetadataAuthorizeDerivedKey
} from "../identity";
import { constructBalanceModelTx, handleSignAndSubmit } from "../internal";
import { ConstructedAndSubmittedTx } from "../types";

/**
 * https://docs.deso.org/deso-backend/construct-transactions/derived-keys-transaction-api#authorize-derived-key
 */
export type AuthorizeDerivedKeyRequestParams =
  TxRequestWithOptionalFeesAndExtraData<
    PartialWithRequiredFields<
      AuthorizeDerivedKeyRequest,
      | "OwnerPublicKeyBase58Check"
      | "DerivedPublicKeyBase58Check"
      | "TransactionSpendingLimitHex"
      | "Memo"
      | "ExpirationBlock"
    >
  >;
export const authorizeDerivedKey = (
  params: AuthorizeDerivedKeyRequestParams,
  options?: RequestOptions
): Promise<ConstructedAndSubmittedTx<AuthorizeDerivedKeyResponse>> => {
  return handleSignAndSubmit("api/v0/authorize-derived-key", params, {
    ...options,
    constructionFunction: constructAuthorizeDerivedKey
  });
};

export const constructAuthorizeDerivedKey = (
  params: AuthorizeDerivedKeyRequestParams
): Promise<ConstructedTransactionResponse> => {
  const metadata = new TransactionMetadataAuthorizeDerivedKey();
  metadata.accessSignature = hexToBytes(params.AccessSignature || "");
  metadata.derivedPublicKey = bs58PublicKeyToCompressedBytes(
    params.DerivedPublicKeyBase58Check
  );
  metadata.expirationBlock = params.ExpirationBlock;
  metadata.operationType = params.DeleteKey ? 0 : 1;
  const consensusExtraDataKVs: TransactionExtraDataKV[] = [];
  if (params.DerivedKeySignature) {
    consensusExtraDataKVs.push(
      new TransactionExtraDataKV(
        encodeUTF8ToBytes("DerivedPublicKey"),
        bs58PublicKeyToCompressedBytes(params.DerivedPublicKeyBase58Check)
      )
    );
  }
  if (params.TransactionSpendingLimitHex) {
    const transactionSpendingLimitBuf = hexToBytes(
      params.TransactionSpendingLimitHex
    );
    if (transactionSpendingLimitBuf.length) {
      consensusExtraDataKVs.push(
        new TransactionExtraDataKV(
          encodeUTF8ToBytes("TransactionSpendingLimit"),
          transactionSpendingLimitBuf
        )
      );
    }
  }
  if (params.Memo || params.AppName) {
    const memo = params.Memo || (params.AppName as string);
    consensusExtraDataKVs.push(
      new TransactionExtraDataKV(
        encodeUTF8ToBytes("DerivedKeyMemo"),
        encodeUTF8ToBytes(bytesToHex(encodeUTF8ToBytes(memo)))
      )
    );
  }
  return constructBalanceModelTx(params.OwnerPublicKeyBase58Check, metadata, {
    ConsensusExtraDataKVs: consensusExtraDataKVs,
    ExtraData: params.ExtraData,
    MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
    TransactionFees: params.TransactionFees
  });
};

export const getDerivedPrivateUser = (
  seedHex: string,
  expirationBlockHeight: number,
  transactionSpendingLimit: TransactionSpendingLimitResponse,
  derivedPublicKeyBase58CheckInput?: string,
): Promise<DerivedPrivateUserInfo | undefined> => {
  // if (!(publicKeyBase58Check in this.getPrivateUsers())) {
  //   return undefined;
  // }

  // const privateUser = this.getPrivateUsers()[publicKeyBase58Check];
  // const network = privateUser.network;
  // const isMetamask = this.isMetamaskAccount(privateUser);

  let derivedSeedHex = "";
  let derivedPublicKeyBuffer: number[];
  let derivedPublicKeyBase58Check: string;
  // let jwt = "";
  // let derivedJwt = "";
  const numDaysBeforeExpiration = expirationDays || 30;

  if (!derivedPublicKeyBase58CheckInput) {
    const derivedKeyData = this.generateDerivedKey(network);
    derivedPublicKeyBase58Check = derivedKeyData.derivedPublicKeyBase58Check;
    derivedSeedHex = this.cryptoService.keychainToSeedHex(
      derivedKeyData.keychain
    );
    derivedPublicKeyBuffer = derivedKeyData.derivedKeyPair
      .getPublic()
      .encode("array", true);

    // Derived keys JWT with the same expiration as the derived key. This is needed for some backend endpoints.
    // derivedJwt = this.signingService.signJWT(
    //   derivedSeedHex,
    //   true,
    //   `${numDaysBeforeExpiration} days`
    // );
  } else {
    // If the user has passed in a derived public key, use that instead.
    // Don't define the derived seed hex (a private key presumably already exists).
    // Don't define the JWT, since we have no private key to sign it with.
    derivedPublicKeyBase58Check = derivedPublicKeyBase58CheckInput;
    derivedPublicKeyBuffer = this.cryptoService.publicKeyToBuffer(
      derivedPublicKeyBase58CheckInput
    );
  }
// Compute the owner-signed JWT with the same expiration as the derived key. This is needed for some backend endpoints.
// In case of the metamask log-in, jwt will be signed by a derived key.
//   jwt = this.signingService.signJWT(
//     seedHex,
//     isMetamask,
//     `${numDaysBeforeExpiration} days`
//   );

// Generate new btc and eth deposit addresses for the derived key.
// const btcDepositAddress = this.cryptoService.keychainToBtcAddress(derivedKeychain, network);
// const ethDepositAddress = this.cryptoService.seedHexToEthAddress(derivedSeedHex);
//   const btcDepositAddress = "Not implemented yet";
//   const ethDepositAddress = "Not implemented yet";

// days * (24 hours / day) * (60 minutes / hour) * (1 block / 5 minutes) = blocks
  const numBlocksBeforeExpiration = (numDaysBeforeExpiration * 24 * 60) / 5;

// By default, we authorize this derived key for 8640 blocks, which is about 30 days.
  const expirationBlock = expirationBlockHeight + numBlocksBeforeExpiration;

  const expirationBlockBuffer = uint64ToBufBigEndian(expirationBlock);

// TODO: There is a small attack surface here. If someone gains control of the
// backendApi node, they can swap a fake value into here, and trick the user
// into giving up control of their key. The solution is to force users to pass
// the transactionSpendingLimitHex directly, but this is a worse developer
// experience. So we trade a little bit of security for developer convenience
// here, and do the conversion in Identity rather than forcing the devs to do it.
  let actualTransactionSpendingLimit: TransactionSpendingLimitResponse;
  if (!transactionSpendingLimit) {
    actualTransactionSpendingLimit = {
      GlobalDESOLimit: 0
    } as TransactionSpendingLimitResponse;
  } else {
    actualTransactionSpendingLimit =
      transactionSpendingLimit as TransactionSpendingLimitResponse;
  }

  let response: GetAccessBytesResponse;
  try {
    response = await backendApiService
      .GetAccessBytes(
        derivedPublicKeyBase58Check,
        expirationBlock,
        actualTransactionSpendingLimit
      )
      .toPromise();
  } catch (e) {
    throw new Error("problem getting spending limit");
  }

  const transactionSpendingLimitHex = response.TransactionSpendingLimitHex;
  let accessBytes: number[] = [
    ...derivedPublicKeyBuffer,
    ...expirationBlockBuffer
  ];
  if (isMetamask) {
    accessBytes = [...Buffer.from(response.AccessBytesHex, "hex")];
  } else {
    const transactionSpendingLimitBytes = response.TransactionSpendingLimitHex
      ? [...new Buffer(response.TransactionSpendingLimitHex, "hex")]
      : [];
    accessBytes.push(...transactionSpendingLimitBytes);
  }
  const accessBytesHex = Buffer.from(accessBytes).toString("hex");
  const accessHash = sha256.x2(accessBytes);

  let accessSignature: string;
  if (isMetamask) {
    // TODO: if we want to allow generic log-in with derived keys, we should error because a derived key can't produce a
    //  valid access signature. For now, we ignore this because the only derived key log-in is coming through Metamask signup.
    try {
      const { signature } =
        await this.metamaskService.signMessageWithMetamaskAndGetEthAddress(
          accessBytesHex
        );
      // Slice the '0x' prefix from the signature.
      accessSignature = signature.slice(2);
    } catch (e) {
      throw new Error(
        "Something went wrong while producing Metamask signature. Please try again."
      );
    }
  } else {
    accessSignature = this.signingService.signHashes(seedHex, [
      accessHash
    ])[0];
  }
  const {
    messagingPublicKeyBase58Check,
    messagingPrivateKeyHex,
    messagingKeyName,
    messagingKeySignature
  } = await this.getMessagingGroupStandardDerivation(
    publicKeyBase58Check,
    this.globalVars.defaultMessageKeyName
  );
  return {
    derivedSeedHex,
    derivedPublicKeyBase58Check,
    publicKeyBase58Check,
    // btcDepositAddress,
    // ethDepositAddress,
    expirationBlock,
    network,
    accessSignature,
    // jwt,
    // derivedJwt,
    messagingPublicKeyBase58Check,
    messagingPrivateKey: messagingPrivateKeyHex,
    messagingKeyName,
    messagingKeySignature,
    transactionSpendingLimitHex,
    signedUp: this.globalVars.signedUp
  };
};
