import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CircleAlert, CircleCheck, Info, X, type IconComponent } from './icons';
import { AppText, Button, IconButton } from './primitives';
import { colors, iconSize, radius, spacing, type Tone } from '@/theme/tokens';

// Avisos y confirmaciones propios: Alert.alert no hace nada en la versión web.

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
}

interface FeedbackValue {
  toast: (message: string, tone?: Tone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

interface ToastState {
  id: number;
  message: string;
  tone: Tone;
}

const TOAST_DURATION_MS = 4500;

const TOAST_ICONS: Partial<Record<Tone, IconComponent>> = {
  success: CircleCheck,
  danger: CircleAlert,
  warning: CircleAlert,
};

const TOAST_ACCENTS: Partial<Record<Tone, string>> = {
  success: '#4ED79B',
  danger: '#FF8A8A',
  warning: colors.brand,
};

const FeedbackContext = createContext<FeedbackValue | null>(null);

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error('useFeedback requiere FeedbackProvider');
  return context;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toastState, setToastState] = useState<ToastState | null>(null);
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);

  useEffect(() => {
    if (!toastState) return;
    const timer = setTimeout(() => setToastState(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toastState]);

  const closeDialog = useCallback((confirmed: boolean) => {
    resolver.current?.(confirmed);
    resolver.current = null;
    setDialog(null);
  }, []);

  const value = useMemo<FeedbackValue>(
    () => ({
      toast: (message, tone = 'success') => setToastState({ id: Date.now(), message, tone }),
      confirm: (options) =>
        new Promise((resolve) => {
          resolver.current?.(false);
          resolver.current = resolve;
          setDialog(options);
        }),
    }),
    []
  );

  const ToastIcon = (toastState && TOAST_ICONS[toastState.tone]) || Info;
  const toastAccent = (toastState && TOAST_ACCENTS[toastState.tone]) || colors.onInk;

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      {toastState && (
        <View
          pointerEvents="box-none"
          style={[styles.toastLayer, { top: insets.top + spacing.md }]}
        >
          <View style={styles.toast} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <ToastIcon size={iconSize.md} color={toastAccent} strokeWidth={2} />
            <AppText variant="small" color={colors.onInk} style={styles.toastText}>
              {toastState.message}
            </AppText>
            <IconButton
              icon={X}
              label="Cerrar aviso"
              color={colors.onInkMuted}
              onPress={() => setToastState(null)}
              style={styles.toastClose}
            />
          </View>
        </View>
      )}

      <Modal
        transparent
        animationType="none"
        visible={dialog !== null}
        onRequestClose={() => closeDialog(false)}
      >
        <View style={styles.scrim}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityLabel="Cancelar"
            onPress={() => closeDialog(false)}
          />
          <View style={styles.dialog} accessibilityRole="alert">
            <AppText variant="heading">{dialog?.title}</AppText>
            <AppText color={colors.textMuted}>{dialog?.message}</AppText>
            <View style={styles.dialogActions}>
              <Button label="Cancelar" variant="secondary" onPress={() => closeDialog(false)} />
              <Button
                label={dialog?.confirmLabel ?? 'Confirmar'}
                variant={dialog?.destructive ? 'danger' : 'primary'}
                onPress={() => closeDialog(true)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </FeedbackContext.Provider>
  );
}

const styles = StyleSheet.create({
  toastLayer: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
    zIndex: 100,
  },
  toast: {
    width: '100%',
    maxWidth: 460,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
    paddingRight: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
  },
  toastText: { flex: 1, paddingVertical: spacing.sm },
  toastClose: { backgroundColor: 'transparent' },
  scrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.scrim,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
