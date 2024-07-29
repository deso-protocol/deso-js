import { bytesToHex } from '@noble/hashes/utils';
import {
  ConstructedTransactionResponse,
  DeSoNonce,
  OptionalFeesAndExtraData,
  RequestOptions,
  SubmitTransactionResponse,
  SubmitTransactionAtomicResponse,
  TransactionFee,
  TransactionType,
} from './backend-types/index.js';
import {
  PartialWithRequiredFields,
  api,
  cleanURL,
  getAppState,
} from './data/index.js';
import {
  Transaction,
  TransactionExtraData,
  TransactionExtraDataKV,
  TransactionMetadataAcceptNFTBid,
  TransactionMetadataCreateNFT,
  TransactionMetadataNFTBid,
  TransactionMetadataRecord,
  TransactionMetadataSubmitPost,
  TransactionMetadataUpdateNFT,
  TransactionNonce,
  TransactionOutput,
  TransactionToMsgDeSoTxn,
  bs58PublicKeyToCompressedBytes,
  encodeUTF8ToBytes,
  identity,
  publicKeyToBase58Check,
  sha256X2,
} from './identity/index.js';
////////////////////////////////////////////////////////////////////////////////
// This is all the stuff we don't export to consumers of the library. If
// anything here needs to be exported, it should be moved to another file.
////////////////////////////////////////////////////////////////////////////////

// This can be mutated by the user of the library via the configure function,
// but it's not exported explicitly. Whatever changes are made externally will
// be reflected in the library.
export const globalConfigOptions = {
  MinFeeRateNanosPerKB: 1500,
  LocalConstruction: false,
};

/**
 * Wraps signing and submit to include the configurable fee, and add defaults
 * for optional params.
 *
 * @param endpoint the endpoint for constructing the transaction
 * @param params tx specific params for the endpoint + optional fees and extra data
 * @param options options for the request, including whether to broadcast
 */
export const handleSignAndSubmit = async <T = ConstructedTransactionResponse>(
  endpoint: string,
  params: OptionalFeesAndExtraData & any,
  // we always broadcast by default, but consumers can optionally disable it.
  options: RequestOptions = { broadcast: true }
): Promise<{
  constructedTransactionResponse: T;
  submittedTransactionResponse: SubmitTransactionResponse | null;
}> => {
  const constructedTransactionResponse = await ((options.localConstruction ||
    globalConfigOptions.LocalConstruction) &&
  options.constructionFunction
    ? options.constructionFunction(params)
    : api.post(
        options.nodeURI ? `${cleanURL(options.nodeURI, endpoint)}` : endpoint,
        {
          ...params,
          MinFeeRateNanosPerKB:
            params.MinFeeRateNanosPerKB ??
            globalConfigOptions.MinFeeRateNanosPerKB,
        }
      ));
  if (
    (options.localConstruction || globalConfigOptions.LocalConstruction) &&
    options.constructionFunction
  ) {
    console.log(constructedTransactionResponse);
  }
  const submittedTransactionResponse =
    options.broadcast !== false
      ? await identity.signAndSubmit(constructedTransactionResponse)
      : null;

  return {
    constructedTransactionResponse,
    submittedTransactionResponse,
  };
};

/**
 * Wraps signing and submit to include the configurable fee, and add defaults
 * for optional params.
 *
 * @param endpoint the endpoint for constructing the transaction
 * @param params tx specific params for the endpoint + optional fees and extra data
 * @param options options for the request, including whether to broadcast
 */

// TODO: Note that this function assumes that all the transactions in the atomic have the primary user as a transactor
export const handleSignAndSubmitAtomic = async <
  T = ConstructedTransactionResponse
