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
import { batchesApi } from '../../api';
import { Badge } from '../../components/Badge';
import { ModalWrapper } from '../../components/ModalWrapper';
import { useAuthStore } from '../../store/useAuthStore';
import { useUIStore } from '../../store/useUIStore';
import { BatchWithProduct, WriteOffPayload } from '../../types';
import { extractErrorMessage } from '../../utils/errors';
import { formatCurrency, formatDate, formatQuantity, getExpiryStatus } from '../../utils/formatters';

const BATCH_ROW_HEIGHT = 100;

interface StockListScreenProps {
  onNavigateToReceive?: () => void;
}

export const StockListScreen: React.FC<StockListScreenProps> = ({ onNavigateToReceive }) => {
  const queryClient = useQueryClient();
  const selectedBranch = useAuthStore((state) => state.selectedBranch);
  const showToast = useUIStore((state) => state.showToast);

  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [selectedBatchForWriteOff, setSelectedBatchForWriteOff] = useState<BatchWithProduct | null>(
    null
  );
  const [writeOffQuantity, setWriteOffQuantity] = useState('');
  const [writeOffReason, setWriteOffReason] = useState('Merma por vencimiento');

  // Consulta de lotes en orden FEFO
  const {
    data: batchesPage,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['batches', selectedBranch?.id, onlyAvailable],
    queryFn: () =>
      selectedBranch
        ? batchesApi.list({
            branch_id: selectedBranch.id,
            only_available: onlyAvailable,
            limit: 100,
          })
        : Promise.resolve({ items: [], total: 0, offset: 0, limit: 100 }),
    enabled: !!selectedBranch,
  });

  // Mutación para dar de baja por merma
  const writeOffMutation = useMutation({
    mutationFn: ({ batchId, payload }: { batchId: string; payload: WriteOffPayload }) =>
      batchesApi.writeOff(batchId, payload),
    onSuccess: (data) => {
      showToast(
        `Se dio de baja ${formatQuantity(data.written_off_quantity)} (Costo S/ ${data.written_off_cost})`,
        'success',
        'Baja Registrada'
      );
      setSelectedBatchForWriteOff(null);
      setWriteOffQuantity('');
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: (err) => {
      showToast(extractErrorMessage(err), 'error', 'Error en Ajuste por Merma');
    },
  });

  const handleOpenWriteOff = (batch: BatchWithProduct) => {
    setSelectedBatchForWriteOff(batch);
    setWriteOffQuantity(batch.current_quantity.toString());
  };

  const handleConfirmWriteOff = () => {
    if (!selectedBatchForWriteOff) return;
    const qty = parseFloat(writeOffQuantity);
    if (isNaN(qty) || qty <= 0) {
      showToast('Ingrese una cantidad válida mayor a 0', 'warning');
      return;
    }
    if (qty > selectedBatchForWriteOff.current_quantity) {
      showToast(
        `La cantidad (${qty}) no puede superar el saldo del lote (${selectedBatchForWriteOff.current_quantity})`,
        'warning'
      );
      return;
    }

    writeOffMutation.mutate({
      batchId: selectedBatchForWriteOff.id,
      payload: {
        quantity: qty,
        reason: writeOffReason.trim() || 'Merma por vencimiento',
      },
    });
  };

  // Optimización FlatList
  const renderBatchItem = useCallback(({ item }: { item: BatchWithProduct }) => {
    const expiry = getExpiryStatus(item.expiration_date);

    return (
      <View style={styles.batchCard}>
        <View style={styles.cardTop}>
          <View style={styles.nameBlock}>
            <Text style={styles.productName} numberOfLines={1}>
              {item.product_name}
            </Text>
            <Text style={styles.batchNumber}>Lote: {item.batch_number}</Text>
          </View>
          <Badge
            label={expiry.label}
            severity={expiry.severity === 'OK' ? 'DEFAULT' : expiry.severity}
            size="small"
          />
        </View>

        <View style={styles.cardBottom}>
          <View style={styles.metricsCol}>
            <Text style={styles.qtyLabel}>Stock actual:</Text>
            <Text style={styles.qtyValue}>{formatQuantity(item.current_quantity, item.unit)}</Text>
          </View>

          <View style={styles.pricesCol}>
            <Text style={styles.priceText}>Costo: {formatCurrency(item.cost_price)}</Text>
            <Text style={styles.priceText}>Venta: {formatCurrency(item.sale_price)}</Text>
          </View>

          {item.current_quantity > 0 ? (
            <TouchableOpacity
              style={styles.mermaButton}
              onPress={() => handleOpenWriteOff(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-bin-outline" size={14} color="#dc2626" />
              <Text style={styles.mermaButtonText}>Merma</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.depletedBadge}>
              <Text style={styles.depletedText}>Agotado</Text>
            </View>
          )}
        </View>
      </View>
    );
  }, []);

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: BATCH_ROW_HEIGHT,
      offset: BATCH_ROW_HEIGHT * index,
      index,
    }),
    []
  );

  return (
    <View style={styles.container}>
      {/* Barra de Filtros y Acción de Recepción */}
      <View style={styles.filterBar}>
        <TouchableOpacity
          style={[styles.filterChip, onlyAvailable && styles.filterChipActive]}
          onPress={() => setOnlyAvailable(!onlyAvailable)}
        >
          <Ionicons
            name={onlyAvailable ? 'checkbox' : 'square-outline'}
            size={16}
            color={onlyAvailable ? '#0284c7' : '#64748b'}
          />
          <Text style={[styles.filterChipText, onlyAvailable && styles.filterChipTextActive]}>
            Solo con Stock
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.receiveBtn}
          onPress={onNavigateToReceive}
          activeOpacity={0.8}
        >
          <Ionicons name="add-circle" size={18} color="#ffffff" />
          <Text style={styles.receiveBtnText}>Recibir Lote</Text>
        </TouchableOpacity>
      </View>

      {/* Lista de Lotes */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#0284c7" />
          <Text style={styles.loadingText}>Cargando trazabilidad por lotes...</Text>
        </View>
      ) : (
        <FlatList
          data={batchesPage?.items || []}
          keyExtractor={(item) => item.id}
          renderItem={renderBatchItem}
          getItemLayout={getItemLayout}
          refreshing={isRefetching}
          onRefresh={refetch}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="layers-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>No hay lotes registrados</Text>
              <Text style={styles.emptySub}>
                Usa el botón "Recibir Lote" para ingresar nueva mercadería.
              </Text>
            </View>
          }
        />
      )}

      {/* Modal de Baja por Merma */}
      <ModalWrapper
        visible={!!selectedBatchForWriteOff}
        onClose={() => setSelectedBatchForWriteOff(null)}
        title="Dar de Baja por Merma"
        subtitle={
          selectedBatchForWriteOff
            ? `${selectedBatchForWriteOff.product_name} (Lote: ${selectedBatchForWriteOff.batch_number})`
            : undefined
        }
      >
        <View style={styles.writeOffForm}>
          <View style={styles.fieldGroup}>
            <Text style={styles.inputLabel}>
              Cantidad a dar de baja (Saldo disponible:{' '}
              {selectedBatchForWriteOff?.current_quantity})
            </Text>
            <TextInput
              style={styles.textInput}
              value={writeOffQuantity}
              onChangeText={setWriteOffQuantity}
              keyboardType="decimal-pad"
              autoFocus
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.inputLabel}>Motivo de la merma</Text>
            <TextInput
              style={styles.textInput}
              value={writeOffReason}
              onChangeText={setWriteOffReason}
              placeholder="Ejem. Producto vencido en exhibición"
            />
          </View>

          <TouchableOpacity
            style={[
              styles.confirmWriteOffBtn,
              writeOffMutation.isPending && styles.btnDisabled,
            ]}
            onPress={handleConfirmWriteOff}
            disabled={writeOffMutation.isPending}
          >
            {writeOffMutation.isPending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="alert-circle-outline" size={18} color="#ffffff" />
                <Text style={styles.confirmWriteOffText}>Confirmar Baja Definitiva</Text>
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
  filterBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterChipActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#bae6fd',
  },
  filterChipText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#0284c7',
  },
  receiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  receiveBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  listContent: {
    padding: 12,
  },
  batchCard: {
    height: BATCH_ROW_HEIGHT,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  nameBlock: {
    flex: 1,
    marginRight: 8,
  },
  productName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  batchNumber: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#f8fafc',
  },
  metricsCol: {},
  qtyLabel: {
    fontSize: 11,
    color: '#64748b',
  },
  qtyValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  pricesCol: {
    alignItems: 'center',
  },
  priceText: {
    fontSize: 11,
    color: '#475569',
  },
  mermaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  mermaButtonText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '700',
  },
  depletedBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  depletedText: {
    color: '#94a3b8',
    fontSize: 11,
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
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
  },
  writeOffForm: {
    paddingVertical: 8,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  inputLabel: {
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
  confirmWriteOffBtn: {
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
  confirmWriteOffText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});

