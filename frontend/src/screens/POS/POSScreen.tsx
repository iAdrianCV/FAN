import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { alertsApi, productsApi } from '../../api';
import { BarcodeScannerModal } from '../../components/BarcodeScannerModal';
import { CART_ITEM_ROW_HEIGHT, CartItemRow } from '../../components/CartItemRow';
import { useAuthStore } from '../../store/useAuthStore';
import { useCartStore } from '../../store/useCartStore';
import { useUIStore } from '../../store/useUIStore';
import { CartItem, ProductWithStock } from '../../types';
import { extractErrorMessage } from '../../utils/errors';
import { formatCurrency, formatQuantity } from '../../utils/formatters';
import { CheckoutModal } from './CheckoutModal';
import { QuickAddModal } from './QuickAddModal';

const PRODUCT_ITEM_HEIGHT = 80;

export const POSScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const selectedBranch = useAuthStore((state) => state.selectedBranch);
  const isOnline = useUIStore((state) => state.isOnline);
  const showToast = useUIStore((state) => state.showToast);

  const { items, addItem, updateQuantity, removeItem, clearCart, getTotal, getTotalItems } =
    useCartStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddBarcode, setQuickAddBarcode] = useState('');
  const [isCartExpanded, setIsCartExpanded] = useState(false);

  // Debounce de 300ms para el input de búsqueda manual
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Consulta de productos con stock consolidado en la sucursal activa
  const {
    data: productsPage,
    isLoading: isProductsLoading,
    refetch: refetchProducts,
  } = useQuery({
    queryKey: ['products', selectedBranch?.id, debouncedQuery],
    queryFn: () =>
      selectedBranch
        ? productsApi.search({
            branch_id: selectedBranch.id,
            q: debouncedQuery.trim() || undefined,
            limit: 40,
          })
        : Promise.resolve({ items: [], total: 0, offset: 0, limit: 40 }),
    enabled: !!selectedBranch,
  });

  // Conteo de alertas pendientes para el badge superior
  const { data: alertCounts } = useQuery({
    queryKey: ['alerts-count', selectedBranch?.id],
    queryFn: () => alertsApi.count(selectedBranch?.id),
    enabled: !!selectedBranch,
    refetchInterval: 30000, // cada 30 segundos
  });

  // Manejo de lectura de código de barras desde el escáner
  const handleBarcodeScanned = async (barcode: string) => {
    if (!selectedBranch) {
      showToast('Seleccione una sucursal primero', 'warning');
      return;
    }

    try {
      // 1. Buscar producto por código de barras
      const product = await productsApi.getByBarcode(barcode, selectedBranch.id);

      if (product.stock <= 0) {
        showToast(
          `'${product.name}' no tiene stock disponible para la venta`,
          'warning',
          'Stock Agotado'
        );
        return;
      }

      // 2. Intentar agregar al carrito
      const result = addItem(product, 1);
      if (result.success) {
        showToast(`+1 ${product.name} agregado`, 'success', 'Producto Añadido', 1800);
      } else {
        showToast(result.message || 'No se pudo agregar al carrito', 'warning', 'Límite de Stock');
      }
    } catch (err) {
      // 3. Si no existe (404), sugerir alta rápida inmediata
      const msg = extractErrorMessage(err);
      if (msg.includes('No existe un producto') || msg.includes('no encontrado')) {
        setQuickAddBarcode(barcode);
        setIsQuickAddOpen(true);
        showToast(
          `Código ${barcode} no registrado. Ingrese los datos para darlo de alta.`,
          'info',
          'Nuevo Producto'
        );
      } else {
        showToast(msg, 'error', 'Error al Buscar');
      }
    }
  };

  const handleProductPress = (product: ProductWithStock) => {
    if (product.stock <= 0) {
      showToast(
        `'${product.name}' no tiene stock vendible disponible`,
        'warning',
        'Sin Existencias'
      );
      return;
    }
    const res = addItem(product, 1);
    if (!res.success) {
      showToast(res.message || 'Límite de stock alcanzado', 'warning');
    }
  };

  // Optimización de FlatList de productos
  const renderProductItem = useCallback(
    ({ item }: { item: ProductWithStock }) => {
      const isOutOfStock = item.stock <= 0;
      const inCart = items.find((i) => i.product.id === item.id);

      return (
        <TouchableOpacity
          style={[styles.productCard, isOutOfStock && styles.productCardDisabled]}
          onPress={() => handleProductPress(item)}
          activeOpacity={isOutOfStock ? 1 : 0.7}
        >
          <View style={styles.productInfo}>
            <Text style={styles.productName} numberOfLines={2}>
              {item.name}
            </Text>
            <View style={styles.productMeta}>
              <Text style={styles.productBarcode}>{item.barcode}</Text>
              <Text
                style={[
                  styles.productStock,
                  isOutOfStock ? styles.stockEmpty : styles.stockAvailable,
                ]}
              >
                Stock: {formatQuantity(item.stock, item.unit)}
              </Text>
            </View>
          </View>

          <View style={styles.productPriceCol}>
            <Text style={styles.productPrice}>{formatCurrency(item.sale_price)}</Text>
            {inCart ? (
              <View style={styles.inCartBadge}>
                <Text style={styles.inCartBadgeText}>{inCart.quantity} en carrito</Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      );
    },
    [items]
  );

  const getProductItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: PRODUCT_ITEM_HEIGHT,
      offset: PRODUCT_ITEM_HEIGHT * index,
      index,
    }),
    []
  );

  // Optimización de FlatList de carrito
  const getCartItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: CART_ITEM_ROW_HEIGHT,
      offset: CART_ITEM_ROW_HEIGHT * index,
      index,
    }),
    []
  );

  const totalCartAmount = getTotal();
  const totalCartCount = getTotalItems();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* 1. BARRA SUPERIOR: Sucursal, Estado de Red, Alertas Badge */}
      <View style={styles.topBar}>
        <View style={styles.branchBadge}>
          <Ionicons name="business" size={16} color="#0284c7" />
          <Text style={styles.branchName} numberOfLines={1}>
            {selectedBranch ? selectedBranch.name : 'Sin Sucursal'}
          </Text>
        </View>

        <View style={styles.topRight}>
          {/* Indicador de Red */}
          <View style={[styles.networkDot, isOnline ? styles.networkOnline : styles.networkOffline]}>
            <Ionicons
              name={isOnline ? 'cloud-done-outline' : 'cloud-offline-outline'}
              size={14}
              color={isOnline ? '#16a34a' : '#dc2626'}
            />
          </View>

          {/* Badge Alertas Pendientes */}
          <View style={styles.alertIndicator}>
            <Ionicons name="notifications-outline" size={18} color="#64748b" />
            {alertCounts && alertCounts.total > 0 ? (
              <View
                style={[
                  styles.badgePill,
                  alertCounts.high > 0 ? styles.badgeHigh : styles.badgeMedium,
                ]}
              >
                <Text style={styles.badgePillText}>{alertCounts.total}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {/* 2. BUSCADOR + BOTÓN FLOTANTE/HEADER DE ESCÁNER */}
      <View style={styles.searchSection}>
        <View style={styles.searchInputWrapper}>
          <Ionicons name="search-outline" size={18} color="#94a3b8" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nombre, SKU o código..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
              <Ionicons name="close-circle" size={18} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          style={styles.scanButton}
          onPress={() => setIsScannerOpen(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="barcode-outline" size={22} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* 3. LISTADO PRINCIPAL DE PRODUCTOS / CATÁLOGO */}
      <View style={styles.mainContent}>
        {isProductsLoading ? (
          <View style={styles.centerSpinner}>
            <ActivityIndicator size="large" color="#0284c7" />
            <Text style={styles.spinnerText}>Cargando catálogo...</Text>
          </View>
        ) : (
          <FlatList
            data={productsPage?.items || []}
            keyExtractor={(item) => item.id}
            renderItem={renderProductItem}
            getItemLayout={getProductItemLayout}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.productList}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="cube-outline" size={48} color="#cbd5e1" />
                <Text style={styles.emptyTitle}>No hay productos encontrados</Text>
                <Text style={styles.emptySub}>
                  {debouncedQuery
                    ? `No coincide ningún producto con "${debouncedQuery}"`
                    : 'No hay productos en esta sucursal'}
                </Text>
                {debouncedQuery ? (
                  <TouchableOpacity
                    style={styles.quickAddBtn}
                    onPress={() => {
                      setQuickAddBarcode(debouncedQuery);
                      setIsQuickAddOpen(true);
                    }}
                  >
                    <Ionicons name="add" size={18} color="#0284c7" />
                    <Text style={styles.quickAddBtnText}>Dar de alta "{debouncedQuery}"</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            }
          />
        )}
      </View>

      {/* 4. PANEL DE CARRITO INFERIOR (COLLAPSIBLE O EXPANDIDO) */}
      <View style={[styles.cartDrawer, isCartExpanded && styles.cartDrawerExpanded]}>
        {/* Cabecera del Carrito / Botón de Toggle */}
        <TouchableOpacity
          style={styles.cartHeader}
          onPress={() => setIsCartExpanded((prev) => !prev)}
          activeOpacity={0.9}
        >
          <View style={styles.cartHeaderLeft}>
            <View style={styles.cartBadgeCount}>
              <Ionicons name="cart" size={18} color="#ffffff" />
              <Text style={styles.cartBadgeText}>{totalCartCount}</Text>
            </View>
            <Text style={styles.cartHeaderTitle}>Carrito de Venta</Text>
            <Ionicons
              name={isCartExpanded ? 'chevron-down' : 'chevron-up'}
              size={18}
              color="#64748b"
            />
          </View>

          <View style={styles.cartHeaderRight}>
            <Text style={styles.cartHeaderTotal}>{formatCurrency(totalCartAmount)}</Text>
          </View>
        </TouchableOpacity>

        {/* Lista de Items del Carrito cuando está expandido */}
        {isCartExpanded ? (
          <View style={styles.cartListContainer}>
            {items.length === 0 ? (
              <View style={styles.cartEmpty}>
                <Text style={styles.cartEmptyText}>El carrito está vacío</Text>
              </View>
            ) : (
              <FlatList
                data={items}
                keyExtractor={(item) => item.product.id}
                renderItem={({ item }) => (
                  <CartItemRow
                    item={item}
                    onIncrement={(id) => {
                      const it = items.find((x) => x.product.id === id);
                      if (it) addItem(it.product, 1);
                    }}
                    onDecrement={(id) => {
                      const it = items.find((x) => x.product.id === id);
                      if (it) updateQuantity(id, it.quantity - 1);
                    }}
                    onRemove={removeItem}
                  />
                )}
                getItemLayout={getCartItemLayout}
                showsVerticalScrollIndicator={true}
              />
            )}
          </View>
        ) : null}

        {/* Botones de Acción del Carrito */}
        <View style={styles.cartActionsRow}>
          {items.length > 0 ? (
            <TouchableOpacity
              style={styles.clearCartBtn}
              onPress={clearCart}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={20} color="#64748b" />
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[
              styles.checkoutBtn,
              (items.length === 0 || totalCartAmount <= 0) && styles.checkoutBtnDisabled,
            ]}
            onPress={() => setIsCheckoutOpen(true)}
            disabled={items.length === 0 || totalCartAmount <= 0}
            activeOpacity={0.8}
          >
            <Ionicons name="wallet-outline" size={20} color="#ffffff" />
            <Text style={styles.checkoutBtnText}>
              Cobrar {formatCurrency(totalCartAmount)}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 5. MODALES: Escáner, Alta Rápida y Checkout */}
      <BarcodeScannerModal
        visible={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeScanned}
      />

      <QuickAddModal
        visible={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        initialBarcode={quickAddBarcode}
        onSuccess={() => refetchProducts()}
      />

      <CheckoutModal
        visible={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        onSuccess={(receipt) => {
          showToast(
            `Comprobante ${receipt.series}-${receipt.number} emitido. Total: ${formatCurrency(
              receipt.total
            )}${receipt.change > 0 ? ` (Vuelto: ${formatCurrency(receipt.change)})` : ''}`,
            'success',
            'Venta Registrada Exitosamente',
            5000
          );
        }}
      />
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  branchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    maxWidth: '65%',
  },
  branchName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0369a1',
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  networkDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  networkOnline: {
    backgroundColor: '#dcfce7',
  },
  networkOffline: {
    backgroundColor: '#fee2e2',
  },
  alertIndicator: {
    position: 'relative',
    padding: 4,
  },
  badgePill: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeHigh: {
    backgroundColor: '#ef4444',
  },
  badgeMedium: {
    backgroundColor: '#f59e0b',
  },
  badgePillText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    backgroundColor: '#ffffff',
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0f172a',
  },
  clearBtn: {
    padding: 4,
  },
  scanButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  mainContent: {
    flex: 1,
  },
  productList: {
    padding: 12,
    paddingBottom: 120,
  },
  productCard: {
    height: PRODUCT_ITEM_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  productCardDisabled: {
    opacity: 0.6,
    backgroundColor: '#f8fafc',
  },
  productInfo: {
    flex: 1,
    marginRight: 12,
  },
  productName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  productMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  productBarcode: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  productStock: {
    fontSize: 12,
    fontWeight: '700',
  },
  stockAvailable: {
    color: '#16a34a',
  },
  stockEmpty: {
    color: '#ef4444',
  },
  productPriceCol: {
    alignItems: 'flex-end',
  },
  productPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  inCartBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  inCartBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#166534',
  },
  centerSpinner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  spinnerText: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 10,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
    marginTop: 12,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 16,
  },
  quickAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  quickAddBtnText: {
    color: '#0284c7',
    fontWeight: '700',
    fontSize: 13,
  },
  cartDrawer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  cartDrawerExpanded: {
    maxHeight: '65%',
  },
  cartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  cartHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cartBadgeCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0f172a',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  cartBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  cartHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  cartHeaderRight: {},
  cartHeaderTotal: {
    fontSize: 18,
    fontWeight: '800',
    color: '#16a34a',
  },
  cartListContainer: {
    maxHeight: 220,
  },
  cartEmpty: {
    padding: 24,
    alignItems: 'center',
  },
  cartEmptyText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  cartActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
  },
  clearCartBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutBtn: {
    flex: 1,
    height: 48,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  checkoutBtnDisabled: {
    backgroundColor: '#cbd5e1',
  },
  checkoutBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});

