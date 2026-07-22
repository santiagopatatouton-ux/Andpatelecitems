import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../utils/auth-context';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0d1117' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="login" options={{ animation: 'fade' }} />
        <Stack.Screen name="index" />
        <Stack.Screen name="action" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="search" />
        <Stack.Screen name="history" />
        <Stack.Screen name="alerts" />
        <Stack.Screen name="user-management" />
        <Stack.Screen name="requests" />
        <Stack.Screen name="dashboard" />
      </Stack>
    </AuthProvider>
  );
}
