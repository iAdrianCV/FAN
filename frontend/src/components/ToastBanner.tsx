import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useUIStore } from '../store/useUIStore';

export const ToastBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { toast, hideToast } = useUIStore();

  if (!toast) return null;

  const getStyleConfig = () => {
    switch (toast.type) {
      case 'error':
        return {
          bgColor: '#fee2e2',
          borderColor: '#ef4444',
          textColor: '#991b1b',
          iconName: 'alert-circle' as const,
          iconColor: '#dc2626',
        };
      case 'warning':
        return {
          bgColor: '#fef3c7',
          borderColor: '#f59e0b',
          textColor: '#92400e',
          iconName: 'warning' as const,
          iconColor: '#d97706',
        };
      case 'success':
        return {
          bgColor: '#dcfce7',
          borderColor: '#22c55e',
          textColor: '#166534',
          iconName: 'checkmark-circle' as const,
          iconColor: '#16a34a',
        };
      case 'info':
      default:
        return {
          bgColor: '#e0f2fe',
          borderColor: '#0284c7',
          textColor: '#075985',
          iconName: 'information-circle' as const,
          iconColor: '#0284c7',
        };
    }
  };

  const config = getStyleConfig();

  return (
    <View style={[styles.container, { top: insets.top + 8 }]}>
      <View
        style={[
          styles.content,
          {
            backgroundColor: config.bgColor,
            borderColor: config.borderColor,
          },
        ]}
      >
        <Ionicons name={config.iconName} size={22} color={config.iconColor} style={styles.icon} />
        <View style={styles.textContainer}>
          {toast.title ? (
            <Text style={[styles.title, { color: config.textColor }]}>{toast.title}</Text>
          ) : null}
          <Text style={[styles.message, { color: config.textColor }]}>{toast.message}</Text>
        </View>
        <TouchableOpacity onPress={hideToast} style={styles.closeButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={18} color={config.textColor} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  icon: {
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 2,
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  closeButton: {
    padding: 4,
  },
});

