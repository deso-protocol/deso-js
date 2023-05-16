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
    guard(hasPermissions);
  } else {
    (hasPermissions as Promise<boolean>).then(guard);
  }
}
