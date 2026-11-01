import React, { memo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CartItem } from '../types';
import { formatCurrency, formatQuantity } from '../utils/formatters';

export const CART_ITEM_ROW_HEIGHT = 88;

interface CartItemRowProps {
  item: CartItem;
  onIncrement: (productId: string) => void;
  onDecrement: (productId: string) => void;
  onRemove: (productId: string) => void;
}

export const CartItemRow: React.FC<CartItemRowProps> = memo(
  ({ item, onIncrement, onDecrement, onRemove }) => {
    const { product, quantity, subtotal } = item;
    const maxStock = product.stock;
    const isAtMaxStock = quantity >= maxStock;

    return (
      <View style={styles.container}>
        {/* Info del producto */}
        <View style={styles.infoCol}>
          <Text style={styles.name} numberOfLines={1} ellipsizeMode="tail">
            {product.name}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.unitPrice}>{formatCurrency(product.sale_price)} c/u</Text>
            <Text style={styles.stockNote}>
              • Stock: {formatQuantity(maxStock, product.unit)}
            </Text>
          </View>
        </View>

        {/* Controles de cantidad táctil (+ / -) */}
        <View style={styles.stepperContainer}>
          <TouchableOpacity
            style={styles.stepBtn}
            onPress={() => onDecrement(product.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="remove" size={18} color="#0f172a" />
          </TouchableOpacity>

          <View style={styles.qtyBox}>
            <Text style={styles.qtyText}>{quantity}</Text>
          </View>

          <TouchableOpacity
            style={[styles.stepBtn, isAtMaxStock && styles.stepBtnDisabled]}
            onPress={() => onIncrement(product.id)}
            disabled={isAtMaxStock}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name="add"
              size={18}
              color={isAtMaxStock ? '#94a3b8' : '#0f172a'}
            />
          </TouchableOpacity>
        </View>

        {/* Subtotal de línea */}
        <View style={styles.subtotalCol}>
          <Text style={styles.subtotalText}>{formatCurrency(subtotal)}</Text>
        </View>

        {/* Botón eliminar */}
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => onRemove(product.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="trash-outline" size={18} color="#ef4444" />
        </TouchableOpacity>
      </View>
    );
  }
);

CartItemRow.displayName = 'CartItemRow';

const styles = StyleSheet.create({
  container: {
    height: CART_ITEM_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  infoCol: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  unitPrice: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  stockNote: {
    fontSize: 11,
    color: '#0284c7',
    fontWeight: '600',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 2,
    marginRight: 10,
  },
  stepBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
  stepBtnDisabled: {
    backgroundColor: '#f1f5f9',
  },
  qtyBox: {
    minWidth: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  qtyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtotalCol: {
    minWidth: 70,
    alignItems: 'flex-end',
    marginRight: 8,
  },
  subtotalText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  deleteBtn: {
    padding: 6,
    borderRadius: 6,
  },
});

