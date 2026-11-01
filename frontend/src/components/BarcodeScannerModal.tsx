import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

interface BarcodeScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  visible,
  onClose,
  onScan,
  title = 'Escanear Código de Barras',
}) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const lastScannedTimeRef = useRef<number>(0);

  useEffect(() => {
    if (visible && !permission?.granted) {
      requestPermission();
    }
    if (!visible) {
      setTorch(false);
      setManualCode('');
      setShowManualInput(false);
    }
  }, [visible]);

  const handleBarcodeScanned = (scanningResult: { data: string; type: string }) => {
    const now = Date.now();
    // Prevenir disparos múltiples del mismo código dentro de 1.8 segundos
    if (now - lastScannedTimeRef.current < 1800) {
      return;
    }
    lastScannedTimeRef.current = now;

    const data = scanningResult.data?.trim();
    if (data) {
      onScan(data);
      onClose();
    }
  };

  const handleManualSubmit = () => {
    const code = manualCode.trim();
    if (code) {
      onScan(code);
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header Superior */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <Ionicons name="close" size={26} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <TouchableOpacity
            onPress={() => setTorch((prev) => !prev)}
            style={[styles.headerButton, torch && styles.torchActive]}
          >
            <Ionicons name={torch ? 'flash' : 'flash-off'} size={22} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Cámara o Fallback si no hay permisos */}
        {!permission ? (
          <View style={styles.centerNotice}>
            <ActivityIndicator size="large" color="#38bdf8" />
            <Text style={styles.noticeText}>Cargando cámara...</Text>
          </View>
        ) : !permission.granted ? (
          <View style={styles.centerNotice}>
            <Ionicons name="camera-outline" size={64} color="#94a3b8" />
            <Text style={styles.noticeTitle}>Permiso de Cámara Requerido</Text>
            <Text style={styles.noticeText}>
              Se requiere acceso a la cámara para leer códigos de barra EAN-13, QR y Code128.
            </Text>
            <TouchableOpacity onPress={requestPermission} style={styles.grantButton}>
              <Text style={styles.grantButtonText}>Conceder Permiso</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowManualInput(true)}
              style={styles.manualOptionBtn}
            >
              <Text style={styles.manualOptionText}>Ingresar código manualmente</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraContainer}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              enableTorch={torch}
              barcodeScannerSettings={{
                barcodeTypes: ['ean13', 'qr', 'code128', 'code39', 'ean8', 'upc_a', 'upc_e'],
              }}
              onBarcodeScanned={handleBarcodeScanned}
            />

            {/* Guía visual del Viewfinder (Visor de escaneo) */}
            <View style={styles.overlay}>
              <View style={styles.unfocusedContainer} />
              <View style={styles.middleRow}>
                <View style={styles.unfocusedContainer} />
                <View style={styles.viewfinder}>
                  {/* Esquinas guía */}
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                  {/* Línea de escaneo láser */}
                  <View style={styles.laserLine} />
                </View>
                <View style={styles.unfocusedContainer} />
              </View>
              <View style={styles.unfocusedContainer}>
                <Text style={styles.tipText}>
                  Apunta la cámara al código de barras o QR del producto
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Barra inferior: ingreso manual */}
        <View style={styles.bottomBar}>
          {showManualInput ? (
            <View style={styles.manualInputRow}>
              <TextInput
                style={styles.manualInput}
                placeholder="Escribe el código..."
                placeholderTextColor="#94a3b8"
                value={manualCode}
                onChangeText={setManualCode}
                autoFocus
                keyboardType="numeric"
                returnKeyType="done"
                onSubmitEditing={handleManualSubmit}
              />
              <TouchableOpacity onPress={handleManualSubmit} style={styles.manualSubmitBtn}>
                <Ionicons name="arrow-forward" size={20} color="#ffffff" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setShowManualInput(true)}
              style={styles.toggleManualBtn}
            >
              <Ionicons name="keypad-outline" size={18} color="#38bdf8" />
              <Text style={styles.toggleManualText}>Ingresar código con teclado</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    height: 70,
    paddingTop: Platform.OS === 'ios' ? 20 : 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    zIndex: 10,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  torchActive: {
    backgroundColor: '#f59e0b',
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  unfocusedContainer: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  middleRow: {
    flexDirection: 'row',
    height: 240,
  },
  viewfinder: {
    width: 300,
    height: 240,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#38bdf8',
  },
  cornerTL: {
    top: -1,
    left: -1,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: -1,
    right: -1,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: -1,
    left: -1,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: -1,
    right: -1,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  laserLine: {
    width: '90%',
    height: 2,
    backgroundColor: '#38bdf8',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
  },
  tipText: {
    color: '#cbd5e1',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 16,
  },
  centerNotice: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  noticeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 16,
    marginBottom: 8,
  },
  noticeText: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  grantButton: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  grantButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  manualOptionBtn: {
    padding: 10,
  },
  manualOptionText: {
    color: '#38bdf8',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  bottomBar: {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  toggleManualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  toggleManualText: {
    color: '#38bdf8',
    fontWeight: '600',
    fontSize: 15,
  },
  manualInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  manualInput: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#ffffff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#475569',
  },
  manualSubmitBtn: {
    backgroundColor: '#0284c7',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

