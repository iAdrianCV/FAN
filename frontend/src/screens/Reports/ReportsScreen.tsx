import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { reportsApi, salesApi } from '../../api';
import { Badge } from '../../components/Badge';
import { ModalWrapper } from '../../components/ModalWrapper';
import { useAuthStore } from '../../store/useAuthStore';
import { useUIStore } from '../../store/useUIStore';
import { PaymentMethod, ReportSummary, SaleSummaryOut, VoidSaleRequest } from '../../types';
import { extractErrorMessage } from '../../utils/errors';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

type DatePreset = 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH';

export const ReportsScreen: React.FC = () => {
  const queryClient = useQueryClient();
  const selectedBranch = useAuthStore((state) => state.selectedBranch);
  const showToast = useUIStore((state) => state.showToast);

  const [preset, setPreset] = useState<DatePreset>('TODAY');
  const [selectedReceiptForVoid, setSelectedReceiptForVoid] = useState<SaleSummaryOut | null>(null);
  const [voidReason, setVoidReason] = useState('Error en digitación o devolución de cliente');

  // Calcular rango de fechas ISO según el preset
  const getDateRange = () => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);

    if (preset === 'YESTERDAY') {
      const yStart = new Date(todayStart);
      yStart.setDate(yStart.getDate() - 1);
      return {
        date_from: yStart.toISOString(),
        date_to: todayStart.toISOString(),
      };
    }
    if (preset === 'WEEK') {
      const wStart = new Date(todayStart);
      wStart.setDate(wStart.getDate() - 7);
      return {
        date_from: wStart.toISOString(),
        date_to: todayEnd.toISOString(),
      };
    }
    if (preset === 'MONTH') {
      const mStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      return {
        date_from: mStart.toISOString(),
        date_to: todayEnd.toISOString(),
      };
    }
    // 'TODAY'
    return {
      date_from: todayStart.toISOString(),
      date_to: todayEnd.toISOString(),
    };
  };

  const { date_from, date_to } = getDateRange();

  const {
    data: summary,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['report-summary', selectedBranch?.id, preset],
    queryFn: () =>
      reportsApi.getSummary({
        branch_id: selectedBranch?.id,
        date_from,
        date_to,
        receipts_limit: 100,
      }),
  });

  const voidMutation = useMutation({
    mutationFn: ({ saleId, payload }: { saleId: string; payload: VoidSaleRequest }) =>
      salesApi.voidSale(saleId, payload),
    onSuccess: (data) => {
      showToast(
        `Comprobante ${data.receipt_series}-${data.receipt_number} anulado. Stock devuelto a los lotes.`,
        'success',
        'Venta Anulada'
      );
      setSelectedReceiptForVoid(null);
      queryClient.invalidateQueries({ queryKey: ['report-summary'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
    },
    onError: (err) => {
      showToast(extractErrorMessage(err), 'error', 'Error al Anular Venta');
    },
  });

  const handleConfirmVoid = () => {
    if (!selectedReceiptForVoid) return;
    if (!voidReason.trim()) {
      showToast('Debe ingresar un motivo para la anulación', 'warning');
      return;
    }
    voidMutation.mutate({
      saleId: selectedReceiptForVoid.id,
      payload: { reason: voidReason.trim() },
    });
  };

  const getPaymentMethodIcon = (m: PaymentMethod): keyof typeof Ionicons.glyphMap => {
    switch (m) {
      case 'CASH':
        return 'cash-outline';
      case 'YAPE':
      case 'PLIN':
        return 'phone-portrait-outline';
      case 'CARD':
        return 'card-outline';
      case 'TRANSFER':
        return 'swap-horizontal-outline';
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Selector de Rango de Fechas / Turnos */}
      <View style={styles.presetsRow}>
        <TouchableOpacity
          style={[styles.presetBtn, preset === 'TODAY' && styles.presetBtnActive]}
          onPress={() => setPreset('TODAY')}
        >
          <Text style={[styles.presetText, preset === 'TODAY' && styles.presetTextActive]}>
            Hoy
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.presetBtn, preset === 'YESTERDAY' && styles.presetBtnActive]}
          onPress={() => setPreset('YESTERDAY')}
        >
          <Text style={[styles.presetText, preset === 'YESTERDAY' && styles.presetTextActive]}>
            Ayer
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.presetBtn, preset === 'WEEK' && styles.presetBtnActive]}
          onPress={() => setPreset('WEEK')}
        >
          <Text style={[styles.presetText, preset === 'WEEK' && styles.presetTextActive]}>
            Últimos 7 días
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.presetBtn, preset === 'MONTH' && styles.presetBtnActive]}
          onPress={() => setPreset('MONTH')}
        >
          <Text style={[styles.presetText, preset === 'MONTH' && styles.presetTextActive]}>
            Este Mes
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#0284c7" />
          <Text style={styles.loadingText}>Calculando métricas financieras y arqueo...</Text>
        </View>
      ) : summary ? (
        <>
          {/* Tarjeta Destacada: Arqueo de Efectivo en Caja */}
          <View style={styles.cashCloseCard}>
            <View style={styles.cashCloseHeader}>
              <View style={styles.cashIconBox}>
                <Ionicons name="cash" size={24} color="#15803d" />
              </View>
              <View>
                <Text style={styles.cashCloseTitle}>EFECTIVO ESPERADO EN CAJA</Text>
                <Text style={styles.cashCloseSub}>Arqueo neto (descontando vueltos)</Text>
              </View>
            </View>
            <Text style={styles.cashCloseAmount}>{formatCurrency(summary.expected_cash)}</Text>

            <View style={styles.cashCloseDetails}>
              <Text style={styles.cashDetailText}>
                Efectivo recibido: {formatCurrency(summary.cash_tendered_total)}
              </Text>
              <Text style={styles.cashDetailText}>
                Vuelto entregado: -{formatCurrency(summary.change_given_total)}
              </Text>
            </View>
          </View>

          {/* Grid de Métricas Principales */}
          <View style={styles.metricsGrid}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>TOTAL VENTAS</Text>
              <Text style={styles.metricValue}>{formatCurrency(summary.total_sales)}</Text>
              <Text style={styles.metricSub}>{summary.sales_count} ventas realizadas</Text>
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>MARGEN BRUTO</Text>
              <Text style={[styles.metricValue, { color: '#0284c7' }]}>
                {formatCurrency(summary.gross_margin)}
              </Text>
              <Text style={styles.metricSub}>{summary.gross_margin_pct}% de rentabilidad</Text>
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>TICKET PROMEDIO</Text>
              <Text style={styles.metricValue}>{formatCurrency(summary.average_ticket)}</Text>
              <Text style={styles.metricSub}>Por cliente atendido</Text>
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>COSTO MERCADERÍA</Text>
              <Text style={[styles.metricValue, { color: '#64748b' }]}>
                {formatCurrency(summary.total_cost)}
              </Text>
              <Text style={styles.metricSub}>Costo real FEFO</Text>
            </View>
          </View>

          {/* Tabla de Medios de Pago */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Desglose por Medio de Pago</Text>
            {summary.payments_by_method.map((p) => (
              <View key={p.payment_method} style={styles.paymentMethodRow}>
                <View style={styles.payMethodLeft}>
                  <Ionicons name={getPaymentMethodIcon(p.payment_method)} size={20} color="#0284c7" />
                  <Text style={styles.payMethodName}>{p.payment_method}</Text>
                  <Text style={styles.payCount}>({p.count} trans.)</Text>
                </View>
                <View style={styles.payMethodRight}>
                  <Text style={styles.payAmount}>{formatCurrency(p.amount)}</Text>
                  <Text style={styles.payShare}>{p.share_pct}%</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Listado de Comprobantes Emitidos */}
          <View style={styles.sectionCard}>
            <View style={styles.receiptsHeader}>
              <Text style={styles.sectionTitle}>Últimos Comprobantes</Text>
              <Text style={styles.receiptsCount}>({summary.receipts.length} comprobantes)</Text>
            </View>

            {summary.receipts.map((r) => {
              const isVoided = r.status === 'VOIDED';
              return (
                <View key={r.id} style={[styles.receiptRow, isVoided && styles.receiptRowVoided]}>
                  <View style={styles.receiptLeft}>
                    <Text style={[styles.receiptCode, isVoided && styles.strikeText]}>
                      {r.receipt_series}-{r.receipt_number}
                    </Text>
                    <Text style={styles.receiptDate}>{formatDateTime(r.created_at)}</Text>
                  </View>

                  <View style={styles.receiptRight}>
                    <Text style={[styles.receiptTotal, isVoided && styles.receiptVoidedTotal]}>
                      {formatCurrency(r.total)}
                    </Text>

                    {isVoided ? (
                      <Badge label="ANULADA" severity="HIGH" size="small" />
                    ) : (
                      <TouchableOpacity
                        style={styles.voidBtn}
                        onPress={() => setSelectedReceiptForVoid(r)}
                      >
                        <Text style={styles.voidBtnText}>Anular</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      {/* Modal de Anulación de Comprobante */}
      <ModalWrapper
        visible={!!selectedReceiptForVoid}
        onClose={() => setSelectedReceiptForVoid(null)}
        title="Anular Comprobante de Venta"
        subtitle={
          selectedReceiptForVoid
            ? `${selectedReceiptForVoid.receipt_series}-${selectedReceiptForVoid.receipt_number} • Total ${formatCurrency(
                selectedReceiptForVoid.total
              )}`
            : undefined
        }
      >
        <View style={styles.voidModalBody}>
          <Text style={styles.voidNotice}>
            La anulación revertirá los saldos consumidos por FEFO devolviendo la mercadería a sus lotes
            originales en una transacción segura.
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Motivo de la anulación:</Text>
            <TextInput
              style={styles.textInput}
              value={voidReason}
              onChangeText={setVoidReason}
              placeholder="Ejem. Solicitud de cliente / comprobante duplicado"
            />
          </View>

          <TouchableOpacity
            style={[styles.confirmVoidBtn, voidMutation.isPending && styles.btnDisabled]}
            onPress={handleConfirmVoid}
            disabled={voidMutation.isPending}
          >
            {voidMutation.isPending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={18} color="#ffffff" />
                <Text style={styles.confirmVoidBtnText}>Confirmar Anulación de Venta</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ModalWrapper>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 14,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  presetBtnActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  presetText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  presetTextActive: {
    color: '#ffffff',
  },
  loadingBox: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 10,
  },
  cashCloseCard: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1.5,
    borderColor: '#86efac',
    borderRadius: 16,
    padding: 16,
  },
  cashCloseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cashIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cashCloseTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#166534',
    letterSpacing: 0.5,
  },
  cashCloseSub: {
    fontSize: 12,
    color: '#15803d',
    marginTop: 2,
  },
  cashCloseAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: '#15803d',
    marginVertical: 10,
  },
  cashCloseDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#bbf7d0',
  },
  cashDetailText: {
    fontSize: 12,
    color: '#166534',
    fontWeight: '600',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    minWidth: '46%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginVertical: 4,
  },
  metricSub: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  paymentMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  payMethodLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  payMethodName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  payCount: {
    fontSize: 12,
    color: '#94a3b8',
  },
  payMethodRight: {
    alignItems: 'flex-end',
  },
  payAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  payShare: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  receiptsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  receiptsCount: {
    fontSize: 12,
    color: '#64748b',
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  receiptRowVoided: {
    opacity: 0.6,
  },
  receiptLeft: {},
  receiptCode: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  strikeText: {
    textDecorationLine: 'line-through',
    color: '#94a3b8',
  },
  receiptDate: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  receiptRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  receiptTotal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  receiptVoidedTotal: {
    color: '#ef4444',
  },
  voidBtn: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  voidBtnText: {
    color: '#dc2626',
    fontSize: 11,
    fontWeight: '700',
  },
  voidModalBody: {
    paddingVertical: 6,
  },
  voidNotice: {
    fontSize: 13,
    color: '#475569',
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    lineHeight: 18,
    marginBottom: 12,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  textInput: {
    height: 44,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0f172a',
  },
  confirmVoidBtn: {
    height: 48,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  confirmVoidBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});