>(
  endpoint: string,
  params: OptionalFeesAndExtraData & any,
  // we always broadcast by default, but consumers can optionally disable it.
  options: RequestOptions = { broadcast: true }
): Promise<{
  constructedTransactionResponse: T & {
    InnerTransactionHexes: string[];
    TransactionHex: string;
  };
  submittedTransactionResponse: SubmitTransactionAtomicResponse | null;
}> => {
  const constructedTransactionResponse = await ((options.localConstruction ||
    globalConfigOptions.LocalConstruction) &&
  options.constructionFunction
    ? options.constructionFunction(params)
    : api.post(
        options.nodeURI ? `${cleanURL(options.nodeURI, endpoint)}` : endpoint,
        {
          ...params,
          MinFeeRateNanosPerKB:
            params.MinFeeRateNanosPerKB ??
            globalConfigOptions.MinFeeRateNanosPerKB,
        }
      ));
  if (
    (options.localConstruction || globalConfigOptions.LocalConstruction) &&
    options.constructionFunction
  ) {
    console.log(constructedTransactionResponse);
  }
  const submittedTransactionResponse =
    options.broadcast !== false
      ? await identity.signAndSubmitAtomic(constructedTransactionResponse)
      : null;

  return {
    constructedTransactionResponse,
    submittedTransactionResponse,
  };
};

export type BalanceModelTransactionFields = {
  Outputs?: TransactionOutput[];
  ExtraData?: { [k: string]: string };
  ConsensusExtraDataKVs?: TransactionExtraDataKV[];
  MinFeeRateNanosPerKB?: number;
  TransactionFees?: TransactionFee[] | null;
  Nonce?: PartialWithRequiredFields<DeSoNonce, 'ExpirationBlockHeight'>;
};

export const convertExtraData = (
  extraData?: { [k: string]: string },
  consensusExtraDataKVs?: TransactionExtraDataKV[]
): TransactionExtraData => {
  const sortedExtraData = (consensusExtraDataKVs || [])
    .concat(
      Object.entries(extraData || {}).map(
        ([k, v]) =>
          new TransactionExtraDataKV(encodeUTF8ToBytes(k), encodeUTF8ToBytes(v))
      )
    )
    .sort((a, b) => a.key.toString().localeCompare(b.key.toString()));
  const realExtraData = new TransactionExtraData();
  realExtraData.kvs = sortedExtraData;
  return realExtraData;
};

const makeTransactionNonce = (
  desoNonce:
    | PartialWithRequiredFields<DeSoNonce, 'ExpirationBlockHeight'>
    | undefined
): TransactionNonce => {
  const nonce = new TransactionNonce();
  nonce.expirationBlockHeight =
    desoNonce?.ExpirationBlockHeight || Number.MAX_SAFE_INTEGER;
  // TODO: cache partial IDs so we don't generate the same one twice.
  nonce.partialId = desoNonce?.PartialID || Math.floor(Math.random() * 1e18);
  return nonce;
};

export const getTxWithFeeNanos = (
  pubKey: string,
  metadata: TransactionMetadataRecord,
  txFields?: BalanceModelTransactionFields
) => {
  const nonce = makeTransactionNonce(txFields?.Nonce);

  const transactionFeeOutputs = (txFields?.TransactionFees || []).map((tf) => {
    const newOutput = new TransactionOutput();
    newOutput.publicKey = bs58PublicKeyToCompressedBytes(
      tf.PublicKeyBase58Check
    );
    newOutput.amountNanos = tf.AmountNanos;
    return newOutput;
  });
  const transaction = new Transaction({
    version: 1,
    feeNanos: 0,
    nonce,
    metadata,
    outputs: transactionFeeOutputs.concat(txFields?.Outputs || []),
    inputs: [],
    extraData: convertExtraData(
      txFields?.ExtraData,
      txFields?.ConsensusExtraDataKVs
    ),
    publicKey: bs58PublicKeyToCompressedBytes(pubKey),
    signature: new Uint8Array(0),
  });

  return computeFee(
    transaction,
    txFields?.MinFeeRateNanosPerKB ?? globalConfigOptions.MinFeeRateNanosPerKB
  );
};

