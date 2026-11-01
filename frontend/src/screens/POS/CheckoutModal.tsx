import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { salesApi } from '../../api';
import { ModalWrapper } from '../../components/ModalWrapper';
import { useAuthStore } from '../../store/useAuthStore';
import { useCartStore } from '../../store/useCartStore';
import { useUIStore } from '../../store/useUIStore';
import { CheckoutRequest, PaymentIn, PaymentMethod } from '../../types';
import { extractErrorMessage } from '../../utils/errors';
import { formatCurrency } from '../../utils/formatters';

interface CheckoutModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (receiptInfo: { series: string; number: number; total: number; change: number }) => void;
}

interface PaymentRow {
  id: string;
  method: PaymentMethod;
  amount: string;
  cashTendered: string;
  referenceNumber: string;
}

const PAYMENT_METHOD_OPTIONS: Array<{ method: PaymentMethod; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = [
  { method: 'CASH', label: 'Efectivo', icon: 'cash-outline', color: '#16a34a' },
  { method: 'YAPE', label: 'Yape', icon: 'phone-portrait-outline', color: '#7c3aed' },
  { method: 'PLIN', label: 'Plin', icon: 'wallet-outline', color: '#0284c7' },
  { method: 'CARD', label: 'Tarjeta / POS', icon: 'card-outline', color: '#ea580c' },
  { method: 'TRANSFER', label: 'Transferencia', icon: 'swap-horizontal-outline', color: '#475569' },
];

export const CheckoutModal: React.FC<CheckoutModalProps> = ({ visible, onClose, onSuccess }) => {
  const queryClient = useQueryClient();
  const selectedBranch = useAuthStore((state) => state.selectedBranch);
  const showToast = useUIStore((state) => state.showToast);

  const { items, getTotal, getSubtotal, discount, clearCart } = useCartStore();
  const totalAmount = getTotal();

  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('CASH');

  // Inicializar con un pago por defecto igual al total cuando se abre
  useEffect(() => {
    if (visible && totalAmount > 0) {
      setPaymentRows([
        {
          id: 'pay-1',
          method: 'CASH',
          amount: totalAmount.toFixed(2),
          cashTendered: totalAmount.toFixed(2),
          referenceNumber: '',
        },
      ]);
      setSelectedMethod('CASH');
    }
  }, [visible, totalAmount]);

  // Cálculos dinámicos de saldo
  const sumAmounts = paymentRows.reduce((acc, row) => {
    const val = parseFloat(row.amount);
    return acc + (isNaN(val) ? 0 : val);
  }, 0);

  const roundedSum = parseFloat(sumAmounts.toFixed(2));
  const roundedTotal = parseFloat(totalAmount.toFixed(2));
  const pendingBalance = Math.max(0, parseFloat((roundedTotal - roundedSum).toFixed(2)));
  const isPaidInFull = roundedSum >= roundedTotal && roundedTotal > 0;

  // Cálculo de vuelto total en efectivo
  const totalChange = paymentRows.reduce((acc, row) => {
    if (row.method === 'CASH') {
      const tendered = parseFloat(row.cashTendered) || 0;
      const amt = parseFloat(row.amount) || 0;
      return acc + Math.max(0, tendered - amt);
    }
    return acc;
  }, 0);

  const updateRow = (id: string, updates: Partial<PaymentRow>) => {
    setPaymentRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  };

  const removeRow = (id: string) => {
    setPaymentRows((prev) => prev.filter((r) => r.id !== id));
  };

  const addPaymentMethodRow = (method: PaymentMethod) => {
    const remaining = pendingBalance > 0 ? pendingBalance.toFixed(2) : '0.00';
    setPaymentRows((prev) => [
      ...prev,
      {
        id: `pay-${Date.now()}`,
        method,
        amount: remaining,
        cashTendered: remaining,
        referenceNumber: '',
      },
    ]);
  };

  const checkoutMutation = useMutation({
    mutationFn: (payload: CheckoutRequest) => salesApi.checkout(payload),
    onSuccess: (sale) => {
      clearCart();
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });

      onSuccess({
        series: sale.receipt_series,
        number: sale.receipt_number,
        total: sale.total,
        change: sale.change_total,
      });
      onClose();
    },
    onError: (err) => {
      showToast(extractErrorMessage(err), 'error', 'Error en Checkout');
    },
  });

  const handleFinalizeSale = () => {
    if (!selectedBranch) {
      showToast('No hay una sucursal seleccionada', 'warning');
      return;
    }

    if (items.length === 0) {
      showToast('El carrito está vacío', 'warning');
      return;
    }

    if (!isPaidInFull) {
      showToast(`Falta cubrir el saldo pendiente de ${formatCurrency(pendingBalance)}`, 'warning');
      return;
    }

    // Validar referencias en billeteras digitales y tarjetas
    for (const row of paymentRows) {
      const amt = parseFloat(row.amount);
      if (isNaN(amt) || amt <= 0) {
        showToast('Cada fila de pago debe tener un monto mayor a 0', 'warning');
        return;
      }
      if (['YAPE', 'PLIN', 'CARD'].includes(row.method) && !row.referenceNumber.trim()) {
        const label = PAYMENT_METHOD_OPTIONS.find((p) => p.method === row.method)?.label;
        showToast(`El pago con ${label} requiere número de operación o voucher`, 'warning');
        return;
      }
    }

    const paymentsPayload: PaymentIn[] = paymentRows.map((row) => ({
      payment_method: row.method,
      amount: parseFloat(row.amount),
      cash_tendered:
        row.method === 'CASH' && row.cashTendered
          ? parseFloat(row.cashTendered)
          : undefined,
      reference_number: row.referenceNumber.trim() || undefined,
    }));

    const payload: CheckoutRequest = {
      branch_id: selectedBranch.id,
      items: items.map((i) => ({
        product_id: i.product.id,
        quantity: i.quantity,
      })),
      payments: paymentsPayload,
      discount: discount > 0 ? discount : undefined,
    };

    checkoutMutation.mutate(payload);
  };

  return (
    <ModalWrapper
      visible={visible}
      onClose={onClose}
      title="Cobro y Liquidación de Venta"
      subtitle={`${items.length} productos en carrito`}
      maxWidth={640}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Panel Destacado de Totales */}
        <View style={styles.totalBanner}>
          <View>
            <Text style={styles.totalLabel}>TOTAL A PAGAR</Text>
            <Text style={styles.totalAmount}>{formatCurrency(totalAmount)}</Text>
          </View>
          <View style={styles.totalsRight}>
            <Text style={styles.subtotalText}>Subtotal: {formatCurrency(getSubtotal())}</Text>
            {discount > 0 ? (
              <Text style={styles.discountText}>Descuento: -{formatCurrency(discount)}</Text>
            ) : null}
          </View>
        </View>

        {/* Indicador de Saldo Pendiente o Vuelto */}
        <View
          style={[
            styles.balanceBar,
            pendingBalance > 0 ? styles.balancePending : styles.balanceComplete,
          ]}
        >
          <View style={styles.balanceRow}>
            <Text
              style={[
                styles.balanceLabel,
                pendingBalance > 0 ? styles.textAmber : styles.textGreen,
              ]}
            >
              {pendingBalance > 0 ? 'SALDO PENDIENTE' : 'PAGADO COMPLETO'}
            </Text>
            <Text
              style={[
                styles.balanceValue,
                pendingBalance > 0 ? styles.textAmber : styles.textGreen,
              ]}
            >
              {pendingBalance > 0 ? formatCurrency(pendingBalance) : 'S/ 0.00'}
            </Text>
          </View>

          {totalChange > 0 ? (
            <View style={styles.changeRow}>
              <Text style={styles.changeLabel}>VUELTO A ENTREGAR:</Text>
              <Text style={styles.changeValue}>{formatCurrency(totalChange)}</Text>
            </View>
          ) : null}
        </View>

        {/* Selector rápido para añadir medios de pago */}
        <Text style={styles.sectionTitle}>Medios de Pago (Split Payments)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.methodsScroll}>
          {PAYMENT_METHOD_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.method}
              style={[
                styles.methodChip,
                selectedMethod === opt.method && { borderColor: opt.color, backgroundColor: '#f8fafc' },
              ]}
              onPress={() => {
                setSelectedMethod(opt.method);
                addPaymentMethodRow(opt.method);
              }}
            >
              <Ionicons name={opt.icon} size={18} color={opt.color} />
              <Text style={styles.methodChipText}>+ {opt.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Filas de Pagos Agregados */}
        <View style={styles.rowsContainer}>
          {paymentRows.map((row, index) => {
            const opt = PAYMENT_METHOD_OPTIONS.find((p) => p.method === row.method);
            const isCash = row.method === 'CASH';
            const rowTendered = parseFloat(row.cashTendered) || 0;
            const rowAmt = parseFloat(row.amount) || 0;
            const rowChange = Math.max(0, rowTendered - rowAmt);

            return (
              <View key={row.id} style={styles.paymentCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.methodBadge}>
                    <Ionicons name={opt?.icon || 'cash'} size={18} color={opt?.color || '#000'} />
                    <Text style={styles.methodBadgeText}>{opt?.label || row.method}</Text>
                  </View>
                  {paymentRows.length > 1 ? (
                    <TouchableOpacity
                      onPress={() => removeRow(row.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Campos según medio de pago */}
                <View style={styles.cardBody}>
                  {isCash ? (
                    <>
                      <View style={styles.fieldRow}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={styles.inputLabel}>Monto Aplicado (S/)</Text>
                          <TextInput
                            style={styles.cardInput}
                            value={row.amount}
                            onChangeText={(val) => updateRow(row.id, { amount: val })}
                            keyboardType="decimal-pad"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.inputLabel}>Efectivo Recibido (S/)</Text>
                          <TextInput
                            style={[styles.cardInput, styles.cashReceivedInput]}
                            value={row.cashTendered}
                            onChangeText={(val) => updateRow(row.id, { cashTendered: val })}
                            keyboardType="decimal-pad"
                            selectTextOnFocus
                          />
                        </View>
                      </View>
                      {rowChange > 0 ? (
                        <View style={styles.rowChangeNotice}>
                          <Text style={styles.rowChangeText}>
                            Vuelto de esta línea: <Text style={{ fontWeight: '700' }}>{formatCurrency(rowChange)}</Text>
                          </Text>
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <View style={styles.fieldRow}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.inputLabel}>Monto (S/)</Text>
                        <TextInput
                          style={styles.cardInput}
                          value={row.amount}
                          onChangeText={(val) => updateRow(row.id, { amount: val })}
                          keyboardType="decimal-pad"
                        />
                      </View>
                      <View style={{ flex: 1.3 }}>
                        <Text style={styles.inputLabel}>N° Operación / Voucher *</Text>
                        <TextInput
                          style={styles.cardInput}
                          value={row.referenceNumber}
                          placeholder="Ejem. 123456"
                          placeholderTextColor="#94a3b8"
                          onChangeText={(val) => updateRow(row.id, { referenceNumber: val })}
                        />
                      </View>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Botón Finalizar Venta */}
        <TouchableOpacity
          style={[
            styles.finalizeBtn,
            (!isPaidInFull || checkoutMutation.isPending) && styles.finalizeBtnDisabled,
          ]}
          onPress={handleFinalizeSale}
          disabled={!isPaidInFull || checkoutMutation.isPending}
          activeOpacity={0.8}
        >
          {checkoutMutation.isPending ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Ionicons name="checkmark-done" size={22} color="#ffffff" />
              <Text style={styles.finalizeBtnText}>
                {isPaidInFull
                  ? `Finalizar Venta • ${formatCurrency(totalAmount)}`
                  : `Saldo pendiente: ${formatCurrency(pendingBalance)}`}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </ModalWrapper>
  );
};

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: 20,
  },
  totalBanner: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  totalLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  totalAmount: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 2,
  },
  totalsRight: {
    alignItems: 'flex-end',
  },
  subtotalText: {
    color: '#cbd5e1',
    fontSize: 13,
  },
  discountText: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  balanceBar: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  balancePending: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  balanceComplete: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  textAmber: {
    color: '#b45309',
  },
  textGreen: {
    color: '#15803d',
  },
  changeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#bbf7d0',
  },
  changeLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  changeValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#15803d',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  methodsScroll: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  methodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginRight: 8,
  },
  methodChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  rowsContainer: {
    gap: 10,
    marginBottom: 16,
  },
  paymentCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  methodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  methodBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  cardBody: {},
  fieldRow: {
    flexDirection: 'row',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 4,
  },
  cardInput: {
    height: 42,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '600',
  },
  cashReceivedInput: {
    borderColor: '#16a34a',
    color: '#15803d',
  },
  rowChangeNotice: {
    marginTop: 6,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  rowChangeText: {
    fontSize: 12,
    color: '#166534',
  },
  finalizeBtn: {
    height: 52,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  finalizeBtnDisabled: {
    backgroundColor: '#94a3b8',
    shadowOpacity: 0,
    elevation: 0,
  },
  finalizeBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});

