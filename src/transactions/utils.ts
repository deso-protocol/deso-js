import {
  TransactionSpendingLimitResponseOptions,
  identity,
} from '../identity/index.js';

export async function guardTxPermission(
  spendingLimitOptions: TransactionSpendingLimitResponseOptions
) {
  const hasPermissions = identity.hasPermissions(spendingLimitOptions);
  const guard = (hasPermissions: boolean) => {
    if (!hasPermissions) {
      return identity.requestPermissions({
        ...spendingLimitOptions,
        GlobalDESOLimit:
          (identity.transactionSpendingLimitOptions.GlobalDESOLimit ?? 0) +
          (spendingLimitOptions.GlobalDESOLimit ?? 0),
      });
    }
  };

  if (typeof hasPermissions === 'boolean') {
    return guard(hasPermissions);
  } else {
    return (hasPermissions as Promise<boolean>).then(guard);
  }
}

export function stripHexPrefix(hex: string) {
  const unPadded = hex.startsWith('0x') ? hex.slice(2) : hex;

  if (unPadded.length % 2 === 1) {
    return `0${unPadded}`;
  }

  return unPadded;
}
