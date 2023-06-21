import { hexToBytes } from '@noble/hashes/utils';
import {
  AcceptNFTBidRequest,
  AcceptNFTBidResponse,
  AcceptNFTTransferRequest,
  AcceptNFTTransferResponse,
  BurnNFTRequest,
  BurnNFTResponse,
  ConstructedTransactionResponse,
  CreateNFTBidRequest,
  CreateNFTBidResponse,
  CreateNFTRequest,
  CreateNFTResponse,
  TransferNFTRequest,
  TransferNFTResponse,
  TxRequestWithOptionalFeesAndExtraData,
  UpdateNFTRequest,
  UpdateNFTResponse,
} from '../backend-types/index.js';
import { PartialWithRequiredFields } from '../data/index.js';
import {
  TransactionExtraDataKV,
  TransactionMetadataAcceptNFTBid,
  TransactionMetadataAcceptNFTTransfer,
  TransactionMetadataBurnNFT,
  TransactionMetadataCreateNFT,
  TransactionMetadataNFTBid,
  TransactionMetadataNFTTransfer,
  TransactionMetadataUpdateNFT,
  bs58PublicKeyToCompressedBytes,
  concatUint8Arrays,
  encodeUTF8ToBytes,
  uvarint64ToBuf,
} from '../identity/index.js';
import {
  constructBalanceModelTx,
  getTxWithFeeNanos,
  handleSignAndSubmit,
  sumTransactionFees,
} from '../internal.js';
import { ConstructedAndSubmittedTx, TxRequestOptions } from '../types.js';
import { guardTxPermission } from './utils.js';
/**
 * https://docs.deso.org/deso-backend/construct-transactions/nft-transactions-api#create-nft
 */
export type CreateNFTRequestParams = TxRequestWithOptionalFeesAndExtraData<
  PartialWithRequiredFields<
    CreateNFTRequest,
    | 'UpdaterPublicKeyBase58Check'
    | 'NFTPostHashHex'
    | 'NumCopies'
    | 'NFTRoyaltyToCoinBasisPoints'
    | 'NFTRoyaltyToCreatorBasisPoints'
    | 'HasUnlockable'
    | 'IsForSale'
  >
>;

export const createNFT = async (
  params: CreateNFTRequestParams,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<CreateNFTResponse | ConstructedTransactionResponse>
> => {
  const txWithFee = getTxWithFeeNanos(
    params.UpdaterPublicKeyBase58Check,
    buildCreateNFTMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
      ConsensusExtraDataKVs: buildCreateNFTConsensusKVs(params),
    }
  );

  if (options?.checkPermissions !== false) {
    await guardTxPermission({
      GlobalDESOLimit:
        txWithFee.feeNanos + sumTransactionFees(params.TransactionFees),
      TransactionCountLimitMap: {
        CREATE_NFT: options?.txLimitCount ?? 1,
      },
    });
  }

  return handleSignAndSubmit('api/v0/create-nft', params, {
    ...options,
    constructionFunction: constructCreateNFTTransaction,
  });
};

const buildCreateNFTMetadata = (params: CreateNFTRequestParams) => {
  const metadata = new TransactionMetadataCreateNFT();
  metadata.hasUnlockable = params.HasUnlockable;
  metadata.isForSale = params.IsForSale;
  metadata.minBidAmountNanos = params.MinBidAmountNanos || 0;
  metadata.nftPostHash = hexToBytes(params.NFTPostHashHex);
  metadata.nftRoyaltyToCoinBasisPoints = params.NFTRoyaltyToCoinBasisPoints;
  metadata.nftRoyaltyToCreatorBasisPoints =
    params.NFTRoyaltyToCreatorBasisPoints;
  metadata.numCopies = params.NumCopies;

  return metadata;
};

