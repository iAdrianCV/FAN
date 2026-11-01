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
import { batchesApi } from '../../api';
import { ModalWrapper } from '../../components/ModalWrapper';
import { useAuthStore } from '../../store/useAuthStore';
import { useUIStore } from '../../store/useUIStore';
import { QuickEntryPayload } from '../../types';
import { extractErrorMessage } from '../../utils/errors';

interface QuickAddModalProps {
  visible: boolean;
  onClose: () => void;
  initialBarcode?: string;
  initialName?: string;
  onSuccess?: () => void;
}

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  visible,
  onClose,
  initialBarcode = '',
  initialName = '',
  onSuccess,
}) => {
  const queryClient = useQueryClient();
  const selectedBranch = useAuthStore((state) => state.selectedBranch);
  const showToast = useUIStore((state) => state.showToast);

  const [barcode, setBarcode] = useState(initialBarcode);
  const [name, setName] = useState(initialName);
  const [quantity, setQuantity] = useState('1');
  const [expirationDate, setExpirationDate] = useState(''); // YYYY-MM-DD
  const [costPrice, setCostPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [unit, setUnit] = useState('UND');

  useEffect(() => {
    if (visible) {
      setBarcode(initialBarcode);
      setName(initialName);
      setQuantity('1');
      setExpirationDate('');
      setCostPrice('');
      setSalePrice('');
    }
  }, [visible, initialBarcode, initialName]);

  const quickEntryMutation = useMutation({
    mutationFn: (payload: QuickEntryPayload) => batchesApi.quickEntry(payload),
    onSuccess: (data) => {
      showToast(
        `Lote ${data.batch.batch_number} registrado para ${data.product.name}`,
        'success',
        'Ingreso Exitoso'
      );
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      showToast(extractErrorMessage(err), 'error', 'Error al Ingresar Lote');
    },
  });

  const handleSubmit = () => {
    if (!selectedBranch) {
      showToast('Debe seleccionar una sucursal activa', 'warning');
      return;
    }

    if (!barcode.trim()) {
      showToast('El código de barras es obligatorio', 'warning');
      return;
    }

    const parsedQty = parseFloat(quantity);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      showToast('Ingrese una cantidad válida mayor a 0', 'warning');
      return;
    }

    const payload: QuickEntryPayload = {
      branch_id: selectedBranch.id,
      barcode: barcode.trim(),
      quantity: parsedQty,
      name: name.trim() || undefined,
      unit: unit.trim() || 'UND',
      expiration_date: expirationDate.trim() || null,
      cost_price: costPrice ? parseFloat(costPrice) : undefined,
      sale_price: salePrice ? parseFloat(salePrice) : undefined,
    };

    quickEntryMutation.mutate(payload);
  };

  // Atajos para fecha de vencimiento
  const setQuickExpiry = (daysFromNow: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    const iso = d.toISOString().split('T')[0];
    setExpirationDate(iso);
  };

  return (
    <ModalWrapper
      visible={visible}
      onClose={onClose}
      title="Alta Rápida de Inventario"
      subtitle={selectedBranch ? `Sucursal: ${selectedBranch.name}` : undefined}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Código de barras */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>
            Código de Barras <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.inputContainer}>
            <Ionicons name="barcode-outline" size={20} color="#64748b" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Ejem. 775012345678"
              value={barcode}
              onChangeText={setBarcode}
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* Nombre del producto */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Nombre del Producto</Text>
          <TextInput
            style={styles.textInput}
            placeholder="Ejem. Arroz Costeño 1kg (obligatorio si es nuevo)"
            value={name}
            onChangeText={setName}
            placeholderTextColor="#94a3b8"
          />
        </View>

        {/* Cantidad y Unidad */}
        <View style={styles.row}>
          <View style={[styles.fieldGroup, { flex: 2, marginRight: 8 }]}>
            <Text style={styles.label}>
              Cantidad a Ingresar <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.textInput, styles.highlightInput]}
              placeholder="1"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="decimal-pad"
              placeholderTextColor="#94a3b8"
              autoFocus={visible}
            />
          </View>

          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={styles.label}>Unidad</Text>
            <TextInput
              style={styles.textInput}
              placeholder="UND"
              value={unit}
              onChangeText={setUnit}
              autoCapitalize="characters"
              placeholderTextColor="#94a3b8"
            />
          </View>
        </View>

        {/* Fecha de Vencimiento */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Fecha de Vencimiento (YYYY-MM-DD)</Text>
          <View style={styles.inputContainer}>
            <Ionicons name="calendar-outline" size={20} color="#64748b" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="2026-12-31 (Opcional)"
              value={expirationDate}
              onChangeText={setExpirationDate}
              placeholderTextColor="#94a3b8"
            />
          </View>
          {/* Botones de fecha rápida */}
          <View style={styles.quickDateRow}>
            <TouchableOpacity onPress={() => setQuickExpiry(30)} style={styles.quickDateChip}>
              <Text style={styles.quickDateText}>+1 Mes</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setQuickExpiry(90)} style={styles.quickDateChip}>
              <Text style={styles.quickDateText}>+3 Meses</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setQuickExpiry(180)} style={styles.quickDateChip}>
              <Text style={styles.quickDateText}>+6 Meses</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setQuickExpiry(365)} style={styles.quickDateChip}>
              <Text style={styles.quickDateText}>+1 Año</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Precios (Opcionales, se heredan si ya existen) */}
        <View style={styles.row}>
          <View style={[styles.fieldGroup, { flex: 1, marginRight: 8 }]}>
            <Text style={styles.label}>Costo Unitario (S/)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Heredar previo"
              value={costPrice}
              onChangeText={setCostPrice}
              keyboardType="decimal-pad"
              placeholderTextColor="#94a3b8"
            />
          </View>

          <View style={[styles.fieldGroup, { flex: 1 }]}>
            <Text style={styles.label}>Precio Venta (S/)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Heredar previo"
              value={salePrice}
              onChangeText={setSalePrice}
              keyboardType="decimal-pad"
              placeholderTextColor="#94a3b8"
            />
          </View>
        </View>

        {/* Botón de acción */}
        <TouchableOpacity
          style={[styles.submitButton, quickEntryMutation.isPending && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={quickEntryMutation.isPending}
          activeOpacity={0.8}
        >
          {quickEntryMutation.isPending ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={20} color="#ffffff" />
              <Text style={styles.submitButtonText}>Ingresar Lote a Stock</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </ModalWrapper>
  );
};

const styles = StyleSheet.create({
  scroll: {
    paddingBottom: 16,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  required: {
    color: '#ef4444',
  },
  row: {
    flexDirection: 'row',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 44,
    fontSize: 15,
    color: '#0f172a',
  },
  textInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#0f172a',
  },
  highlightInput: {
    borderColor: '#0284c7',
    fontWeight: '700',
    fontSize: 17,
  },
  quickDateRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  quickDateChip: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  quickDateText: {
    fontSize: 11,
    color: '#0284c7',
    fontWeight: '600',
  },
  submitButton: {
    height: 48,
    backgroundColor: '#0284c7',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});