export const constructBalanceModelTx = async (
  pubKey: string,
  metadata: TransactionMetadataRecord,
  txFields?: BalanceModelTransactionFields
): Promise<ConstructedTransactionResponse> => {
  // TODO: cache block height somewhere.
  if (!txFields?.Nonce) {
    const { BlockHeight } = await getAppState();
    if (!txFields) {
      txFields = {};
    }
    txFields.Nonce = {
      ExpirationBlockHeight: BlockHeight + 275,
    };
  }

  const txnWithFee = getTxWithFeeNanos(pubKey, metadata, txFields);

  const txnBytes = txnWithFee.toBytes();
  const TransactionHex = bytesToHex(txnBytes);

  // TODO: maintain backward compatibility with everything returned in the constructed transaction
  // response object for each type. this will be a headache no doubt.
  const fees = txnWithFee.feeNanos;
  const outputSum = txnWithFee.outputs.reduce((a, b) => a + b.amountNanos, 0);
  // TODO: sum extra spend for creator coins, dao coin limit orders (ugh), create NFTs, create profile
  // NFT buys. Probably not necessarily, but would be best to have this.
  const txnHash = sha256X2(txnBytes);
  const txnType = txnWithFee.getTxnTypeString();
  return {
    Transaction: TransactionToMsgDeSoTxn(txnWithFee),
    FeeNanos: fees,
    TransactionHex,
    ChangeAmountNanos: 0,
    TotalInputNanos: fees + outputSum,
    SpendAmountNanos: fees + outputSum,
    TransactionIDBase58Check: publicKeyToBase58Check(txnHash),
    TxnHashHex: bytesToHex(txnHash),
    PostHashHex:
      txnType === TransactionType.SubmitPost ? bytesToHex(txnHash) : undefined,
    TstampNanos:
      txnType === TransactionType.SubmitPost
        ? (metadata as TransactionMetadataSubmitPost).timestampNanos
        : undefined,
    NFTPostHashHex:
      txnType === TransactionType.CreateNFT ||
      txnType === TransactionType.UpdateNFT ||
      txnType === TransactionType.NFTBid ||
      txnType === TransactionType.AcceptNFTBid
        ? bytesToHex(
            (
              metadata as
                | TransactionMetadataCreateNFT
                | TransactionMetadataUpdateNFT
                | TransactionMetadataNFTBid
                | TransactionMetadataAcceptNFTBid
            ).nftPostHash
          )
        : undefined,
    SerialNumber:
      txnType === TransactionType.UpdateNFT ||
      txnType === TransactionType.NFTBid ||
      txnType === TransactionType.AcceptNFTBid
        ? (
            metadata as
              | TransactionMetadataUpdateNFT
              | TransactionMetadataNFTBid
              | TransactionMetadataAcceptNFTBid
          ).serialNumber
        : undefined,
    UpdaterPublicKeyBase58Check:
      txnType === TransactionType.NFTBid ? pubKey : undefined,
    BidAmountNanos:
      txnType === TransactionType.NFTBid ||
      txnType === TransactionType.AcceptNFTBid
        ? (
            metadata as
              | TransactionMetadataAcceptNFTBid
              | TransactionMetadataNFTBid
          ).bidAmountNanos
        : undefined,
    BidderPublicKeyBase58Check:
      txnType === TransactionType.AcceptNFTBid
        ? publicKeyToBase58Check(
            (metadata as TransactionMetadataAcceptNFTBid).bidderPKID
          )
        : undefined,
  };
};

export const computeFee = (txn: Transaction, feeRate: number): Transaction => {
  if (!feeRate) return txn;
  let prevFee = 0;
  let fee = 0;
  while (prevFee == 0 || prevFee != fee) {
    prevFee = fee;
    const size = computeTxSize(txn) + 71;
    fee = Math.ceil((size * feeRate) / 1000);
    txn.feeNanos = fee;
  }
  return txn;
};

export const computeTxSize = (txn: Transaction): number => {
  return txn.toBytes().length;
};

export const isMaybeDeSoPublicKey = (query: string): boolean => {
  return (
    (query.length === 55 && query.startsWith('BC')) ||
    (query.length === 54 && query.startsWith('tBC'))
  );
};

export const sumTransactionFees = (
  txFees?: TransactionFee[] | null
): number => {
  if (!txFees?.length) return 0;
  return txFees.reduce((acc, curr) => acc + curr.AmountNanos, 0 as number);
};