const buildCreateNFTConsensusKVs = (params: CreateNFTRequestParams) => {
  const consensusExtraDataKVs: TransactionExtraDataKV[] = [];
  if (params.IsBuyNow && params.BuyNowPriceNanos !== undefined) {
    consensusExtraDataKVs.push(
      new TransactionExtraDataKV(
        encodeUTF8ToBytes('BuyNowPriceNanos'),
        uvarint64ToBuf(params.BuyNowPriceNanos)
      )
    );
  }
  if (
    params.AdditionalDESORoyaltiesMap &&
    Object.keys(params.AdditionalDESORoyaltiesMap).length
  ) {
    const royaltyMap = params.AdditionalDESORoyaltiesMap;
    let buf = uvarint64ToBuf(Object.keys(royaltyMap).length);
    Object.keys(royaltyMap)
      .sort((a, b) => a.localeCompare(b))
      .forEach((publicKey) => {
        buf = concatUint8Arrays([
          buf,
          bs58PublicKeyToCompressedBytes(publicKey),
          uvarint64ToBuf(royaltyMap[publicKey]),
        ]);
      });
    consensusExtraDataKVs.push(
      new TransactionExtraDataKV(encodeUTF8ToBytes('DESORoyaltiesMap'), buf)
    );
  }
  if (
    params.AdditionalCoinRoyaltiesMap &&
    Object.keys(params.AdditionalCoinRoyaltiesMap).length
  ) {
    const royaltyMap = params.AdditionalCoinRoyaltiesMap;
    let buf = uvarint64ToBuf(Object.keys(royaltyMap).length);
    Object.keys(royaltyMap)
      .sort((a, b) => a.localeCompare(b))
      .forEach((publicKey) => {
        buf = concatUint8Arrays([
          buf,
          bs58PublicKeyToCompressedBytes(publicKey),
          uvarint64ToBuf(royaltyMap[publicKey]),
        ]);
      });
    consensusExtraDataKVs.push(
      new TransactionExtraDataKV(encodeUTF8ToBytes('CoinRoyaltiesMap'), buf)
    );
  }

  return consensusExtraDataKVs;
};

