import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  doc,
  onSnapshot,
  updateDoc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  deleteDoc,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { createUserWithEmailAndPassword, updatePassword, signOut as authSignOut, getAuth } from 'firebase/auth';
import { db, auth } from '../../firebaseConfig';
import { useAuth } from '../context/auth-context';
import { logAuditEvent, getAuditActionLabel, AuditAction } from '../utils/audit-log';
import { parseCatalogExcel, mergeTrees } from '../utils/import-catalog';
import { CATALOG_TREE } from '../utils/catalog-data';
import * as DocumentPicker from 'expo-document-picker';

type AdminTab = 'catalog' | 'users' | 'audit';

interface AuditLogEntry {
  id: string;
  action: AuditAction;
  adminId: string;
  adminName: string;
  target: string;
  details?: string;
  timestamp: any;
}

export default function AdminScreen() {
  const router = useRouter();
  const { isAdmin, userProfile, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('catalog');

  // Catalog state
  const [catalogTree, setCatalogTree] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [path, setPath] = useState<string[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [addingAs, setAddingAs] = useState<'subcategory' | 'item'>('item');
  const [saving, setSaving] = useState(false);
  const [showCloneModal, setShowCloneModal] = useState(false);
  const [editingItemName, setEditingItemName] = useState<string | null>(null);
  const [editItemInput, setEditItemInput] = useState('');

  // Users state
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'employee'>('employee');
  const [creatingUser, setCreatingUser] = useState(false);
  
  // Edit user state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [updatingUser, setUpdatingUser] = useState(false);

  // Audit state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);

  // Import state
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<{ tree: Record<string, any>; items: number; categories: number; errors: string[] } | null>(null);

  // Redirect if not admin (wait until auth finishes loading)
  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      router.replace('/');
    }
  }, [isAdmin, authLoading, router]);

  // Subscribe to catalog tree
  useEffect(() => {
    const treeRef = doc(db, 'catalog', 'tree');
    const unsubscribe = onSnapshot(
      treeRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setCatalogTree(snapshot.data() as Record<string, any>);
        } else {
          setCatalogTree({});
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error cargando catálogo:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Load users
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const usersList = usersSnapshot.docs.map((doc) => ({
          uid: doc.id,
          ...doc.data(),
        }));
        setUsers(usersList);
      } catch (error) {
        console.error('Error loading users:', error);
      }
      setUsersLoading(false);
    };

    loadUsers();
  }, [creatingUser]); // Refresh after creating a user

  // Subscribe to audit logs
  useEffect(() => {
    const auditRef = collection(db, 'audit_log');
    const q = query(auditRef, orderBy('timestamp', 'desc'), limit(100));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: AuditLogEntry[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as AuditLogEntry[];
        setAuditLogs(items);
        setAuditLoading(false);
      },
      (error) => {
        console.error('Error loading audit logs:', error);
        setAuditLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // ======== CATALOG FUNCTIONS ========

  const getNodeAtPath = (tree: Record<string, any>, p: string[]): any => {
    let node: any = tree;
    for (const key of p) {
      if (node && typeof node === 'object' && !Array.isArray(node)) {
        node = node[key];
      } else {
        return undefined;
      }
    }
    return node;
  };

  const getChildren = (node: any): { type: 'categories' | 'finalItems' | 'empty'; items: string[] } => {
    if (node === undefined || node === null) return { type: 'empty', items: [] };
    if (Array.isArray(node)) return { type: 'finalItems', items: node };
    if (typeof node === 'object') {
      const keys = Object.keys(node);
      if (keys.length === 0) return { type: 'empty', items: [] };
      return { type: 'categories', items: keys };
    }
    return { type: 'empty', items: [] };
  };

  const currentNode = catalogTree ? getNodeAtPath(catalogTree, path) : null;
  const children = getChildren(currentNode);
  const isRoot = path.length === 0;

  const handleAddItem = async () => {
    if (!newItemName.trim()) {
      Alert.alert('Campo vacío', 'Ingresá un nombre o varios separados por comas.');
      return;
    }

    // Split by comma, semicolon, or newline to allow multi-item creation
    const names = newItemName
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (names.length === 0) return;

    try {
      setSaving(true);
      const treeRef = doc(db, 'catalog', 'tree');
      const snapshot = await getDoc(treeRef);
      const fullTree = snapshot.exists() ? { ...snapshot.data() } : {};

      if (path.length === 0) {
        if (addingAs === 'subcategory') {
          for (const name of names) {
            if (!fullTree[name]) fullTree[name] = {};
          }
        } else {
          Alert.alert('Error', 'No se pueden agregar ítems finales en el nivel raíz. Agregá una subcategoría.');
          setSaving(false);
          return;
        }
      } else {
        let parent: any = fullTree;
        for (let i = 0; i < path.length - 1; i++) {
          parent = parent[path[i]];
        }
        const lastKey = path[path.length - 1];
        let target = parent[lastKey];

        if (addingAs === 'item') {
          if (!target || (typeof target === 'object' && !Array.isArray(target) && Object.keys(target).length === 0)) {
            // Target is empty or doesn't exist, safe to initialize as array of items
            parent[lastKey] = [];
            target = parent[lastKey];
          } else if (typeof target === 'object' && !Array.isArray(target)) {
            // Target is an object with existing keys (subcategories). We cannot add items here!
            Alert.alert('Error', 'Esta carpeta ya contiene subcategorías. No se pueden mezclar ítems sueltos con subcarpetas en el mismo nivel.');
            setSaving(false);
            return;
          }

          if (Array.isArray(target)) {
            for (const name of names) {
              if (!target.includes(name)) {
                target.push(name);
              }
            }
          }
        } else {
          // addingAs === 'subcategory'
          if (Array.isArray(target)) {
            // Target is an array (items). We cannot add subcategories here!
            Alert.alert('Error', 'Esta carpeta ya contiene ítems finales. No se pueden agregar subcarpetas junto a ítems finales.');
            setSaving(false);
            return;
          } else if (typeof target === 'object' && target !== null) {
            for (const name of names) {
              if (target[name] === undefined) {
                target[name] = {};
              }
            }
          }
        }
      }

      await setDoc(treeRef, fullTree);
      setNewItemName('');

      // Audit log
      const auditAction = addingAs === 'subcategory' ? 'add_category' : 'add_item';
      await logAuditEvent({
        action: auditAction as AuditAction,
        adminId: userProfile?.uid || '',
        adminName: userProfile?.displayName || '',
        target: names.join(', '),
        details: `Ruta: ${path.length > 0 ? path.join(' › ') : 'Raíz'} (${names.length} elemento/s)`,
      });

      const msg = names.length === 1
        ? `"${names[0]}" se agregó correctamente.`
        : `Se agregaron ${names.length} elementos correctamente.`;
      Alert.alert('✅ Agregado', msg);
    } catch (error) {
      console.error('Error agregando:', error);
      Alert.alert('Error', 'No se pudo agregar el elemento.');
    } finally {
      setSaving(false);
    }
  };

  const handleCloneFromCategory = async (sourcePath: string[]) => {
    if (!catalogTree) return;
    const sourceNode = getNodeAtPath(catalogTree, sourcePath);
    if (!sourceNode) {
      Alert.alert('Error', 'No se encontró la categoría origen.');
      return;
    }

    try {
      setSaving(true);
      const treeRef = doc(db, 'catalog', 'tree');
      const snapshot = await getDoc(treeRef);
      const fullTree = snapshot.exists() ? { ...snapshot.data() } : {};

      const clonedContent = JSON.parse(JSON.stringify(sourceNode));

      if (path.length === 0) {
        if (typeof clonedContent === 'object' && !Array.isArray(clonedContent)) {
          Object.assign(fullTree, clonedContent);
        }
      } else {
        let parent: any = fullTree;
        for (let i = 0; i < path.length - 1; i++) {
          parent = parent[path[i]];
        }
        const lastKey = path[path.length - 1];

        if (typeof parent[lastKey] === 'object' && !Array.isArray(parent[lastKey]) && typeof clonedContent === 'object' && !Array.isArray(clonedContent)) {
          parent[lastKey] = { ...parent[lastKey], ...clonedContent };
        } else {
          parent[lastKey] = clonedContent;
        }
      }

      await setDoc(treeRef, fullTree);
      setShowCloneModal(false);

      await logAuditEvent({
        action: 'bulk_import',
        adminId: userProfile?.uid || '',
        adminName: userProfile?.displayName || '',
        target: path.join(' › ') || 'Raíz',
        details: `Estructura clonada desde: ${sourcePath.join(' › ')}`,
      });

      const msg = `✅ Estructura copiada desde "${sourcePath.join(' › ')}" con éxito.`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Clonado exitoso', msg);
    } catch (error) {
      console.error('Error cloning category:', error);
      Alert.alert('Error', 'No se pudo clonar la categoría.');
    } finally {
      setSaving(false);
    }
  };

  const getAllCategoryPaths = (tree: Record<string, any>, currentPath: string[] = []): { path: string[]; label: string }[] => {
    const result: { path: string[]; label: string }[] = [];
    if (!tree || typeof tree !== 'object' || Array.isArray(tree)) return result;
    for (const key of Object.keys(tree)) {
      const nextPath = [...currentPath, key];
      result.push({ path: nextPath, label: nextPath.join(' › ') });
      if (typeof tree[key] === 'object' && !Array.isArray(tree[key])) {
        result.push(...getAllCategoryPaths(tree[key], nextPath));
      }
    }
    return result;
  };

  const handleRenameItem = async (oldName: string, newName: string) => {
    const trimmedNew = newName.trim();
    if (!trimmedNew) {
      const msg = 'Ingresá un nombre válido.';
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Nombre vacío', msg);
      return;
    }
    if (trimmedNew === oldName) {
      setEditingItemName(null);
      return;
    }

    try {
      setSaving(true);
      const treeRef = doc(db, 'catalog', 'tree');
      const snapshot = await getDoc(treeRef);
      const fullTree = snapshot.exists() ? { ...snapshot.data() } : {};

      if (path.length === 0) {
        if (fullTree[trimmedNew] !== undefined) {
          const msg = `Ya existe una categoría llamada "${trimmedNew}".`;
          if (Platform.OS === 'web') window.alert(msg);
          else Alert.alert('Duplicado', msg);
          setSaving(false);
          return;
        }
        fullTree[trimmedNew] = fullTree[oldName] !== undefined ? fullTree[oldName] : {};
        delete fullTree[oldName];
      } else {
        const node = getNodeAtPath(fullTree, path);
        if (!node) {
          throw new Error('No se encontró la categoría contenedora.');
        }

        if (Array.isArray(node)) {
          if (node.includes(trimmedNew)) {
            const msg = `Ya existe un ítem llamado "${trimmedNew}".`;
            if (Platform.OS === 'web') window.alert(msg);
            else Alert.alert('Duplicado', msg);
            setSaving(false);
            return;
          }
          const idx = node.indexOf(oldName);
          if (idx !== -1) {
            node[idx] = trimmedNew;
          } else {
            node.push(trimmedNew);
          }
        } else if (typeof node === 'object' && node !== null) {
          if (node[trimmedNew] !== undefined) {
            const msg = `Ya existe un elemento llamado "${trimmedNew}".`;
            if (Platform.OS === 'web') window.alert(msg);
            else Alert.alert('Duplicado', msg);
            setSaving(false);
            return;
          }
          node[trimmedNew] = node[oldName] !== undefined ? node[oldName] : [];
          delete node[oldName];
        }
      }

      await setDoc(treeRef, fullTree);
      setEditingItemName(null);
      setEditItemInput('');

      try {
        await logAuditEvent({
          action: 'add_item',
          adminId: userProfile?.uid || '',
          adminName: userProfile?.displayName || '',
          target: `${oldName} ➔ ${trimmedNew}`,
          details: `Renombrado en: ${path.join(' › ') || 'Raíz'}`,
        });
      } catch (logErr) {
        console.log('Audit log skipped:', logErr);
      }

      const msg = `✅ Renombrado a "${trimmedNew}" correctamente.`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Renombrado', msg);
    } catch (error: any) {
      console.error('Error renaming:', error);
      const errMsg = 'No se pudo renombrar: ' + (error?.message || error);
      if (Platform.OS === 'web') window.alert(errMsg);
      else Alert.alert('Error', errMsg);
    } finally {
      setSaving(false);
    }
  };

  const executeDelete = async (itemName: string) => {
    try {
      setSaving(true);
      const treeRef = doc(db, 'catalog', 'tree');
      const snapshot = await getDoc(treeRef);
      const fullTree = snapshot.exists() ? { ...snapshot.data() } : {};

      const isCategory = children.type === 'categories';

      if (path.length === 0) {
        delete fullTree[itemName];
      } else {
        let parent: any = fullTree;
        for (let i = 0; i < path.length - 1; i++) {
          parent = parent[path[i]];
        }
        const lastKey = path[path.length - 1];
        let target = parent[lastKey];

        if (Array.isArray(target)) {
          parent[lastKey] = target.filter((i: string) => i !== itemName);
        } else if (typeof target === 'object') {
          delete target[itemName];
        }
      }

      await setDoc(treeRef, fullTree);

      // Audit log
      await logAuditEvent({
        action: isCategory ? 'delete_category' : 'delete_item',
        adminId: userProfile?.uid || '',
        adminName: userProfile?.displayName || '',
        target: itemName,
        details: `Ruta: ${[...path, itemName].join(' › ')}`,
      });

      if (Platform.OS !== 'web') {
        Alert.alert('🗑️ Eliminado', `"${itemName}" fue eliminado.`);
      }
    } catch (error) {
      console.error('Error eliminando:', error);
      Alert.alert('Error', 'No se pudo eliminar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = (itemName: string) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(`¿Seguro que querés eliminar "${itemName}" y todo su contenido?`);
      if (confirmed) {
        executeDelete(itemName);
      }
    } else {
      Alert.alert(
        'Eliminar',
        `¿Seguro que querés eliminar "${itemName}" y todo su contenido?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Eliminar',
            style: 'destructive',
            onPress: () => executeDelete(itemName),
          },
        ]
      );
    }
  };

  // ======== IMPORT FUNCTIONS ========

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      setImporting(true);

      if (Platform.OS === 'web') {
        // Web: read as ArrayBuffer
        const response = await fetch(file.uri);
        const arrayBuffer = await response.arrayBuffer();
        const parsed = parseCatalogExcel(arrayBuffer);
        setImportPreview({
          tree: parsed.tree,
          items: parsed.itemCount,
          categories: parsed.categoryCount,
          errors: parsed.errors,
        });
      } else {
        // Mobile: read as base64
        const FileSystem = await import('expo-file-system/legacy');
        const base64 = await FileSystem.readAsStringAsync(file.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const parsed = parseCatalogExcel(base64, true);
        setImportPreview({
          tree: parsed.tree,
          items: parsed.itemCount,
          categories: parsed.categoryCount,
          errors: parsed.errors,
        });
      }
    } catch (error) {
      console.error('Error picking file:', error);
      Alert.alert('Error', 'No se pudo leer el archivo.');
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview || !catalogTree) return;

    setSaving(true);
    try {
      const merged = mergeTrees(catalogTree, importPreview.tree);
      const treeRef = doc(db, 'catalog', 'tree');
      await setDoc(treeRef, merged);

      await logAuditEvent({
        action: 'bulk_import',
        adminId: userProfile?.uid || '',
        adminName: userProfile?.displayName || '',
        target: 'Catálogo',
        details: `Importación masiva: ${importPreview.categories} categorías, ${importPreview.items} ítems`,
      });

      const msg = `✅ Importación completada.\n${importPreview.categories} categorías y ${importPreview.items} ítems importados.`;
      if (Platform.OS === 'web') window.alert(msg);
      else Alert.alert('Importación exitosa', msg);

      setImportPreview(null);
    } catch (error) {
      console.error('Error importing:', error);
      Alert.alert('Error', 'No se pudo importar el catálogo.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetCatalog = async () => {
    const doReset = async () => {
      setSaving(true);
      try {
        const treeRef = doc(db, 'catalog', 'tree');
        await setDoc(treeRef, CATALOG_TREE);

        await logAuditEvent({
          action: 'bulk_import',
          adminId: userProfile?.uid || '',
          adminName: userProfile?.displayName || '',
          target: 'Catálogo Inicial',
          details: 'Restablecimiento completo del catálogo base',
        });

        const msg = '✅ Catálogo restablecido con éxito a su estado inicial completo.';
        if (Platform.OS === 'web') window.alert(msg);
        else Alert.alert('Catálogo restablecido', msg);
      } catch (error) {
        console.error('Error resetting catalog:', error);
        Alert.alert('Error', 'No se pudo restablecer el catálogo.');
      } finally {
        setSaving(false);
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        '⚠️ ¿Restablecer TODO el catálogo a su estado inicial completo? Se recargarán todas las categorías, subcategorías e ítems por defecto.'
      );
      if (confirmed) doReset();
    } else {
      Alert.alert(
        'Restablecer catálogo',
        '⚠️ ¿Restablecer TODO el catálogo a su estado inicial completo? Se recargarán todas las categorías, subcategorías e ítems por defecto.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Restablecer', style: 'destructive', onPress: doReset },
        ]
      );
    }
  };

  // ======== USER MANAGEMENT FUNCTIONS ========

  const handleCreateUser = async () => {
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
      Alert.alert('Campos incompletos', 'Completá nombre, email y contraseña.');
      return;
    }

    if (newUserPassword.length < 6) {
      Alert.alert('Contraseña débil', 'La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setCreatingUser(true);

    try {
      // Create user with a secondary Firebase app so the current admin session is not interrupted
      const secondaryAppName = 'SecondaryAuthApp';
      const secondaryApp =
        getApps().find((a) => a.name === secondaryAppName) ||
        initializeApp(auth.app.options, secondaryAppName);
      const secondaryAuth = getAuth(secondaryApp);

      const credential = await createUserWithEmailAndPassword(
        secondaryAuth,
        newUserEmail.trim(),
        newUserPassword.trim()
      );

      // Immediately sign out from secondary auth
      await authSignOut(secondaryAuth);

      // Save user profile in Firestore
      await setDoc(doc(db, 'users', credential.user.uid), {
        displayName: newUserName.trim(),
        email: newUserEmail.trim(),
        role: newUserRole,
        createdAt: new Date().toISOString(),
        createdBy: userProfile?.uid || 'system',
      });

      // Audit log
      await logAuditEvent({
        action: 'create_user',
        adminId: userProfile?.uid || '',
        adminName: userProfile?.displayName || '',
        target: newUserName.trim(),
        details: `Email: ${newUserEmail.trim()}, Rol: ${newUserRole}`,
      });

      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('employee');

      if (Platform.OS === 'web') {
        window.alert(`✅ Usuario "${newUserName.trim()}" creado correctamente.`);
      } else {
        Alert.alert('✅ Usuario creado', `"${newUserName.trim()}" fue creado correctamente.`);
      }
    } catch (error: any) {
      console.error('Error creating user:', error);
      let message = 'No se pudo crear el usuario.';
      if (error.code === 'auth/email-already-in-use') {
        message = 'Ya existe un usuario con ese email.';
      } else if (error.code === 'auth/invalid-email') {
        message = 'El formato del email no es válido.';
      } else if (error.code === 'auth/weak-password') {
        message = 'La contraseña es demasiado débil.';
      }
      Alert.alert('Error', message);
    } finally {
      setCreatingUser(false);
    }
  };

  const handleToggleRole = async (targetUser: any) => {
    if (targetUser.uid === userProfile?.uid) {
      Alert.alert('Error', 'No podés cambiar tu propio rol.');
      return;
    }

    const newRole = targetUser.role === 'admin' ? 'employee' : 'admin';
    const roleLabel = newRole === 'admin' ? 'Administrador' : 'Empleado';

    const doToggle = async () => {
      try {
        await updateDoc(doc(db, 'users', targetUser.uid), { role: newRole });
        setUsers((prev) =>
          prev.map((u) => (u.uid === targetUser.uid ? { ...u, role: newRole } : u))
        );

        await logAuditEvent({
          action: 'change_role',
          adminId: userProfile?.uid || '',
          adminName: userProfile?.displayName || '',
          target: targetUser.displayName,
          details: `${targetUser.role} → ${newRole}`,
        });

        if (Platform.OS !== 'web') {
          Alert.alert('✅ Rol actualizado', `${targetUser.displayName} ahora es ${roleLabel}.`);
        }
      } catch (error) {
        console.error('Error toggling role:', error);
        Alert.alert('Error', 'No se pudo cambiar el rol.');
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        `¿Cambiar el rol de "${targetUser.displayName}" a ${roleLabel}?`
      );
      if (confirmed) doToggle();
    } else {
      Alert.alert(
        'Cambiar rol',
        `¿Cambiar el rol de "${targetUser.displayName}" a ${roleLabel}?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Cambiar', onPress: doToggle },
        ]
      );
    }
  };

  const handleDeleteUser = async (targetUser: any) => {
    if (targetUser.uid === userProfile?.uid) {
      Alert.alert('Error', 'No podés eliminarte a vos mismo.');
      return;
    }

    const doDelete = async () => {
      try {
        await deleteDoc(doc(db, 'users', targetUser.uid));
        setUsers((prev) => prev.filter((u) => u.uid !== targetUser.uid));

        await logAuditEvent({
          action: 'delete_user',
          adminId: userProfile?.uid || '',
          adminName: userProfile?.displayName || '',
          target: targetUser.displayName,
          details: `Email: ${targetUser.email}`,
        });

        if (Platform.OS !== 'web') {
          Alert.alert('🗑️ Eliminado', `${targetUser.displayName} fue eliminado.`);
        }
      } catch (error) {
        console.error('Error deleting user:', error);
        Alert.alert('Error', 'No se pudo eliminar el usuario.');
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        `¿Seguro que querés eliminar a "${targetUser.displayName}"? No podrá acceder más a la app.`
      );
      if (confirmed) doDelete();
    } else {
      Alert.alert(
        'Eliminar usuario',
        `¿Seguro que querés eliminar a "${targetUser.displayName}"? No podrá acceder más a la app.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Eliminar', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  const handleStartEdit = (targetUser: any) => {
    setEditingUserId(targetUser.uid);
    setEditName(targetUser.displayName);
    setEditPassword('');
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setEditName('');
    setEditPassword('');
  };

  const handleSaveEdit = async (targetUser: any) => {
    if (!editName.trim()) {
      Alert.alert('Error', 'El nombre no puede estar vacío.');
      return;
    }

    setUpdatingUser(true);
    try {
      // Update display name in Firestore
      await updateDoc(doc(db, 'users', targetUser.uid), {
        displayName: editName.trim(),
      });
      setUsers((prev) =>
        prev.map((u) => (u.uid === targetUser.uid ? { ...u, displayName: editName.trim() } : u))
      );

      // If password was provided, try to update it
      // Note: Firebase Auth client SDK can only update the CURRENT user's password
      if (editPassword.trim().length > 0) {
        if (editPassword.trim().length < 6) {
          Alert.alert('Aviso', 'Nombre actualizado. La contraseña debe tener al menos 6 caracteres, no se cambió.');
          setEditingUserId(null);
          setEditName('');
          setEditPassword('');
          setUpdatingUser(false);
          return;
        }

        if (targetUser.uid === userProfile?.uid) {
          // Admin is updating their own password
          if (auth.currentUser) {
            await updatePassword(auth.currentUser, editPassword.trim());
          }
        } else {
          // For other users: we store the new password in Firestore temporarily
          // The user will need to use this password next login
          // In a production app, you'd use Firebase Admin SDK or Cloud Functions
          await updateDoc(doc(db, 'users', targetUser.uid), {
            pendingPassword: editPassword.trim(),
          });
        }
      }

      // Audit log
      await logAuditEvent({
        action: 'edit_user',
        adminId: userProfile?.uid || '',
        adminName: userProfile?.displayName || '',
        target: targetUser.displayName,
        details: editPassword.trim() ? 'Nombre y contraseña actualizados' : 'Nombre actualizado',
      });

      const msg = editPassword.trim() ? 'Nombre y contraseña actualizados.' : 'Nombre actualizado.';
      if (Platform.OS === 'web') {
        window.alert('✅ ' + msg);
      } else {
        Alert.alert('✅ Actualizado', msg);
      }

      setEditingUserId(null);
      setEditName('');
      setEditPassword('');
    } catch (error: any) {
      console.error('Error updating user:', error);
      Alert.alert('Error', 'No se pudo actualizar: ' + (error.message || ''));
    } finally {
      setUpdatingUser(false);
    }
  };

  // ======== HELPER ========

  const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'Sin fecha';
    let date: Date;
    if (timestamp.toDate) date = timestamp.toDate();
    else if (timestamp instanceof Date) date = timestamp;
    else return 'Sin fecha';
    return date.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // ======== RENDER ========

  const renderCatalogTab = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Breadcrumb */}
        {!isRoot && (
          <View style={styles.breadcrumbContainer}>
            <TouchableOpacity onPress={() => setPath([])}>
              <Text style={styles.breadcrumbLink}>Raíz</Text>
            </TouchableOpacity>
            {path.map((segment, i) => (
              <React.Fragment key={i}>
                <Text style={styles.breadcrumbSeparator}> › </Text>
                <TouchableOpacity
                  onPress={() => setPath(path.slice(0, i + 1))}
                  disabled={i === path.length - 1}
                >
                  <Text
                    style={[
                      styles.breadcrumbLink,
                      i === path.length - 1 && styles.breadcrumbActive,
                    ]}
                  >
                    {segment}
                  </Text>
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </View>
        )}

        {/* Current items */}
        <Text style={styles.sectionTitle}>
          {isRoot ? 'Categorías principales' : `Contenido de "${path[path.length - 1]}"`}
        </Text>
        <Text style={styles.sectionSubtitle}>
          {children.items.length === 0
            ? 'Vacío — agregá elementos abajo'
            : `${children.items.length} elemento${children.items.length !== 1 ? 's' : ''}`}
        </Text>

        {children.items.map((item) => {
          const isCategory = children.type === 'categories';
          const childNode = isCategory ? currentNode[item] : null;
          const childIsObject = childNode && typeof childNode === 'object' && !Array.isArray(childNode);
          const childCount = childNode
            ? Array.isArray(childNode)
              ? childNode.length
              : typeof childNode === 'object'
              ? Object.keys(childNode).length
              : 0
            : 0;

          if (editingItemName === item) {
            return (
              <View key={item} style={styles.itemEditRow}>
                <View style={styles.itemEditHeader}>
                  <Text style={styles.itemEditIcon}>{isCategory ? '📁' : '📄'}</Text>
                  <Text style={styles.itemEditLabel}>
                    Renombrar {isCategory ? 'categoría' : 'ítem'}:
                  </Text>
                </View>
                <TextInput
                  style={styles.itemEditInput}
                  value={editItemInput}
                  onChangeText={setEditItemInput}
                  placeholder="Nuevo nombre..."
                  placeholderTextColor="#484f58"
                  autoFocus
                  onSubmitEditing={() => handleRenameItem(item, editItemInput)}
                  returnKeyType="done"
                />
                <View style={styles.itemEditBtnRow}>
                  <TouchableOpacity
                    style={styles.itemEditCancelBtn}
                    onPress={() => {
                      setEditingItemName(null);
                      setEditItemInput('');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.itemEditCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.itemEditSaveBtn, saving && styles.btnDisabled]}
                    onPress={() => handleRenameItem(item, editItemInput)}
                    disabled={saving}
                    activeOpacity={0.7}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.itemEditSaveText}>Guardar</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          }

          return (
            <View key={item} style={styles.itemRow}>
              <TouchableOpacity
                style={styles.itemRowContent}
                onPress={() => {
                  if (isCategory) {
                    setPath([...path, item]);
                  }
                }}
                activeOpacity={isCategory ? 0.7 : 1}
              >
                <Text style={styles.itemRowIcon}>
                  {isCategory ? '📁' : '📄'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemRowName}>{item}</Text>
                  {isCategory && (
                    <Text style={styles.itemRowSub}>
                      {childCount} elemento{childCount !== 1 ? 's' : ''} •{' '}
                      {childIsObject ? 'subcategoría' : 'ítems'}
                    </Text>
                  )}
                </View>
                {isCategory && <Text style={styles.chevron}>›</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.editItemBtn}
                onPress={() => {
                  setEditingItemName(item);
                  setEditItemInput(item);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.editItemBtnText}>✏️</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDeleteItem(item)}
                activeOpacity={0.7}
              >
                <Text style={styles.deleteBtnText}>🗑️</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {/* Add new item section */}
        <View style={styles.addSection}>
          <Text style={styles.addTitle}>➕ Agregar nuevo</Text>

          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[
                styles.typeBtn,
                addingAs === 'subcategory' && styles.typeBtnActive,
              ]}
              onPress={() => setAddingAs('subcategory')}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.typeBtnText,
                  addingAs === 'subcategory' && styles.typeBtnTextActive,
                ]}
              >
                📁 Subcategoría
              </Text>
            </TouchableOpacity>
            {!isRoot && (
              <TouchableOpacity
                style={[
                  styles.typeBtn,
                  addingAs === 'item' && styles.typeBtnActive,
                ]}
                onPress={() => setAddingAs('item')}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.typeBtnText,
                    addingAs === 'item' && styles.typeBtnTextActive,
                  ]}
                >
                  📄 Ítem final
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <TextInput
            style={[styles.addInput, { minHeight: 60 }]}
            value={newItemName}
            onChangeText={setNewItemName}
            placeholder={
              addingAs === 'subcategory'
                ? 'Ej: UCT, UMT, URT (separados por comas o saltos de línea)'
                : 'Ej: 10, 16, 25, 32, 40 (separados por comas o saltos de línea)'
            }
            placeholderTextColor="#484f58"
            multiline
          />

          {/* Quick Presets */}
          <Text style={styles.presetsLabel}>⚡ Plantillas rápidas (tocá para insertar):</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetsScroll}>
            {[
              { label: '⚡ Amperajes (10 a 40)', value: '10, 16, 25, 32, 40' },
              { label: '📏 Medidas caños (¾ a 200)', value: '3/4, 100, 110, 112, 200' },
              { label: '🎨 Colores cables', value: 'Rojo, Celeste, Marron, Negro, Tierra, Blanco' },
              { label: '🔌 Fases', value: 'Bifasicos, Trifasicos' },
              { label: '📐 Calibres (1 a 16mm)', value: '1mm, 1,5mm, 2,5mm, 4mm, 6mm, 10mm, 16mm' },
            ].map((p, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.presetChip}
                onPress={() => setNewItemName(p.value)}
                activeOpacity={0.7}
              >
                <Text style={styles.presetChipText}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[styles.addBtn, saving && styles.btnDisabled]}
            onPress={handleAddItem}
            disabled={saving}
            activeOpacity={0.7}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.addBtnText}>➕ Agregar elemento(s)</Text>
            )}
          </TouchableOpacity>

          {/* Clone from other category button */}
          {!isRoot && (
            <TouchableOpacity
              style={styles.cloneBtn}
              onPress={() => setShowCloneModal(!showCloneModal)}
              activeOpacity={0.7}
            >
              <Text style={styles.cloneBtnText}>
                📋 {showCloneModal ? 'Ocultar clonador' : 'Clonar contenido de otra carpeta aquí'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Clone Category Selector */}
          {showCloneModal && catalogTree && !isRoot && (
            <View style={styles.cloneBox}>
              <Text style={styles.cloneBoxTitle}>
                Seleccioná de qué carpeta querés copiar su contenido:
              </Text>
              <ScrollView style={styles.cloneListScroll} nestedScrollEnabled>
                {getAllCategoryPaths(catalogTree)
                  .filter((cat) => cat.path.join('/') !== path.join('/'))
                  .map((cat, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.cloneItemBtn}
                      onPress={() => handleCloneFromCategory(cat.path)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.cloneItemIcon}>📁</Text>
                      <Text style={styles.cloneItemText}>{cat.label}</Text>
                      <Text style={styles.cloneItemAction}>Copiar ➔</Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Import section */}
        <View style={styles.importSection}>
          <Text style={styles.addTitle}>📂 Importar desde Excel</Text>
          <Text style={styles.importHint}>
            Formato: columnas Categoría 1 | Categoría 2 | ... | Ítem. Los datos se fusionan con el catálogo existente.
          </Text>

          {importPreview ? (
            <View style={styles.importPreviewBox}>
              <Text style={styles.importPreviewTitle}>Vista previa de importación</Text>
              <Text style={styles.importPreviewText}>
                📁 {importPreview.categories} categorías · 📄 {importPreview.items} ítems
              </Text>
              {importPreview.errors.length > 0 && (
                <View style={styles.importErrorsBox}>
                  {importPreview.errors.map((err, i) => (
                    <Text key={i} style={styles.importErrorText}>⚠️ {err}</Text>
                  ))}
                </View>
              )}
              <View style={styles.importBtnRow}>
                <TouchableOpacity
                  style={styles.importCancelBtn}
                  onPress={() => setImportPreview(null)}
                >
                  <Text style={styles.importCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.importConfirmBtn, saving && styles.btnDisabled]}
                  onPress={handleConfirmImport}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.importConfirmText}>Importar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.importBtn, importing && styles.btnDisabled]}
              onPress={handlePickFile}
              disabled={importing}
              activeOpacity={0.7}
            >
              {importing ? (
                <ActivityIndicator color="#58a6ff" />
              ) : (
                <Text style={styles.importBtnText}>📎 Seleccionar archivo Excel / CSV</Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.resetCatalogBtn, saving && styles.btnDisabled]}
            onPress={handleResetCatalog}
            disabled={saving}
            activeOpacity={0.7}
          >
            <Text style={styles.resetCatalogBtnText}>🔄 Restablecer catálogo inicial completo</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderUsersTab = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1 }}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Users list */}
        <Text style={styles.sectionTitle}>Usuarios registrados</Text>
        <Text style={styles.sectionSubtitle}>
          {users.length} usuario{users.length !== 1 ? 's' : ''}
        </Text>

        {usersLoading ? (
          <ActivityIndicator color="#1f6feb" style={{ marginVertical: 20 }} />
        ) : (
          users.map((u) => (
            <View key={u.uid} style={styles.userRow}>
              <View style={styles.userInfo}>
                <View style={styles.userAvatar}>
                  <Text style={styles.userAvatarText}>
                    {(u.displayName || '?')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>
                    {u.displayName}
                    {u.uid === userProfile?.uid ? ' (vos)' : ''}
                  </Text>
                  <Text style={styles.userEmail}>{u.email}</Text>
                </View>
                <View
                  style={[
                    styles.roleBadge,
                    u.role === 'admin' ? styles.adminBadge : styles.employeeBadge,
                  ]}
                >
                  <Text style={styles.roleBadgeText}>
                    {u.role === 'admin' ? '👑 Admin' : '👤 Empleado'}
                  </Text>
                </View>
              </View>

              {/* Edit section (expanded) */}
              {editingUserId === u.uid && (
                <View style={styles.editSection}>
                  <Text style={styles.editSectionTitle}>✏️ Editar usuario</Text>
                  <Text style={styles.inputLabel}>Nombre</Text>
                  <TextInput
                    style={styles.addInput}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Nombre completo"
                    placeholderTextColor="#484f58"
                  />
                  <Text style={styles.inputLabel}>Nueva contraseña (dejar vacío para no cambiar)</Text>
                  <TextInput
                    style={styles.addInput}
                    value={editPassword}
                    onChangeText={setEditPassword}
                    placeholder="Mínimo 6 caracteres"
                    placeholderTextColor="#484f58"
                    secureTextEntry
                  />
                  <View style={styles.editBtnRow}>
                    <TouchableOpacity
                      style={styles.editCancelBtn}
                      onPress={handleCancelEdit}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.editCancelText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.editSaveBtn, updatingUser && styles.btnDisabled]}
                      onPress={() => handleSaveEdit(u)}
                      disabled={updatingUser}
                      activeOpacity={0.7}
                    >
                      {updatingUser ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.editSaveText}>Guardar</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {u.uid !== userProfile?.uid && editingUserId !== u.uid && (
                <View style={styles.userActions}>
                  <TouchableOpacity
                    style={styles.userActionBtn}
                    onPress={() => handleStartEdit(u)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.userActionText}>
                      ✏️ Editar
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.userActionBtn}
                    onPress={() => handleToggleRole(u)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.userActionText}>
                      {u.role === 'admin' ? '⬇️ Quitar admin' : '⬆️ Hacer admin'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.userActionBtn, styles.userDeleteBtn]}
                    onPress={() => handleDeleteUser(u)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.userActionText, styles.userDeleteText]}>
                      🗑️
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Edit own info */}
              {u.uid === userProfile?.uid && editingUserId !== u.uid && (
                <View style={styles.userActions}>
                  <TouchableOpacity
                    style={[styles.userActionBtn, styles.userDeleteBtn]}
                    onPress={() => handleStartEdit(u)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.userActionText}>
                      ✏️ Editar mi perfil
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}

        {/* Add new user */}
        <View style={styles.addSection}>
          <Text style={styles.addTitle}>➕ Nuevo usuario</Text>

          <Text style={styles.inputLabel}>Nombre completo</Text>
          <TextInput
            style={styles.addInput}
            value={newUserName}
            onChangeText={setNewUserName}
            placeholder="Ej: Juan Pérez"
            placeholderTextColor="#484f58"
          />

          <Text style={styles.inputLabel}>Email</Text>
          <TextInput
            style={styles.addInput}
            value={newUserEmail}
            onChangeText={setNewUserEmail}
            placeholder="Ej: juan.perez@andpatelec.com"
            placeholderTextColor="#484f58"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.inputLabel}>Contraseña</Text>
          <TextInput
            style={styles.addInput}
            value={newUserPassword}
            onChangeText={setNewUserPassword}
            placeholder="Mínimo 6 caracteres"
            placeholderTextColor="#484f58"
            secureTextEntry
          />

          <Text style={styles.inputLabel}>Rol</Text>
          <View style={styles.typeRow}>
            <TouchableOpacity
              style={[
                styles.typeBtn,
                newUserRole === 'employee' && styles.typeBtnActive,
              ]}
              onPress={() => setNewUserRole('employee')}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.typeBtnText,
                  newUserRole === 'employee' && styles.typeBtnTextActive,
                ]}
              >
                👤 Empleado
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.typeBtn,
                newUserRole === 'admin' && styles.typeBtnActive,
              ]}
              onPress={() => setNewUserRole('admin')}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.typeBtnText,
                  newUserRole === 'admin' && styles.typeBtnTextActive,
                ]}
              >
                👑 Administrador
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.addBtn, creatingUser && styles.btnDisabled]}
            onPress={handleCreateUser}
            disabled={creatingUser}
            activeOpacity={0.7}
          >
            {creatingUser ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.addBtnText}>Crear usuario</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderAuditTab = () => (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.sectionTitle}>Historial de cambios</Text>
      <Text style={styles.sectionSubtitle}>
        Últimos 100 eventos de administración
      </Text>

      {auditLoading ? (
        <ActivityIndicator color="#1f6feb" style={{ marginVertical: 20 }} />
      ) : auditLogs.length === 0 ? (
        <View style={styles.emptyAudit}>
          <Text style={styles.emptyAuditIcon}>📜</Text>
          <Text style={styles.emptyAuditText}>
            Sin eventos de auditoría todavía.
          </Text>
        </View>
      ) : (
        auditLogs.map((logEntry) => (
          <View key={logEntry.id} style={styles.auditCard}>
            <View style={styles.auditHeader}>
              <Text style={styles.auditAction}>
                {getAuditActionLabel(logEntry.action)}
              </Text>
              <Text style={styles.auditDate}>
                {formatDate(logEntry.timestamp)}
              </Text>
            </View>
            <Text style={styles.auditTarget}>{logEntry.target}</Text>
            {logEntry.details && (
              <Text style={styles.auditDetails}>{logEntry.details}</Text>
            )}
            <Text style={styles.auditAdmin}>
              Por: {logEntry.adminName || 'Sistema'}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (activeTab === 'catalog' && path.length > 0) {
              setPath((prev) => prev.slice(0, -1));
            } else {
              router.back();
            }
          }}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.backBtnText}>
            {activeTab === 'catalog' && path.length > 0 ? '← Atrás' : '← Volver'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>⚙️ Admin</Text>
        <View style={{ width: 44 }} /> {/* placeholder for balance */}
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'catalog' && styles.tabActive]}
          onPress={() => setActiveTab('catalog')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'catalog' && styles.tabTextActive]}>
            📦 Catálogo
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'users' && styles.tabActive]}
          onPress={() => setActiveTab('users')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'users' && styles.tabTextActive]}>
            👥 Usuarios
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'audit' && styles.tabActive]}
          onPress={() => setActiveTab('audit')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, activeTab === 'audit' && styles.tabTextActive]}>
            📜 Auditoría
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading && activeTab === 'catalog' ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#00e5ff" />
        </View>
      ) : activeTab === 'catalog' ? (
        renderCatalogTab()
      ) : activeTab === 'users' ? (
        renderUsersTab()
      ) : (
        renderAuditTab()
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },
  backBtn: {
    paddingVertical: 6,
    paddingRight: 12,
  },
  backBtnText: {
    color: '#58a6ff',
    fontSize: 15,
    fontWeight: '600',
  },
  headerTitle: {
    color: '#f0f6fc',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },

  // Tabs
  tabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#1f6feb',
  },
  tabText: {
    color: '#8b949e',
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#f0f6fc',
  },

  // Breadcrumb
  breadcrumbContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    flexWrap: 'wrap',
  },
  breadcrumbLink: {
    color: '#58a6ff',
    fontSize: 13,
    fontWeight: '500',
  },
  breadcrumbActive: {
    color: '#f0f6fc',
    fontWeight: 'bold',
  },
  breadcrumbSeparator: {
    color: '#484f58',
    fontSize: 13,
  },

  // Content
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    color: '#f0f6fc',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: '#8b949e',
    fontSize: 13,
    marginBottom: 16,
  },

  // Item rows (catalog)
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161b22',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  itemRowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  itemRowIcon: {
    fontSize: 20,
  },
  itemRowName: {
    color: '#f0f6fc',
    fontSize: 15,
    fontWeight: '600',
  },
  itemRowSub: {
    color: '#8b949e',
    fontSize: 12,
    marginTop: 2,
  },
  chevron: {
    color: '#484f58',
    fontSize: 22,
    fontWeight: 'bold',
  },
  editItemBtn: {
    padding: 14,
    borderLeftWidth: 1,
    borderLeftColor: '#30363d',
  },
  editItemBtnText: {
    fontSize: 16,
  },
  deleteBtn: {
    padding: 14,
    borderLeftWidth: 1,
    borderLeftColor: '#30363d',
  },
  deleteBtnText: {
    fontSize: 18,
  },

  // Item inline edit
  itemEditRow: {
    backgroundColor: '#161b22',
    borderColor: '#1f6feb',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  itemEditHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  itemEditIcon: {
    fontSize: 16,
  },
  itemEditLabel: {
    color: '#f0f6fc',
    fontSize: 13,
    fontWeight: 'bold',
  },
  itemEditInput: {
    backgroundColor: '#0d1117',
    color: '#f0f6fc',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
  },
  itemEditBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  itemEditCancelBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#21262d',
    borderRadius: 6,
  },
  itemEditCancelText: {
    color: '#8b949e',
    fontSize: 13,
    fontWeight: '600',
  },
  itemEditSaveBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#238636',
    borderRadius: 6,
  },
  itemEditSaveText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },

  // User rows
  userRow: {
    backgroundColor: '#161b22',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1f6feb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  userName: {
    color: '#f0f6fc',
    fontSize: 15,
    fontWeight: '600',
  },
  userEmail: {
    color: '#8b949e',
    fontSize: 12,
    marginTop: 1,
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  adminBadge: {
    backgroundColor: '#1f3a5f',
  },
  employeeBadge: {
    backgroundColor: '#21262d',
  },
  roleBadgeText: {
    color: '#f0f6fc',
    fontSize: 11,
    fontWeight: '600',
  },
  userActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#21262d',
  },
  userActionBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#21262d',
  },
  userDeleteBtn: {
    borderRightWidth: 0,
  },
  userActionText: {
    color: '#58a6ff',
    fontSize: 12,
    fontWeight: '600',
  },
  userDeleteText: {
    color: '#f85149',
  },

  // Add section
  addSection: {
    marginTop: 20,
    backgroundColor: '#161b22',
    borderColor: '#1f6feb',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  addTitle: {
    color: '#f0f6fc',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 14,
  },
  inputLabel: {
    color: '#c9d1d9',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 8,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  typeBtn: {
    flex: 1,
    backgroundColor: '#0d1117',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  typeBtnActive: {
    backgroundColor: '#1f3a5f',
    borderColor: '#1f6feb',
  },
  typeBtnText: {
    color: '#8b949e',
    fontSize: 13,
    fontWeight: '600',
  },
  typeBtnTextActive: {
    color: '#58a6ff',
  },
  addInput: {
    backgroundColor: '#0d1117',
    color: '#f0f6fc',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  addBtn: {
    backgroundColor: '#238636',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Import section
  importSection: {
    marginTop: 20,
    backgroundColor: '#161b22',
    borderColor: '#58a6ff40',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  importHint: {
    color: '#8b949e',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  importBtn: {
    backgroundColor: '#0d1117',
    borderColor: '#1f6feb',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  importBtnText: {
    color: '#58a6ff',
    fontSize: 14,
    fontWeight: '600',
  },
  resetCatalogBtn: {
    marginTop: 12,
    backgroundColor: '#2d1215',
    borderColor: '#f8514940',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  resetCatalogBtnText: {
    color: '#f85149',
    fontSize: 13,
    fontWeight: '600',
  },

  // Presets & Clone
  presetsLabel: {
    color: '#8b949e',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  presetsScroll: {
    marginBottom: 14,
  },
  presetChip: {
    backgroundColor: '#0d1117',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
  },
  presetChipText: {
    color: '#58a6ff',
    fontSize: 11,
    fontWeight: '600',
  },
  cloneBtn: {
    marginTop: 10,
    backgroundColor: '#1f3a5f33',
    borderColor: '#1f6feb66',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cloneBtnText: {
    color: '#58a6ff',
    fontSize: 13,
    fontWeight: '600',
  },
  cloneBox: {
    marginTop: 12,
    backgroundColor: '#0d1117',
    borderColor: '#1f6feb',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  cloneBoxTitle: {
    color: '#f0f6fc',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  cloneListScroll: {
    maxHeight: 180,
  },
  cloneItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
    gap: 8,
  },
  cloneItemIcon: {
    fontSize: 14,
  },
  cloneItemText: {
    color: '#c9d1d9',
    fontSize: 12,
    flex: 1,
  },
  cloneItemAction: {
    color: '#3fb950',
    fontSize: 11,
    fontWeight: 'bold',
  },
  importPreviewBox: {
    backgroundColor: '#0d1117',
    borderColor: '#238636',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  importPreviewTitle: {
    color: '#3fb950',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  importPreviewText: {
    color: '#f0f6fc',
    fontSize: 14,
    marginBottom: 10,
  },
  importErrorsBox: {
    marginBottom: 10,
  },
  importErrorText: {
    color: '#d29922',
    fontSize: 12,
    marginBottom: 4,
  },
  importBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  importCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#21262d',
    borderRadius: 8,
  },
  importCancelText: {
    color: '#8b949e',
    fontSize: 14,
    fontWeight: '600',
  },
  importConfirmBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#238636',
    borderRadius: 8,
  },
  importConfirmText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Edit section
  editSection: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#21262d',
    backgroundColor: '#0d1117',
  },
  editSectionTitle: {
    color: '#f0f6fc',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  editBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  editCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#21262d',
    borderRadius: 8,
  },
  editCancelText: {
    color: '#8b949e',
    fontSize: 14,
    fontWeight: '600',
  },
  editSaveBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#238636',
    borderRadius: 8,
  },
  editSaveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Audit tab
  auditCard: {
    backgroundColor: '#161b22',
    borderColor: '#30363d',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  auditHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  auditAction: {
    color: '#f0f6fc',
    fontSize: 14,
    fontWeight: '600',
  },
  auditDate: {
    color: '#8b949e',
    fontSize: 11,
  },
  auditTarget: {
    color: '#58a6ff',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  auditDetails: {
    color: '#8b949e',
    fontSize: 12,
    marginBottom: 4,
  },
  auditAdmin: {
    color: '#484f58',
    fontSize: 11,
    fontWeight: '500',
  },
  emptyAudit: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyAuditIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyAuditText: {
    color: '#8b949e',
    fontSize: 14,
  },

  // Loading
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
