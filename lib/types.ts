export type Product = {
  id: string;
  name: string;
  shortName: string;
  category: string;
  price: number;
  accent: string;
  sortOrder: number;
};

export type SaleLine = {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

export type Sale = {
  id: string;
  transactionId: string;
  totalAmount: number;
  cancelled: boolean;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  lines: SaleLine[];
};

export type ProductSalesRow = {
  productId: string;
  productName: string;
  quantity: number;
  amount: number;
};

export type HourlySalesRow = {
  hour: number;
  amount: number;
  transactions: number;
};

export type DashboardData = {
  businessDate: string;
  generatedAt: string;
  summary: {
    netSales: number;
    transactionCount: number;
    cancelledAmount: number;
    cancelledCount: number;
    averageSpend: number;
  };
  sales: Sale[];
  productSales: ProductSalesRow[];
  hourlySales: HourlySalesRow[];
  cancellations: Sale[];
};
