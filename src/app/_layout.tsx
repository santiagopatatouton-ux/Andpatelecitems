import { Stack, useRouter, useSegments, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { AuthProvider, useAuth } from '../context/auth-context';
import BottomNav from '../components/BottomNav';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    SplashScreen.hideAsync().catch(() => {});

    const inLoginPage = segments[0] === 'login';

    if (!user && !inLoginPage) {
      router.replace('/login');
    } else if (user && inLoginPage) {
      router.replace('/');
    }
  }, [user, loading, segments, router]);

  const showBottomNav = user && pathname !== '/login';

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#0d1117' },
            animation: 'fade', // better for tabs
          }}
        />
      </View>
      {showBottomNav && <BottomNav />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  content: {
    flex: 1,
  },
});

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
