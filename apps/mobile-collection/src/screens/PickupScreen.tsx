import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  hasBarcodeScanner,
  scanSupplierBarcode,
} from '../barcode/barcodeScanner';
import { AppButton, Card, Field, Hint, SectionTitle } from '../components/ui';
import { buildPickupPayload } from '../pickups/pickupInput';
import { normalizeRegNo, validateRegNo } from '../pickups/regNo';
import {
  enqueuePickup,
  listRoutes,
  listSuppliers,
} from '../storage/encryptedStore';
import { colors, spacing } from '../theme';
import type { Route, ScanMethod, Supplier } from '../types';

function normalize(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function PickupScreen({
  deviceId,
  online,
  queuedCount,
  onBack,
  onQueued,
  onSync,
}: {
  deviceId: string;
  online: boolean;
  queuedCount: number;
  onBack: () => void;
  onQueued: () => void;
  onSync: () => void;
}) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [tripId, setTripId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierRegNo, setSupplierRegNo] = useState('');
  const [supplierBarcode, setSupplierBarcode] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [scanMethod, setScanMethod] = useState<ScanMethod>('BARCODE');
  const [routeId, setRouteId] = useState('');
  const [routeStopId, setRouteStopId] = useState('');
  const [grossWeightKg, setGrossWeightKg] = useState('');
  const [bagsCount, setBagsCount] = useState('');
  const [tareKg, setTareKg] = useState('0');
  const [moistureDeductionKg, setMoistureDeductionKg] = useState('0');
  const [gpsLat, setGpsLat] = useState('');
  const [gpsLng, setGpsLng] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [regNoError, setRegNoError] = useState<string | null>(null);
  const [scannerAvailable, setScannerAvailable] = useState(false);
  const confirmedRegNo = useRef<string | null>(null);

  useEffect(() => {
    Promise.all([listSuppliers(), listRoutes()]).then(
      ([storedSuppliers, storedRoutes]) => {
        setSuppliers(storedSuppliers);
        setRoutes(storedRoutes);
      },
    );
    setScannerAvailable(hasBarcodeScanner());
  }, []);

  const activeRoute = useMemo(
    () => routes.find(route => route.id === routeId) ?? null,
    [routes, routeId],
  );

  const selectedSupplier = useMemo(
    () =>
      suppliers.find(supplier => supplier.supplierId === supplierId) ?? null,
    [suppliers, supplierId],
  );

  function chooseSupplier(supplier: Supplier, stopId?: string) {
    setSupplierId(supplier.supplierId);
    setSupplierRegNo(supplier.supplierRegNo);
    setSupplierBarcode(supplier.barcodeValue);
    setRouteStopId(stopId ?? '');
    setError(null);
  }

  async function scan() {
    setError(null);
    setRegNoError(null);
    confirmedRegNo.current = null;
    try {
      const result = await scanSupplierBarcode();
      const value = normalize(result.value);
      const supplier = suppliers.find(
        candidate =>
          normalize(candidate.barcodeValue) === value ||
          normalize(candidate.supplierRegNo) === value ||
          normalize(candidate.code) === value ||
          normalize(candidate.supplierCode) === value,
      );
      if (!supplier) {
        setError(
          'Scanned code is not in cached master data. Refresh master data and try again.',
        );
        return;
      }
      setScanMethod('BARCODE');
      setManualReason('');
      chooseSupplier(supplier);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Barcode scan failed.',
      );
    }
  }

  function findSupplierByRegNo(normalizedValue: string): Supplier | null {
    return (
      suppliers.find(
        candidate =>
          normalizeRegNo(candidate.supplierRegNo) === normalizedValue ||
          normalizeRegNo(candidate.supplierRegNoNormalized) ===
            normalizedValue ||
          normalize(candidate.code) === normalizedValue,
      ) ?? null
    );
  }

  function changeRegNo(value: string) {
    const validation = validateRegNo(value);
    const alreadyConfirmed = confirmedRegNo.current === validation.normalized;
    confirmedRegNo.current = alreadyConfirmed ? validation.normalized : null;
    setScanMethod('REG_NO');
    setSupplierRegNo(value);
    setSupplierId('');
    setSupplierBarcode('');
    setRouteStopId('');
    setRegNoError(null);

    if (!validation.normalized) {
      return;
    }
    if (!validation.valid) {
      setRegNoError(validation.error ?? 'Invalid registration number.');
      return;
    }

    const supplier = findSupplierByRegNo(validation.normalized);
    if (!supplier) {
      setRegNoError('Registration number was not found in cached master data.');
      return;
    }
    if (alreadyConfirmed) {
      chooseSupplier(supplier);
      setScanMethod('REG_NO');
      return;
    }

    const supplierName = supplier.preferredName || supplier.fullName;
    Alert.alert(
      'Confirm supplier',
      `Registration ${validation.normalized} belongs to ${supplierName}. Use this supplier?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            confirmedRegNo.current = null;
            setRegNoError(
              'Confirm the supplier name before queueing this pickup.',
            );
          },
        },
        {
          text: 'Confirm',
          onPress: () => {
            confirmedRegNo.current = validation.normalized;
            chooseSupplier(supplier);
            setScanMethod('REG_NO');
          },
        },
      ],
    );
  }

  async function submit() {
    setError(null);
    if (scanMethod === 'REG_NO') {
      const validation = validateRegNo(supplierRegNo);
      if (!validation.valid) {
        setError(validation.error ?? 'Invalid registration number.');
        return;
      }
      const supplier = findSupplierByRegNo(validation.normalized);
      if (!supplier) {
        setError('Registration number was not found in cached master data.');
        return;
      }
      if (
        confirmedRegNo.current !== validation.normalized ||
        supplierId !== supplier.supplierId
      ) {
        setError(
          'Confirm the supplier name for this registration number before queueing.',
        );
        return;
      }
      setSupplierRegNo(supplier.supplierRegNo);
      setSupplierBarcode(supplier.barcodeValue);
    }
    setBusy(true);
    try {
      const payload = buildPickupPayload({
        tripId,
        supplierId,
        supplierRegNo,
        supplierBarcode,
        routeStopId,
        grossWeightKg,
        bagsCount,
        tareKg,
        moistureDeductionKg,
        scanMethod,
        manualReason,
        deviceId,
        gpsLat,
        gpsLng,
      });
      await enqueuePickup(payload);
      Alert.alert(
        'Pickup queued',
        online
          ? 'The pickup is queued and will sync shortly.'
          : 'The pickup is stored encrypted until you are online.',
      );
      onQueued();
      if (online) {
        onSync();
      }
      confirmedRegNo.current = null;
      setRegNoError(null);
      setScanMethod('BARCODE');
      setTripId('');
      setSupplierId('');
      setSupplierRegNo('');
      setSupplierBarcode('');
      setManualReason('');
      setRouteId('');
      setRouteStopId('');
      setGrossWeightKg('');
      setBagsCount('');
      setTareKg('0');
      setMoistureDeductionKg('0');
      setGpsLat('');
      setGpsLng('');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not queue pickup.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>PICKUP ENTRY</Text>
          <Text style={styles.title}>Record pickup</Text>
          <Text style={styles.subtitle}>
            {queuedCount} {queuedCount === 1 ? 'pickup' : 'pickups'} waiting to
            sync
          </Text>
        </View>
        <AppButton title="Back" variant="ghost" onPress={onBack} />
      </View>

      <Card>
        <Field
          label="Trip ID"
          value={tripId}
          onChangeText={setTripId}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Trip UUID"
        />
        <Field
          label="Route"
          value={routeId}
          onChangeText={setRouteId}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Optional route UUID"
          editable={false}
        />
        <View style={styles.list}>
          {routes.map(route => (
            <AppButton
              key={route.id}
              title={`${route.code || 'Route'} · ${route.name || route.id}`}
              variant={routeId === route.id ? 'primary' : 'secondary'}
              onPress={() => {
                setRouteId(route.id);
                setRouteStopId('');
              }}
            />
          ))}
        </View>
        {activeRoute ? (
          <View style={styles.list}>
            <Hint>Select a route stop to link this pickup.</Hint>
            {activeRoute.stops.map(stop => (
              <AppButton
                key={stop.id}
                title={`Stop ${stop.sequence} · ${suppliers.find(supplier => supplier.supplierId === stop.supplierId)?.preferredName || stop.supplierId}`}
                variant={routeStopId === stop.id ? 'primary' : 'secondary'}
                onPress={() => {
                  const supplier = suppliers.find(
                    candidate => candidate.supplierId === stop.supplierId,
                  );
                  if (supplier) {
                    chooseSupplier(supplier, stop.id);
                    setScanMethod('BARCODE');
                  }
                }}
              />
            ))}
          </View>
        ) : null}
      </Card>

      <Card>
        <SectionTitle>Supplier identification</SectionTitle>
        <AppButton
          title="Scan barcode"
          onPress={() => scan()}
          disabled={!scannerAvailable}
        />
        {!scannerAvailable ? (
          <Hint>
            No native barcode provider is registered in this build. Use
            registration number entry below.
          </Hint>
        ) : null}
        <View style={styles.methodRow}>
          <AppButton
            title="Barcode"
            variant={scanMethod === 'BARCODE' ? 'primary' : 'secondary'}
            onPress={() => setScanMethod('BARCODE')}
            style={styles.flex}
          />
          <AppButton
            title="Registration no."
            variant={scanMethod === 'REG_NO' ? 'primary' : 'secondary'}
            onPress={() => setScanMethod('REG_NO')}
            style={styles.flex}
          />
        </View>

        {scanMethod === 'REG_NO' ? (
          <>
            <Field
              label="Supplier registration no."
              value={supplierRegNo}
              onChangeText={changeRegNo}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="YYNNNNL"
            />
            <Hint>
              Format YYNNNNL with a valid check letter, for example 260001S.
            </Hint>
            {regNoError ? <Text style={styles.error}>{regNoError}</Text> : null}
            <Field
              label="Manual reason"
              value={manualReason}
              onChangeText={setManualReason}
              placeholder="Barcode damaged or scanner unavailable"
              multiline
              maxLength={300}
            />
          </>
        ) : (
          <Field
            label="Barcode value"
            value={supplierBarcode}
            onChangeText={setSupplierBarcode}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Scanned barcode"
            editable={false}
          />
        )}

        <Hint>
          {selectedSupplier
            ? `Selected: ${selectedSupplier.preferredName || selectedSupplier.fullName}`
            : 'Choose a supplier from cached master data.'}
        </Hint>
        <View style={styles.list}>
          {suppliers.map(supplier => (
            <AppButton
              key={supplier.supplierId}
              title={`${supplier.code || supplier.supplierCode} · ${supplier.preferredName || supplier.fullName}`}
              variant={
                supplierId === supplier.supplierId ? 'primary' : 'secondary'
              }
              onPress={() => {
                setScanMethod('BARCODE');
                setManualReason('');
                chooseSupplier(supplier);
              }}
            />
          ))}
        </View>
      </Card>

      <Card>
        <SectionTitle>Weights and location</SectionTitle>
        <Field
          label="Gross weight (kg)"
          value={grossWeightKg}
          onChangeText={setGrossWeightKg}
          keyboardType="decimal-pad"
          placeholder="0.000"
        />
        <Field
          label="Bags count"
          value={bagsCount}
          onChangeText={setBagsCount}
          keyboardType="number-pad"
          placeholder="0"
        />
        <Field
          label="Tare (kg)"
          value={tareKg}
          onChangeText={setTareKg}
          keyboardType="decimal-pad"
          placeholder="0"
        />
        <Field
          label="Moisture deduction (kg)"
          value={moistureDeductionKg}
          onChangeText={setMoistureDeductionKg}
          keyboardType="decimal-pad"
          placeholder="0"
        />
        <Field
          label="GPS latitude"
          value={gpsLat}
          onChangeText={setGpsLat}
          keyboardType="decimal-pad"
          placeholder="Optional"
        />
        <Field
          label="GPS longitude"
          value={gpsLng}
          onChangeText={setGpsLng}
          keyboardType="decimal-pad"
          placeholder="Optional"
        />
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <AppButton title="Queue pickup" onPress={() => submit()} loading={busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  title: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
  },
  list: {
    gap: spacing.sm,
  },
  methodRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
  },
});
