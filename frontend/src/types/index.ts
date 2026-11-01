/**
 * Tipos y DTOs de LotePOS espejados estrictamente desde el backend FastAPI.
 * Regla: Sin uso de `any`.
 */

export type UserRole = 'ADMIN' | 'SUPERVISOR' | 'CASHIER';

export type PaymentMethod = 'CASH' | 'YAPE' | 'PLIN' | 'CARD' | 'TRANSFER';

export type SaleStatus = 'COMPLETED' | 'VOIDED';

export type AlertType = 'EXPIRING_SOON' | 'EXPIRED' | 'LOW_STOCK' | 'WRITE_OFF' | 'SALE_VOIDED';

export type AlertSeverity = 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  branch_id: string | null;
}

export interface Branch {
  id: string;
  name: string;
  address: string | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface Product {
  id: string;
  barcode: string;
  sku: string | null;
  name: string;
  category: string | null;
  min_stock: number;
  unit: string;
  is_active: boolean;
}

export interface ProductWithStock extends Product {
  stock: number;
  sale_price: number | null;
  last_cost_price: number | null;
  next_expiration: string | null; // ISO YYYY-MM-DD
}

export interface ProductBatch {
  id: string;
  product_id: string;
  branch_id: string;
  batch_number: string;
  cost_price: number;
  sale_price: number;
  current_quantity: number;
  initial_quantity: number;
  expiration_date: string | null; // ISO YYYY-MM-DD
  received_at: string;
}

export interface BatchWithProduct extends ProductBatch {
  product_name: string;
  barcode: string;
  unit: string;
  days_to_expiry: number | null;
}

export interface QuickEntryPayload {
  branch_id: string;
  barcode: string;
  quantity: number;
  expiration_date?: string | null; // YYYY-MM-DD
  name?: string | null;
  cost_price?: number | null;
  sale_price?: number | null;
  batch_number?: string | null;
  sku?: string | null;
  category?: string | null;
  unit?: string | null;
  min_stock?: number | null;
}

export interface QuickEntryResponse {
  product: Product;
  batch: ProductBatch;
  product_created: boolean;
  prices_inherited: boolean;
}

export interface WriteOffPayload {
  quantity?: number | null;
  reason: string;
}

export interface WriteOffResponse {
  batch: ProductBatch;
  written_off_quantity: number;
  written_off_cost: number;
  audit_alert_id: string;
}

export interface CheckoutItem {
  product_id: string;
  quantity: number;
}

export interface PaymentIn {
  payment_method: PaymentMethod;
  amount: number;
  cash_tendered?: number | null;
  reference_number?: string | null;
}

export interface CheckoutRequest {
  branch_id: string;
  items: CheckoutItem[];
  payments: PaymentIn[];
  receipt_series?: string | null;
  receipt_number?: number | null;
  customer_id?: string | null;
  discount?: number;
}

export interface SaleItemOut {
  id: string;
  product_id: string;
  product_name: string;
  batch_id: string;
  batch_number: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  total_line: number;
}

export interface SalePaymentOut {
  id: string;
  payment_method: PaymentMethod;
  amount: number;
  cash_tendered: number | null;
  change_given: number | null;
  reference_number: string | null;
  created_at: string;
}

export interface SaleSummaryOut {
  id: string;
  branch_id: string;
  user_id: string | null;
  receipt_series: string;
  receipt_number: number;
  total: number;
  status: SaleStatus;
  created_at: string;
}

export interface SaleOut extends SaleSummaryOut {
  customer_id: string | null;
  subtotal: number;
  tax: number;
  discount: number;
  change_total: number;
  items: SaleItemOut[];
  payments: SalePaymentOut[];
}

export interface VoidSaleRequest {
  reason: string;
}

export interface PaymentMethodInfo {
  code: PaymentMethod;
  label: string;
  requires_reference: boolean;
  allows_change: boolean;
}

export interface SystemAlert {
  id: string;
  branch_id: string;
  alert_type: AlertType;
  reference_id: string;
  message: string;
  severity: AlertSeverity;
  is_resolved: boolean;
  created_at: string;
}

export interface AlertCountOut {
  total: number;
  high: number;
  medium: number;
  low: number;
}

export interface AlertEvaluationResult {
  executed: boolean;
  created: number;
  resolved: number;
  evaluated_at: string;
}

export interface PaymentMethodTotal {
  payment_method: PaymentMethod;
  amount: number;
  count: number;
  share_pct: number;
}

export interface ReportSummary {
  date_from: string;
  date_to: string;
  branch_id: string | null;
  user_id: string | null;
  sales_count: number;
  voided_count: number;
  voided_total: number;
  total_sales: number;
  subtotal: number;
  tax: number;
  discount: number;
  average_ticket: number;
  total_cost: number;
  gross_margin: number;
  gross_margin_pct: number;
  net_margin: number;
  expected_cash: number;
  cash_tendered_total: number;
  change_given_total: number;
  payments_by_method: PaymentMethodTotal[];
  receipts: SaleSummaryOut[];
  receipts_truncated: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
}

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  status_code: number;
  detail: string;
  error_code: string;
  instance: string;
  errors?: Array<{
    loc: Array<string | number>;
    msg: string;
    type: string;
  }>;
  extra?: Record<string, unknown>;
}

export interface CartItem {
  product: ProductWithStock;
  quantity: number;
  subtotal: number;
}
