import React, { useEffect, useState } from 'react';
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
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { authApi, branchesApi } from '../../api';
import { useAuthStore } from '../../store/useAuthStore';
import { useUIStore } from '../../store/useUIStore';
import { Branch, TokenResponse } from '../../types';
import { extractErrorMessage } from '../../utils/errors';

export const LoginScreen: React.FC = () => {
  const { setAuth, setSelectedBranch } = useAuthStore();
  const showToast = useUIStore((state) => state.showToast);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedBranchObj, setSelectedBranchObj] = useState<Branch | null>(null);

  // Lista de sucursales disponibles
  const { data: branches, isLoading: isLoadingBranches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesApi.list(),
  });

  useEffect(() => {
    if (branches && branches.length > 0 && !selectedBranchObj) {
      setSelectedBranchObj(branches[0]);
    }
  }, [branches]);

  const loginMutation = useMutation({
    mutationFn: () => authApi.login(username.trim(), password),
    onSuccess: async (data: TokenResponse) => {
      await setAuth(data);

      // Si el usuario tiene una sucursal asignada en el backend, usarla; si no, la elegida
      if (data.user.branch_id && branches) {
        const assigned = branches.find((b) => b.id === data.user.branch_id);
        if (assigned) {
          await setSelectedBranch(assigned);
        } else {
          await setSelectedBranch(selectedBranchObj);
        }
      } else {
        await setSelectedBranch(selectedBranchObj);
      }

      showToast(`Bienvenido, ${data.user.full_name}`, 'success', 'Sesión Iniciada');
    },
    onError: (err) => {
      showToast(extractErrorMessage(err), 'error', 'Error de Autenticación');
    },
  });

  const handleLogin = () => {
    if (!username.trim() || !password.trim()) {
      showToast('Ingrese su usuario y contraseña', 'warning');
      return;
    }
    loginMutation.mutate();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Logo / Cabecera */}
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Ionicons name="cart" size={40} color="#38bdf8" />
          </View>
          <Text style={styles.appName}>LotePOS</Text>
          <Text style={styles.appTagline}>
            Punto de Venta y Control de Stock con Trazabilidad FEFO
          </Text>
        </View>

        {/* Tarjeta de Formulario */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Iniciar Turno de Caja</Text>

          {/* Campo Usuario */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Usuario</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={20} color="#64748b" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Ejem. cajero1"
                placeholderTextColor="#94a3b8"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Campo Contraseña */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Contraseña</Text>
            <View style={styles.inputWrapper}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color="#64748b"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#94a3b8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#64748b"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Selector de Sucursal */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Sucursal Operativa</Text>
            {isLoadingBranches ? (
              <ActivityIndicator size="small" color="#0284c7" />
            ) : branches && branches.length > 0 ? (
              <View style={styles.branchesList}>
                {branches.map((b) => {
                  const isSelected = selectedBranchObj?.id === b.id;
                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={[styles.branchChip, isSelected && styles.branchChipSelected]}
                      onPress={() => setSelectedBranchObj(b)}
                    >
                      <Ionicons
                        name="business-outline"
                        size={16}
                        color={isSelected ? '#0284c7' : '#64748b'}
                      />
                      <Text
                        style={[styles.branchChipText, isSelected && styles.branchChipTextSelected]}
                      >
                        {b.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.noBranchesText}>
                No se encontraron sucursales registradas en la base de datos.
              </Text>
            )}
          </View>

          {/* Botón de Ingreso */}
          <TouchableOpacity
            style={[styles.loginBtn, loginMutation.isPending && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loginMutation.isPending}
            activeOpacity={0.8}
          >
            {loginMutation.isPending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Text style={styles.loginBtnText}>Ingresar al Punto de Venta</Text>
                <Ionicons name="arrow-forward" size={18} color="#ffffff" />
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text style={styles.footerNote}>
          LotePOS v1.0.0 • Bloqueo pesimista FEFO y transacciones ACID
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoBadge: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: '#1e293b',
    borderWidth: 1.5,
    borderColor: '#38bdf8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  appName: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  appTagline: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 20,
    textAlign: 'center',
  },
  fieldGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a',
  },
  eyeBtn: {
    padding: 6,
  },
  branchesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  branchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  branchChipSelected: {
    backgroundColor: '#e0f2fe',
    borderColor: '#38bdf8',
  },
  branchChipText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  branchChipTextSelected: {
    color: '#0369a1',
    fontWeight: '700',
  },
  noBranchesText: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  loginBtn: {
    height: 52,
    backgroundColor: '#0284c7',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  footerNote: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 24,
  },
});

