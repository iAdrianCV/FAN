import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { batchesApi, productsApi } from '../../api';
import { BarcodeScannerModal } from '../../components/BarcodeScannerModal';
import { useAuthStore } from '../../store/useAuthStore';
import { useUIStore } from '../../store/useUIStore';
import { QuickEntryPayload } from '../../types';
import { extractErrorMessage } from '../../utils/errors';
import { formatCurrency } from '../../utils/formatters';

interface BatchReceiveScreenProps {
  onBack?: () => void;
}

export const BatchReceiveScreen: React.FC<BatchReceiveScreenProps> = ({ onBack }) => {
  const queryClient = useQueryClient();
  const selectedBranch = useAuthStore((state) => state.selectedBranch);
  const showToast = useUIStore((state) => state.showToast);

  const [barcode, setBarcode] = useState('');
  const [productName, setProductName] = useState('');
  const [isExistingProduct, setIsExistingProduct] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [unit, setUnit] = useState('UND');
  const [batchNumber, setBatchNumber] = useState('');

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isSearchingProduct, setIsSearchingProduct] = useState(false);

  const handleBarcodeLookup = async (code: string) => {
    setBarcode(code);
    if (!selectedBranch || !code.trim()) return;

    setIsSearchingProduct(true);
    try {
      const prod = await productsApi.getByBarcode(code.trim(), selectedBranch.id);
      setProductName(prod.name);
      setUnit(prod.unit);
      setIsExistingProduct(true);
      if (prod.last_cost_price) {
        setCostPrice(prod.last_cost_price.toString());
      }
      if (prod.sale_price) {
        setSalePrice(prod.sale_price.toString());
      }
      showToast(`Producto encontrado: ${prod.name}`, 'info', 'Producto Existente');
    } catch {
      setIsExistingProduct(false);
      setProductName('');
      showToast('Código nuevo. Ingrese el nombre para registrarlo.', 'info', 'Nuevo Producto');
    } finally {
      setIsSearchingProduct(false);
    }
  };

  const receiveMutation = useMutation({
    mutationFn: (payload: QuickEntryPayload) => batchesApi.quickEntry(payload),
    onSuccess: (data) => {
      showToast(
        `Lote ${data.batch.batch_number} (${data.batch.current_quantity} ${data.product.unit}) ingresado exitosamente.`,
        'success',
        'Ingreso Registrado'
      );
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });

      // Limpiar formulario para el siguiente ingreso
      setBarcode('');
      setProductName('');
      setQuantity('');
      setExpirationDate('');
      setCostPrice('');
      setSalePrice('');
      setBatchNumber('');
      setIsExistingProduct(false);
    },
    onError: (err) => {
      showToast(extractErrorMessage(err), 'error', 'Error al Recibir Lote');
    },
  });

  const handleSubmit = () => {
    if (!selectedBranch) {
      showToast('Debe tener una sucursal seleccionada', 'warning');
      return;
    }

    if (!barcode.trim()) {
      showToast('El código de barras es requerido', 'warning');
      return;
    }

    if (!isExistingProduct && !productName.trim()) {
      showToast('Debe ingresar el nombre del producto nuevo', 'warning');
      return;
    }

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      showToast('Ingrese una cantidad válida mayor a 0', 'warning');
      return;
    }

    const payload: QuickEntryPayload = {
      branch_id: selectedBranch.id,
      barcode: barcode.trim(),
      name: productName.trim() || undefined,
      quantity: qty,
      unit: unit.trim() || 'UND',
      expiration_date: expirationDate.trim() || null,
      cost_price: costPrice ? parseFloat(costPrice) : undefined,
      sale_price: salePrice ? parseFloat(salePrice) : undefined,
      batch_number: batchNumber.trim() || undefined,
    };

    receiveMutation.mutate(payload);
  };

  const setPresetDate = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setExpirationDate(d.toISOString().split('T')[0]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#0f172a" />
          </TouchableOpacity>
        ) : null}
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Recepción de Mercadería</Text>
          <Text style={styles.headerSubtitle}>
            Ingreso por lotes y trazabilidad FEFO • {selectedBranch?.name}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Sección Código de Barras con botón Escáner */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>1. Identificación del Producto</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Código de Barras <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.barcodeRow}>
              <View style={styles.barcodeInputWrapper}>
                <Ionicons name="barcode-outline" size={20} color="#64748b" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.barcodeInput}
                  placeholder="Escanea o escribe el código..."
                  value={barcode}
                  onChangeText={setBarcode}
                  onSubmitEditing={() => handleBarcodeLookup(barcode)}
                  placeholderTextColor="#94a3b8"
                />
              </View>

              <TouchableOpacity
                style={styles.scanBtn}
                onPress={() => setIsScannerOpen(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="camera-outline" size={20} color="#ffffff" />
                <Text style={styles.scanBtnText}>Escanear</Text>
              </TouchableOpacity>
            </View>
          </View>

          {isSearchingProduct ? (
            <View style={styles.loadingProduct}>
              <ActivityIndicator size="small" color="#0284c7" />
              <Text style={styles.loadingProductText}>Buscando producto en catálogo...</Text>
            </View>
          ) : null}

          {/* Nombre del producto */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Descripción del Producto{' '}
              {!isExistingProduct ? <Text style={styles.required}>*</Text> : '(Existente)'}
            </Text>
            <TextInput
              style={[styles.input, isExistingProduct && styles.inputLocked]}
              placeholder="Ejem. Aceite Primor 1L"
              value={productName}
              onChangeText={setProductName}
              placeholderTextColor="#94a3b8"
              editable={!isExistingProduct}
            />
          </View>
        </View>

        {/* Sección Datos del Lote */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>2. Datos del Lote y Stock</Text>

          <View style={styles.row}>
            <View style={[styles.fieldGroup, { flex: 2, marginRight: 10 }]}>
              <Text style={styles.label}>
                Cantidad a Ingresar <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, styles.qtyInput]}
                placeholder="10"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
                placeholderTextColor="#94a3b8"
              />
            </View>

            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.label}>Unidad</Text>
              <TextInput
                style={styles.input}
                placeholder="UND"
                value={unit}
                onChangeText={setUnit}
                autoCapitalize="characters"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>

          {/* Fecha de vencimiento */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Fecha de Vencimiento (YYYY-MM-DD)</Text>
            <View style={styles.barcodeInputWrapper}>
              <Ionicons name="calendar-outline" size={18} color="#64748b" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.barcodeInput}
                placeholder="2026-12-31"
                value={expirationDate}
                onChangeText={setExpirationDate}
                placeholderTextColor="#94a3b8"
              />
            </View>

            {/* Presets de fecha */}
            <View style={styles.presetsRow}>
              <TouchableOpacity onPress={() => setPresetDate(30)} style={styles.presetChip}>
                <Text style={styles.presetText}>+30 días</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setPresetDate(90)} style={styles.presetChip}>
                <Text style={styles.presetText}>+90 días</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setPresetDate(180)} style={styles.presetChip}>
                <Text style={styles.presetText}>+6 meses</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setPresetDate(365)} style={styles.presetChip}>
                <Text style={styles.presetText}>+1 año</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Número de lote opcional */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>N° de Lote (opcional, auto-generado si se omite)</Text>
            <TextInput
              style={styles.input}
              placeholder="LOT-AAAAMMDD-XXXX"
              value={batchNumber}
              onChangeText={setBatchNumber}
              placeholderTextColor="#94a3b8"
            />
          </View>
        </View>

        {/* Sección Costos y Precios */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>3. Precios y Valuación</Text>

          <View style={styles.row}>
            <View style={[styles.fieldGroup, { flex: 1, marginRight: 10 }]}>
              <Text style={styles.label}>Costo Unitario (S/)</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                value={costPrice}
                onChangeText={setCostPrice}
                keyboardType="decimal-pad"
                placeholderTextColor="#94a3b8"
              />
            </View>

            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={styles.label}>Precio Venta (S/)</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                value={salePrice}
                onChangeText={setSalePrice}
                keyboardType="decimal-pad"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>
        </View>

        {/* Botón Guardar Recepción */}
        <TouchableOpacity
          style={[styles.submitBtn, receiveMutation.isPending && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={receiveMutation.isPending}
          activeOpacity={0.8}
        >
          {receiveMutation.isPending ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={22} color="#ffffff" />
              <Text style={styles.submitBtnText}>Confirmar e Ingresar a Stock</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      <BarcodeScannerModal
        visible={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeLookup}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backBtn: {
    padding: 6,
    marginRight: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0284c7',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  fieldGroup: {
    marginBottom: 12,
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
  barcodeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  barcodeInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 46,
  },
  barcodeInput: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a',
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: 'center',
  },
  scanBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  loadingProduct: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 6,
  },
  loadingProductText: {
    fontSize: 13,
    color: '#0284c7',
  },
  input: {
    height: 46,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#0f172a',
  },
  inputLocked: {
    backgroundColor: '#f1f5f9',
    color: '#475569',
    fontWeight: '600',
  },
  qtyInput: {
    fontWeight: '700',
    fontSize: 18,
    borderColor: '#0284c7',
  },
  row: {
    flexDirection: 'row',
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  presetChip: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  presetText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0369a1',
  },
  submitBtn: {
    height: 52,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});

