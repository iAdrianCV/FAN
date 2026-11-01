import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ModalWrapperProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: number;
}

export const ModalWrapper: React.FC<ModalWrapperProps> = ({
  visible,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 600,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardView}
          >
            <TouchableWithoutFeedback>
              <View style={[styles.dialog, { maxWidth }]}>
                {/* Header */}
                <View style={styles.header}>
                  <View style={styles.titleContainer}>
                    <Text style={styles.title}>{title}</Text>
                    {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                  </View>
                  <TouchableOpacity
                    onPress={onClose}
                    style={styles.closeBtn}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  >
                    <Ionicons name="close" size={22} color="#64748b" />
                  </TouchableOpacity>
                </View>

                {/* Content */}
                <View style={styles.content}>{children}</View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  keyboardView: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialog: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#f8fafc',
  },
  titleContainer: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  content: {
    padding: 20,
  },
});

