import { useFonts } from 'expo-font';
import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import '../global.css';

import { AppShell } from '@/components/layout/app-shell';
import { FeedbackProvider } from '@/components/ui/feedback';
import { ShieldCheck } from '@/components/ui/icons';
import { Button, EmptyState } from '@/components/ui/primitives';
import { AuthProvider, useAuth } from '@/context/auth-context';
import { CartProvider } from '@/context/cart-context';
import { CatalogProvider } from '@/context/catalog-context';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

function NoAccess() {
  const { user, signOut } = useAuth();
  return (
    <View style={styles.center}>
      <EmptyState
        icon={ShieldCheck}
        title="Tu cuenta no tiene acceso"
        message={`${user?.email ?? 'Esta cuenta'} no está habilitada. Pedile a un administrador que te dé de alta.`}
        action={<Button label="Cerrar sesión" variant="secondary" onPress={signOut} />}
      />
    </View>
  );
}

function RootNavigator() {
  const { user, userProfile, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const onLogin = pathname === '/login';

  useEffect(() => {
    if (loading) return;
    if (!user && !onLogin) router.replace('/login');
    else if (user && onLogin) router.replace('/');
  }, [user, loading, onLogin, router]);

  return (
    <AppShell>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none',
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      {loading && (
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <ActivityIndicator size="large" color={colors.ink} />
        </View>
      )}
      {!loading && user && !userProfile && (
        <View style={StyleSheet.absoluteFill}>
          <NoAccess />
        </View>
      )}
    </AppShell>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexSans_400Regular: require('@expo-google-fonts/ibm-plex-sans/400Regular/IBMPlexSans_400Regular.ttf'),
    IBMPlexSans_500Medium: require('@expo-google-fonts/ibm-plex-sans/500Medium/IBMPlexSans_500Medium.ttf'),
    IBMPlexSans_600SemiBold: require('@expo-google-fonts/ibm-plex-sans/600SemiBold/IBMPlexSans_600SemiBold.ttf'),
    IBMPlexSans_700Bold: require('@expo-google-fonts/ibm-plex-sans/700Bold/IBMPlexSans_700Bold.ttf'),
  });
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <AuthProvider>
      <FeedbackProvider>
        <CatalogProvider>
          <CartProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </CartProvider>
        </CatalogProvider>
      </FeedbackProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
