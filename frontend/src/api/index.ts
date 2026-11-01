import { apiClient } from './client';
import {
  AlertCountOut,
  AlertEvaluationResult,
  AlertSeverity,
  AlertType,
  BatchWithProduct,
  Branch,
  CheckoutRequest,
  Page,
  PaymentListItem,
  PaymentMethod,
  PaymentMethodInfo,
  ProductCreate,
  ProductOut,
  ProductWithStock,
  QuickEntryPayload,
  QuickEntryResponse,
  ReportSummary,
  SaleOut,
  SalePaymentOut,
  SaleStatus,
  SaleSummaryOut,
  SystemAlert,
  TokenResponse,
  User,
  VoidSaleRequest,
  WriteOffPayload,
  WriteOffResponse,
} from '../types';

// ==========================================
// 1. AUTH
// ==========================================
export const authApi = {
  login: async (username: string, password: string): Promise<TokenResponse> => {
    const res = await apiClient.post<TokenResponse>('/auth/login', { username, password });
    return res.data;
  },
  getMe: async (): Promise<User> => {
    const res = await apiClient.get<User>('/auth/me');
    return res.data;
  },
};

// ==========================================
// 2. BRANCHES
// ==========================================
export const branchesApi = {
  list: async (): Promise<Branch[]> => {
    const res = await apiClient.get<Branch[]>('/branches');
    return res.data;
  },
  getById: async (branchId: string): Promise<Branch> => {
    const res = await apiClient.get<Branch>(`/branches/${branchId}`);
    return res.data;
  },
};

// ==========================================
// 3. PRODUCTS
// ==========================================
export const productsApi = {
  search: async (params: {
    branch_id: string;
    q?: string;
    only_in_stock?: boolean;
    include_inactive?: boolean;
    offset?: number;
    limit?: number;
  }): Promise<Page<ProductWithStock>> => {
    const res = await apiClient.get<Page<ProductWithStock>>('/products', { params });
    return res.data;
  },

  getByBarcode: async (barcode: string, branch_id: string): Promise<ProductWithStock> => {
    const res = await apiClient.get<ProductWithStock>(`/products/barcode/${encodeURIComponent(barcode)}`, {
      params: { branch_id },
    });
    return res.data;
  },

  getById: async (productId: string, branch_id: string): Promise<ProductWithStock> => {
    const res = await apiClient.get<ProductWithStock>(`/products/${productId}`, {
      params: { branch_id },
    });
    return res.data;
  },

  create: async (payload: ProductCreate): Promise<ProductOut> => {
    const res = await apiClient.post<ProductOut>('/products', payload);
    return res.data;
  },
};

// ==========================================
// 4. BATCHES (Inventario por lotes)
// ==========================================
export const batchesApi = {
  quickEntry: async (payload: QuickEntryPayload): Promise<QuickEntryResponse> => {
    const res = await apiClient.post<QuickEntryResponse>('/batches/quick-entry', payload);
    return res.data;
  },

  list: async (params: {
    branch_id: string;
    product_id?: string;
    only_available?: boolean;
    expiring_within_days?: number;
    offset?: number;
    limit?: number;
  }): Promise<Page<BatchWithProduct>> => {
    const res = await apiClient.get<Page<BatchWithProduct>>('/batches', { params });
    return res.data;
  },

  writeOff: async (batchId: string, payload: WriteOffPayload): Promise<WriteOffResponse> => {
    const res = await apiClient.post<WriteOffResponse>(`/batches/${batchId}/write-off`, payload);
    return res.data;
  },
};

// ==========================================
// 5. SALES (Checkout FEFO y comprobantes)
// ==========================================
export const salesApi = {
  checkout: async (payload: CheckoutRequest): Promise<SaleOut> => {
    const res = await apiClient.post<SaleOut>('/sales/checkout', payload);
    return res.data;
  },

  list: async (params: {
    branch_id?: string;
    user_id?: string;
    date_from?: string;
    date_to?: string;
    status?: SaleStatus;
    offset?: number;
    limit?: number;
  }): Promise<Page<SaleSummaryOut>> => {
    const res = await apiClient.get<Page<SaleSummaryOut>>('/sales', { params });
    return res.data;
  },

  getById: async (saleId: string): Promise<SaleOut> => {
    const res = await apiClient.get<SaleOut>(`/sales/${saleId}`);
    return res.data;
  },

  voidSale: async (saleId: string, payload: VoidSaleRequest): Promise<SaleOut> => {
    const res = await apiClient.post<SaleOut>(`/sales/${saleId}/void`, payload);
    return res.data;
  },
};

// ==========================================
// 6. PAYMENTS
// ==========================================
export const paymentsApi = {
  getMethods: async (): Promise<PaymentMethodInfo[]> => {
    const res = await apiClient.get<PaymentMethodInfo[]>('/payments/methods');
    return res.data;
  },

  list: async (params: {
    branch_id?: string;
    payment_method?: PaymentMethod;
    date_from?: string;
    date_to?: string;
    offset?: number;
    limit?: number;
  }): Promise<Page<PaymentListItem>> => {
    const res = await apiClient.get<Page<PaymentListItem>>('/payments', { params });
    return res.data;
  },

  getSalePayments: async (saleId: string): Promise<SalePaymentOut[]> => {
    const res = await apiClient.get<SalePaymentOut[]>(`/payments/sale/${saleId}`);
    return res.data;
  },
};

// ==========================================
// 7. ALERTS
// ==========================================
export const alertsApi = {
  list: async (params: {
    branch_id?: string;
    is_resolved?: boolean;
    alert_type?: AlertType;
    severity?: AlertSeverity;
    refresh?: boolean;
    offset?: number;
    limit?: number;
  }): Promise<Page<SystemAlert>> => {
    const res = await apiClient.get<Page<SystemAlert>>('/alerts', { params });
    return res.data;
  },

  count: async (branch_id?: string): Promise<AlertCountOut> => {
    const res = await apiClient.get<AlertCountOut>('/alerts/count', { params: { branch_id } });
    return res.data;
  },

  evaluate: async (branch_id?: string): Promise<AlertEvaluationResult> => {
    const res = await apiClient.post<AlertEvaluationResult>('/alerts/evaluate', null, {
      params: { branch_id },
    });
    return res.data;
  },

  resolve: async (alertId: string): Promise<SystemAlert> => {
    const res = await apiClient.patch<SystemAlert>(`/alerts/${alertId}/resolve`);
    return res.data;
  },
};

// ==========================================
// 8. REPORTS
// ==========================================
export const reportsApi = {
  getSummary: async (params: {
    branch_id?: string;
    user_id?: string;
    date_from?: string;
    date_to?: string;
    receipts_limit?: number;
  }): Promise<ReportSummary> => {
    const res = await apiClient.get<ReportSummary>('/reports/summary', { params });
    return res.data;
  },
};

