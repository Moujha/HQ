export interface ManagementFeeForCalc {
  id: string;
  commission_due: number;
  status: "projetée" | "due" | "versée" | "annulée";
  already_paid_to_manager: number;
  is_commissionable: boolean;
}

export interface ExpenseForCalc {
  id: string;
  amount: number;
  status: "à_rembourser" | "remboursée";
}

export function computeResteDu(
  fees: ManagementFeeForCalc[],
  expenses: ExpenseForCalc[]
): number {
  const commissionDue = fees
    .filter((f) => f.status === "due")
    .reduce((sum, f) => sum + f.commission_due, 0);

  const ndf = expenses
    .filter((e) => e.status === "à_rembourser")
    .reduce((sum, e) => sum + e.amount, 0);

  const alreadyPaid = fees.reduce((sum, f) => sum + f.already_paid_to_manager, 0);

  return commissionDue + ndf - alreadyPaid;
}

export function computeControlRate(
  fees: ManagementFeeForCalc[],
  totalEncaisse: number
): number {
  if (totalEncaisse === 0) return 0;
  const totalFee = fees.reduce((sum, f) => sum + f.commission_due, 0);
  return totalFee / totalEncaisse;
}
