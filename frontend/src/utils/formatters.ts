/**
 * Formateadores de moneda (Soles peruanos S/), cantidades y fechas FEFO.
 */

export const formatCurrency = (amount: number | null | undefined): string => {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return 'S/ 0.00';
  }
  return `S/ ${amount.toFixed(2)}`;
};

export const formatQuantity = (qty: number | null | undefined, unit: string = 'UND'): string => {
  if (qty === null || qty === undefined || isNaN(qty)) {
    return `0 ${unit}`;
  }
  // Si es entero no mostrar decimales, si tiene decimales mostrar hasta 3 decimales sin ceros superfluos
  const formatted = Number.isInteger(qty) ? qty.toString() : parseFloat(qty.toFixed(3)).toString();
  return `${formatted} ${unit}`;
};

export const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return 'Sin fecha';
  try {
    // Si viene como YYYY-MM-DD o ISO
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return `${day}/${month}/${year}`;
    }
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

export const formatDateTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
};

export interface ExpiryStatus {
  label: string;
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysRemaining: number | null;
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'OK';
}

export const getExpiryStatus = (expirationDate: string | null | undefined): ExpiryStatus => {
  if (!expirationDate) {
    return {
      label: 'Sin vencimiento',
      isExpired: false,
      isExpiringSoon: false,
      daysRemaining: null,
      severity: 'OK',
    };
  }

  try {
    const expParts = expirationDate.split('T')[0].split('-');
    const expDate = new Date(parseInt(expParts[0], 10), parseInt(expParts[1], 10) - 1, parseInt(expParts[2], 10));
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const diffMs = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        label: `Vencido (${Math.abs(diffDays)}d)`,
        isExpired: true,
        isExpiringSoon: false,
        daysRemaining: diffDays,
        severity: 'HIGH',
      };
    } else if (diffDays === 0) {
      return {
        label: 'Vence hoy',
        isExpired: false,
        isExpiringSoon: true,
        daysRemaining: 0,
        severity: 'HIGH',
      };
    } else if (diffDays <= 15) {
      return {
        label: `Vence en ${diffDays} días`,
        isExpired: false,
        isExpiringSoon: true,
        daysRemaining: diffDays,
        severity: 'MEDIUM',
      };
    }

    return {
      label: `${diffDays} días restantes`,
      isExpired: false,
      isExpiringSoon: false,
      daysRemaining: diffDays,
      severity: 'OK',
    };
  } catch {
    return {
      label: expirationDate,
      isExpired: false,
      isExpiringSoon: false,
      daysRemaining: null,
      severity: 'OK',
    };
  }
};

