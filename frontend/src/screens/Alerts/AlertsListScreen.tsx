import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { alertsApi, batchesApi } from '../../api';
import { Badge } from '../../components/Badge';
import { ModalWrapper } from '../../components/ModalWrapper';
import { useAuthStore } from '../../store/useAuthStore';
import { useUIStore } from '../../store/useUIStore';
import { AlertSeverity, AlertType, SystemAlert, WriteOffPayload } from '../../types';
import { extractErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/formatters';

export const AlertsListScreen: React.FC = () => {
  const queryClient = useQueryClient();
  const selectedBranch = useAuthStore((state) => state.selectedBranch);
  const showToast = useUIStore((state) => state.showToast);

  const [activeSeverity, setActiveSeverity] = useState<AlertSeverity | 'ALL'>('ALL');
  const [selectedAlertForWriteOff, setSelectedAlertForWriteOff] = useState<SystemAlert | null>(null);
  const [writeOffQuantity, setWriteOffQuantity] = useState('');
  const [writeOffReason, setWriteOffReason] = useState('Merma por vencimiento');

  // Consulta de alertas pendientes
  const {
    data: alertsPage,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['alerts', selectedBranch?.id, activeSeverity],
    queryFn: () =>
      alertsApi.list({
        branch_id: selectedBranch?.id,
        is_resolved: false,
        severity: activeSeverity === 'ALL' ? undefined : activeSeverity,
        limit: 100,
      }),
  });

  // Contador por severidad
  const { data: countData } = useQuery({
    queryKey: ['alerts-count', selectedBranch?.id],
    queryFn: () => alertsApi.count(selectedBranch?.id),
  });

  // Evaluar alertas bajo demanda
  const evaluateMutation = useMutation({
    mutationFn: () => alertsApi.evaluate(selectedBranch?.id),
    onSuccess: (res) => {
      showToast(
        `Motor ejecutado: ${res.created} nuevas alertas, ${res.resolved} resueltas automáticamente.`,
        'success',
        'Evaluador de Alertas'
      );
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alerts-count'] });
    },
    onError: (err) => {
      showToast(extractErrorMessage(err), 'error', 'Error al Evaluar');
    },
  });

  // Marcar como resuelta manualmente
  const resolveMutation = useMutation({
    mutationFn: (alertId: string) => alertsApi.resolve(alertId),
    onSuccess: () => {
      showToast('Alerta marcada como resuelta.', 'success');
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alerts-count'] });
    },
    onError: (err) => {
      showToast(extractErrorMessage(err), 'error', 'Error al Resolver');
    },
  });

  // Dar de baja por merma directamente desde la alerta de lote vencido
  const writeOffMutation = useMutation({
    mutationFn: ({ batchId, payload }: { batchId: string; payload: WriteOffPayload }) =>
      batchesApi.writeOff(batchId, payload),
    onSuccess: (data) => {
      showToast(
        `Baja por merma efectuada con éxito (S/ ${data.written_off_cost}).`,
        'success',
        'Merma Aplicada'
      );
      setSelectedAlertForWriteOff(null);
      setWriteOffQuantity('');
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['alerts-count'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err) => {
      showToast(extractErrorMessage(err), 'error', 'Error en Merma');
    },
  });

  const handleConfirmWriteOff = () => {
    if (!selectedAlertForWriteOff) return;
    const qty = writeOffQuantity ? parseFloat(writeOffQuantity) : undefined;
    if (qty !== undefined && (isNaN(qty) || qty <= 0)) {
      showToast('Ingrese una cantidad válida mayor a 0', 'warning');
      return;
    }

    writeOffMutation.mutate({
      batchId: selectedAlertForWriteOff.reference_id,
      payload: {
        quantity: qty,
        reason: writeOffReason.trim() || 'Merma por vencimiento',
      },
    });
  };

  const getAlertCardTheme = (severity: AlertSeverity) => {
    switch (severity) {
      case 'HIGH':
        return {
          bg: '#fef2f2',
          border: '#f87171',
          iconName: 'alert-circle' as const,
          iconColor: '#dc2626',
          badgeText: 'VENCIDO (CRÍTICO)',
        };
      case 'MEDIUM':
        return {
          bg: '#fff7ed',
          border: '#fb923c',
          iconName: 'time' as const,
          iconColor: '#ea580c',
          badgeText: 'POR VENCER (≤ 15 DÍAS)',
        };
      case 'LOW':
        return {
          bg: '#fefce8',
          border: '#facc15',
          iconName: 'warning' as const,
          iconColor: '#ca8a04',
          badgeText: 'STOCK BAJO',
        };
      case 'INFO':
      default:
        return {
          bg: '#f8fafc',
          border: '#cbd5e1',
          iconName: 'information-circle' as const,
          iconColor: '#0284c7',
          badgeText: 'AUDITORÍA',
        };
    }
  };

  const renderAlertItem = useCallback(({ item }: { item: SystemAlert }) => {
    const theme = getAlertCardTheme(item.severity);
    const isExpiredBatch = item.alert_type === 'EXPIRED';

    return (
      <View style={[styles.alertCard, { backgroundColor: theme.bg, borderColor: theme.border }]}>
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <Ionicons name={theme.iconName} size={20} color={theme.iconColor} />
            <Text style={[styles.severityLabel, { color: theme.iconColor }]}>
              {theme.badgeText}
            </Text>
          </View>
          <Text style={styles.dateText}>{formatDateTime(item.created_at)}</Text>
        </View>

        <Text style={styles.messageText}>{item.message}</Text>

        <View style={styles.cardActions}>
          {isExpiredBatch ? (
            <TouchableOpacity
              style={styles.actionMermaBtn}
              onPress={() => setSelectedAlertForWriteOff(item)}
            >
              <Ionicons name="trash-bin-outline" size={15} color="#ffffff" />
              <Text style={styles.actionMermaText}>Dar de baja por merma</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={styles.actionResolveBtn}
            onPress={() => resolveMutation.mutate(item.id)}
            disabled={resolveMutation.isPending}
          >
            <Ionicons name="checkmark-done-outline" size={16} color="#475569" />
            <Text style={styles.actionResolveText}>Resolver</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, []);

  return (
    <View style={styles.container}>
      {/* Header con botón de evaluación manual */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.screenTitle}>Alertas Preventivas</Text>
          <Text style={styles.screenSubtitle}>
            {countData?.total || 0} eventos pendientes de atención
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.evaluateBtn, evaluateMutation.isPending && styles.btnDisabled]}
          onPress={() => evaluateMutation.mutate()}
          disabled={evaluateMutation.isPending}
          activeOpacity={0.8}
        >
          {evaluateMutation.isPending ? (
            <ActivityIndicator size="small" color="#0284c7" />
          ) : (
            <>
              <Ionicons name="refresh-outline" size={16} color="#0284c7" />
              <Text style={styles.evaluateBtnText}>Evaluar Ahora</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Segmented Filter Bar por Severidad */}
      <View style={styles.filterTabs}>
        <TouchableOpacity
          style={[styles.tab, activeSeverity === 'ALL' && styles.tabActive]}
          onPress={() => setActiveSeverity('ALL')}
        >
          <Text style={[styles.tabText, activeSeverity === 'ALL' && styles.tabTextActive]}>
            Todas ({countData?.total || 0})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeSeverity === 'HIGH' && styles.tabActive]}
          onPress={() => setActiveSeverity('HIGH')}
        >
          <View style={[styles.dot, { backgroundColor: '#dc2626' }]} />
          <Text style={[styles.tabText, activeSeverity === 'HIGH' && styles.tabTextActive]}>
            Vencidos ({countData?.high || 0})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeSeverity === 'MEDIUM' && styles.tabActive]}
          onPress={() => setActiveSeverity('MEDIUM')}
        >
          <View style={[styles.dot, { backgroundColor: '#ea580c' }]} />
          <Text style={[styles.tabText, activeSeverity === 'MEDIUM' && styles.tabTextActive]}>
            Por Vencer ({countData?.medium || 0})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeSeverity === 'LOW' && styles.tabActive]}
          onPress={() => setActiveSeverity('LOW')}
        >
          <View style={[styles.dot, { backgroundColor: '#ca8a04' }]} />
          <Text style={[styles.tabText, activeSeverity === 'LOW' && styles.tabTextActive]}>
            Bajo Stock ({countData?.low || 0})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Lista de Alertas */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#0284c7" />
          <Text style={styles.loadingText}>Comprobando alertas...</Text>
        </View>
      ) : (
        <FlatList
          data={alertsPage?.items || []}
          keyExtractor={(item) => item.id}
          renderItem={renderAlertItem}
          refreshing={isRefetching}
          onRefresh={refetch}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="shield-checkmark-outline" size={56} color="#22c55e" />
              <Text style={styles.emptyTitle}>¡Todo bajo control!</Text>
              <Text style={styles.emptySub}>
                No hay alertas activas de vencimiento ni quiebres de stock.
              </Text>
            </View>
          }
        />
      )}

      {/* Modal Confirmar Baja por Merma desde Alerta */}
      <ModalWrapper
        visible={!!selectedAlertForWriteOff}
        onClose={() => setSelectedAlertForWriteOff(null)}
        title="Dar de Baja por Merma"
        subtitle="Se retirará el producto del inventario disponible."
      >
        <View style={styles.modalForm}>
          <Text style={styles.modalAlertText}>{selectedAlertForWriteOff?.message}</Text>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Cantidad a retirar (vacío = todo el saldo del lote):</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Todo el lote"
              value={writeOffQuantity}
              onChangeText={setWriteOffQuantity}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.formLabel}>Motivo del desecho:</Text>
            <TextInput
              style={styles.textInput}
              value={writeOffReason}
              onChangeText={setWriteOffReason}
              placeholder="Ejem. Producto vencido en percha"
            />
          </View>

          <TouchableOpacity
            style={[styles.confirmBtn, writeOffMutation.isPending && styles.btnDisabled]}
            onPress={handleConfirmWriteOff}
            disabled={writeOffMutation.isPending}
          >
            {writeOffMutation.isPending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={18} color="#ffffff" />
                <Text style={styles.confirmBtnText}>Confirmar Merma Definitiva</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ModalWrapper>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  screenSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  evaluateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  evaluateBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0284c7',
  },
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 6,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  tabActive: {
    backgroundColor: '#0f172a',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  listContent: {
    padding: 12,
  },
  alertCard: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  severityLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  dateText: {
    fontSize: 11,
    color: '#64748b',
  },
  messageText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    lineHeight: 20,
    marginBottom: 12,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  actionMermaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  actionMermaText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  actionResolveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  actionResolveText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: '#64748b',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#166534',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center',
  },
  modalForm: {
    paddingVertical: 6,
  },
  modalAlertText: {
    fontSize: 14,
    color: '#0f172a',
    marginBottom: 14,
    backgroundColor: '#fee2e2',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  formGroup: {
    marginBottom: 12,
  },
  formLabel: {
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
    fontSize: 15,
    color: '#0f172a',
  },
  confirmBtn: {
    height: 48,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  confirmBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});