export const constructCreateNFTTransaction = (
  params: CreateNFTRequestParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.UpdaterPublicKeyBase58Check,
    buildCreateNFTMetadata(params),
    {
      ExtraData: params.ExtraData,
      ConsensusExtraDataKVs: buildCreateNFTConsensusKVs(params),
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/nft-transactions-api#update-nft
 */
export type UpdateNFTRequestParams = TxRequestWithOptionalFeesAndExtraData<
  PartialWithRequiredFields<
    UpdateNFTRequest,
    | 'UpdaterPublicKeyBase58Check'
    | 'NFTPostHashHex'
    | 'SerialNumber'
    | 'MinBidAmountNanos'
  >
>;
export const updateNFT = async (
  params: UpdateNFTRequestParams,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<UpdateNFTResponse | ConstructedTransactionResponse>
> => {
  const txWithFee = getTxWithFeeNanos(
    params.UpdaterPublicKeyBase58Check,
    buildUpdateNFTMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
      ConsensusExtraDataKVs: buildUpdateNFTConsensusKVs(params),
    }
  );

  if (options?.checkPermissions !== false) {
    await guardTxPermission({
      GlobalDESOLimit:
        txWithFee.feeNanos + sumTransactionFees(params.TransactionFees),
      TransactionCountLimitMap: {
        UPDATE_NFT: options?.txLimitCount ?? 1,
      },
    });
  }

  return handleSignAndSubmit('api/v0/update-nft', params, {
    ...options,
    constructionFunction: constructUpdateNFTTransaction,
  });
};

const buildUpdateNFTMetadata = (params: UpdateNFTRequestParams) => {
  const metadata = new TransactionMetadataUpdateNFT();
  metadata.isForSale = !!params.IsForSale;
  metadata.minBidAmountNanos = params.MinBidAmountNanos;
  metadata.nftPostHash = hexToBytes(params.NFTPostHashHex);
  metadata.serialNumber = params.SerialNumber;
  return metadata;
};

const buildUpdateNFTConsensusKVs = (params: UpdateNFTRequestParams) => {
  const consensusExtraDataKVs: TransactionExtraDataKV[] = [];
  if (params.IsBuyNow && params.BuyNowPriceNanos !== undefined) {
    consensusExtraDataKVs.push(
      new TransactionExtraDataKV(
        encodeUTF8ToBytes('BuyNowPriceNanos'),
        uvarint64ToBuf(params.BuyNowPriceNanos)
      )
    );
  }
  return consensusExtraDataKVs;
};

export const constructUpdateNFTTransaction = (
  params: UpdateNFTRequestParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.UpdaterPublicKeyBase58Check,
    buildUpdateNFTMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
      ConsensusExtraDataKVs: buildUpdateNFTConsensusKVs(params),
    }
  );
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/nft-transactions-api#create-nft-bid
 */
export type CreateNFTBidRequestParams = TxRequestWithOptionalFeesAndExtraData<
  PartialWithRequiredFields<
    CreateNFTBidRequest,
    | 'BidAmountNanos'
    | 'NFTPostHashHex'
    | 'SerialNumber'
    | 'UpdaterPublicKeyBase58Check'
  >
>;
export const createNFTBid = async (
  params: CreateNFTBidRequestParams,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<
    CreateNFTBidResponse | ConstructedTransactionResponse
  >
> => {
  const txWithFee = getTxWithFeeNanos(
    params.UpdaterPublicKeyBase58Check,
    buildCreateNFTBidMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );

  if (options?.checkPermissions !== false) {
    await guardTxPermission({
      GlobalDESOLimit:
        params.BidAmountNanos +
        txWithFee.feeNanos +
        sumTransactionFees(params.TransactionFees),
      NFTOperationLimitMap: {
        [params.NFTPostHashHex]: {
          [params.SerialNumber]: {
            nft_bid: options?.txLimitCount ?? 1,
          },
        },
      },
    });
  }

  return handleSignAndSubmit('api/v0/create-nft-bid', params, {
    ...options,
    constructionFunction: constructNFTBidTransaction,
  });
};

const buildCreateNFTBidMetadata = (params: CreateNFTBidRequestParams) => {
  const metadata = new TransactionMetadataNFTBid();
  metadata.bidAmountNanos = params.BidAmountNanos;
  metadata.nftPostHash = hexToBytes(params.NFTPostHashHex);
  metadata.serialNumber = params.SerialNumber;

  return metadata;
};

export const constructNFTBidTransaction = (
  params: CreateNFTBidRequestParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.UpdaterPublicKeyBase58Check,
    buildCreateNFTBidMetadata(params),
    {
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      ExtraData: params.ExtraData,
      TransactionFees: params.TransactionFees,
    }
  );
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/nft-transactions-api#accept-nft-bid
 */
export type AcceptNFTBidRequestParams = TxRequestWithOptionalFeesAndExtraData<
  PartialWithRequiredFields<
    AcceptNFTBidRequest,
    | 'BidAmountNanos'
    | 'NFTPostHashHex'
    | 'SerialNumber'
    | 'UpdaterPublicKeyBase58Check'
    | 'BidderPublicKeyBase58Check'
  >
>;
export const acceptNFTBid = async (
  params: AcceptNFTBidRequestParams,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<
    AcceptNFTBidResponse | ConstructedTransactionResponse
  >
> => {
  const txWithFee = getTxWithFeeNanos(
    params.UpdaterPublicKeyBase58Check,
    buildAcceptNFTBidMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );

  if (options?.checkPermissions !== false) {
    await guardTxPermission({
      GlobalDESOLimit:
        params.BidAmountNanos +
        txWithFee.feeNanos +
        sumTransactionFees(params.TransactionFees),
      NFTOperationLimitMap: {
        [params.NFTPostHashHex]: {
          [params.SerialNumber]: {
            accept_nft_bid: options?.txLimitCount ?? 1,
          },
        },
      },
    });
  }

  return handleSignAndSubmit('api/v0/accept-nft-bid', params, {
    ...options,
    constructionFunction: constructAcceptNFTBidTransaction,
  });
};

const buildAcceptNFTBidMetadata = (params: AcceptNFTBidRequestParams) => {
  const metadata = new TransactionMetadataAcceptNFTBid();
  metadata.bidAmountNanos = params.BidAmountNanos;
  metadata.bidderInputs = [];
  // TODO: this won't work if they've had their identity swapped.
  metadata.bidderPKID = bs58PublicKeyToCompressedBytes(
    params.BidderPublicKeyBase58Check
  );
  metadata.encryptedUnlockableText = hexToBytes(
    params.EncryptedUnlockableText || ''
  );
  metadata.nftPostHash = hexToBytes(params.NFTPostHashHex);
  metadata.serialNumber = params.SerialNumber;

  return metadata;
};

export const constructAcceptNFTBidTransaction = (
  params: AcceptNFTBidRequestParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.UpdaterPublicKeyBase58Check,
    buildAcceptNFTBidMetadata(params),
    {
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      ExtraData: params.ExtraData,
      TransactionFees: params.TransactionFees,
    }
  );
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/nft-transactions-api#transfer-nft
 */
export type TransferNFTRequestParams = TxRequestWithOptionalFeesAndExtraData<
  PartialWithRequiredFields<
    TransferNFTRequest,
    | 'SenderPublicKeyBase58Check'
    | 'ReceiverPublicKeyBase58Check'
    | 'NFTPostHashHex'
    | 'SerialNumber'
  >
>;
export const transferNFT = async (
  params: TransferNFTRequestParams,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<
    TransferNFTResponse | ConstructedTransactionResponse
  >
> => {
  const txWithFee = getTxWithFeeNanos(
    params.SenderPublicKeyBase58Check,
    buildTransferNFTMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );

  if (options?.checkPermissions !== false) {
    await guardTxPermission({
      GlobalDESOLimit:
        txWithFee.feeNanos + sumTransactionFees(params.TransactionFees),
      NFTOperationLimitMap: {
        [params.NFTPostHashHex]: {
          [params.SerialNumber]: {
            transfer: options?.txLimitCount ?? 1,
          },
        },
      },
    });
  }
  return handleSignAndSubmit('api/v0/transfer-nft', params, {
    ...options,
    constructionFunction: constructTransferNFT,
  });
};

const buildTransferNFTMetadata = (params: TransferNFTRequestParams) => {
  const metadata = new TransactionMetadataNFTTransfer();
  metadata.encryptedUnlockableText = hexToBytes(
    params.EncryptedUnlockableText || ''
  );
  metadata.nftPostHash = hexToBytes(params.NFTPostHashHex);
  metadata.receiverPublicKey = bs58PublicKeyToCompressedBytes(
    params.ReceiverPublicKeyBase58Check
  );
  metadata.serialNumber = params.SerialNumber;

  return metadata;
};

export const constructTransferNFT = (
  params: TransferNFTRequestParams
): Promise<ConstructedTransactionResponse | ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.SenderPublicKeyBase58Check,
    buildTransferNFTMetadata(params),
    {
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      ExtraData: params.ExtraData,
      TransactionFees: params.TransactionFees,
    }
  );
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/nft-transactions-api#accept-nft-transfer
 */
export type AcceptNFTTransferRequestParams =
  TxRequestWithOptionalFeesAndExtraData<
    PartialWithRequiredFields<
      AcceptNFTTransferRequest,
      'UpdaterPublicKeyBase58Check' | 'NFTPostHashHex' | 'SerialNumber'
    >
  >;
export const acceptNFTTransfer = async (
  params: AcceptNFTTransferRequestParams,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<
    AcceptNFTTransferResponse | ConstructedTransactionResponse
  >
> => {
  const txWithFee = getTxWithFeeNanos(
    params.UpdaterPublicKeyBase58Check,
    buildAcceptNFTTransferMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );

  if (options?.checkPermissions !== false) {
    await guardTxPermission({
      GlobalDESOLimit:
        txWithFee.feeNanos + sumTransactionFees(params.TransactionFees),
      NFTOperationLimitMap: {
        [params.NFTPostHashHex]: {
          [params.SerialNumber]: {
            accept_nft_transfer: options?.txLimitCount ?? 1,
          },
        },
      },
    });
  }

  return handleSignAndSubmit('api/v0/accept-nft-transfer', params, {
    ...options,
    constructionFunction: constructAcceptNFTTransfer,
  });
};

export const buildAcceptNFTTransferMetadata = (
  params: AcceptNFTTransferRequestParams
) => {
  const metadata = new TransactionMetadataAcceptNFTTransfer();
  metadata.nftPostHash = hexToBytes(params.NFTPostHashHex);
  metadata.serialNumber = params.SerialNumber;

  return metadata;
};

export const constructAcceptNFTTransfer = (
  params: AcceptNFTTransferRequestParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.UpdaterPublicKeyBase58Check,
    buildAcceptNFTTransferMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};

/**
 * https://docs.deso.org/deso-backend/construct-transactions/nft-transactions-api#burn-nft
 */
export type BurnNFTRequestParams = TxRequestWithOptionalFeesAndExtraData<
  PartialWithRequiredFields<
    BurnNFTRequest,
    'UpdaterPublicKeyBase58Check' | 'NFTPostHashHex' | 'SerialNumber'
  >
>;
export const burnNFT = async (
  params: BurnNFTRequestParams,
  options?: TxRequestOptions
): Promise<
  ConstructedAndSubmittedTx<BurnNFTResponse | ConstructedTransactionResponse>
> => {
  const txWithFee = getTxWithFeeNanos(
    params.UpdaterPublicKeyBase58Check,
    buildBurnNFTMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );

  if (options?.checkPermissions !== false) {
    await guardTxPermission({
      GlobalDESOLimit:
        txWithFee.feeNanos + sumTransactionFees(params.TransactionFees),
      NFTOperationLimitMap: {
        [params.NFTPostHashHex]: {
          [params.SerialNumber]: {
            burn: options?.txLimitCount ?? 1,
          },
        },
      },
    });
  }

  return handleSignAndSubmit('api/v0/burn-nft', params, {
    ...options,
    constructionFunction: constructBurnNFTTransation,
  });
};

const buildBurnNFTMetadata = (params: BurnNFTRequestParams) => {
  const metadata = new TransactionMetadataBurnNFT();
  metadata.nftPostHash = hexToBytes(params.NFTPostHashHex);
  metadata.serialNumber = params.SerialNumber;

  return metadata;
};

export const constructBurnNFTTransation = (
  params: BurnNFTRequestParams
): Promise<ConstructedTransactionResponse> => {
  return constructBalanceModelTx(
    params.UpdaterPublicKeyBase58Check,
    buildBurnNFTMetadata(params),
    {
      ExtraData: params.ExtraData,
      MinFeeRateNanosPerKB: params.MinFeeRateNanosPerKB,
      TransactionFees: params.TransactionFees,
    }
  );
};
