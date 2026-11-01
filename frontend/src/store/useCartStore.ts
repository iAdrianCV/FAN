import { create } from 'zustand';
import { CartItem, ProductWithStock } from '../types';

interface CartState {
  items: CartItem[];
  discount: number;

  addItem: (product: ProductWithStock, qty?: number) => { success: boolean; message?: string };
  updateQuantity: (productId: string, quantity: number) => { success: boolean; message?: string };
  removeItem: (productId: string) => void;
  setDiscount: (discount: number) => void;
  clearCart: () => void;

  // Calculados
  getTotalItems: () => number;
  getSubtotal: () => number;
  getTax: () => number;
  getTotal: () => number;
  getItemByProductId: (productId: string) => CartItem | undefined;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  discount: 0,

  addItem: (product: ProductWithStock, qty = 1) => {
    if (qty <= 0) return { success: false, message: 'La cantidad debe ser mayor a 0' };

    const availableStock = product.stock;
    const existing = get().items.find((i) => i.product.id === product.id);
    const currentQty = existing ? existing.quantity : 0;
    const newQty = currentQty + qty;

    if (newQty > availableStock) {
      return {
        success: false,
        message: `Stock insuficiente. Disponible: ${availableStock} ${product.unit}`,
      };
    }

    const price = product.sale_price ?? 0;

    if (existing) {
      set((state) => ({
        items: state.items.map((i) =>
          i.product.id === product.id
            ? {
                ...i,
                quantity: newQty,
                subtotal: parseFloat((newQty * price).toFixed(2)),
              }
            : i
        ),
      }));
    } else {
      set((state) => ({
        items: [
          ...state.items,
          {
            product,
            quantity: qty,
            subtotal: parseFloat((qty * price).toFixed(2)),
          },
        ],
      }));
    }

    return { success: true };
  },

  updateQuantity: (productId: string, quantity: number) => {
    if (quantity <= 0) {
      get().removeItem(productId);
      return { success: true };
    }

    const item = get().items.find((i) => i.product.id === productId);
    if (!item) return { success: false, message: 'Producto no encontrado en el carrito' };

    const maxStock = item.product.stock;
    if (quantity > maxStock) {
      return {
        success: false,
        message: `No se puede superar el stock disponible de ${maxStock} ${item.product.unit}`,
      };
    }

    const price = item.product.sale_price ?? 0;

    set((state) => ({
      items: state.items.map((i) =>
        i.product.id === productId
          ? {
              ...i,
              quantity,
              subtotal: parseFloat((quantity * price).toFixed(2)),
            }
          : i
      ),
    }));

    return { success: true };
  },

  removeItem: (productId: string) => {
    set((state) => ({
      items: state.items.filter((i) => i.product.id !== productId),
    }));
  },

  setDiscount: (discount: number) => {
    const safeDiscount = Math.max(0, isNaN(discount) ? 0 : discount);
    set({ discount: parseFloat(safeDiscount.toFixed(2)) });
  },

  clearCart: () => {
    set({ items: [], discount: 0 });
  },

  getItemByProductId: (productId: string) => {
    return get().items.find((i) => i.product.id === productId);
  },

  getSubtotal: () => {
    const rawTotal = get().items.reduce((acc, curr) => acc + curr.subtotal, 0);
    return parseFloat(rawTotal.toFixed(2));
  },

  getTax: () => {
    // 18% IGV incluido (Perú)
    const gross = get().getSubtotal() - get().discount;
    if (gross <= 0) return 0;
    const subtotalNet = gross / 1.18;
    return parseFloat((gross - subtotalNet).toFixed(2));
  },

  getTotal: () => {
    const gross = get().getSubtotal();
    const discount = get().discount;
    const total = Math.max(0, gross - discount);
    return parseFloat(total.toFixed(2));
  },

  getTotalItems: () => {
    return get().items.reduce((acc, curr) => acc + curr.quantity, 0);
  },
}));

