import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@galatura/mobile-core';
import { Card, Screen, Stat } from '../components/ui';
import { useCachedResource } from '../hooks/useCachedResource';
import { getTrips } from '../api/monitor';

export function TripsScreen({ online }: { online: boolean }) {
  const { data, loading, error, reload } = useCachedResource(
    'monitor.trips',
    getTrips,
  );
  const trips = data ?? [];
  return (
    <Screen
      title="Trips"
      subtitle="Live trip status"
      online={online}
      loading={loading}
      error={error}
      onRefresh={() => {
        void reload();
      }}
    >
      <Card>
        <View style={styles.row}>
          <Stat label="Trips" value={trips.length} />
          <Stat
            label="Active"
            value={
              trips.filter(
                t => t.status === 'ACTIVE' || t.status === 'IN_PROGRESS',
              ).length
            }
          />
        </View>
      </Card>
      {trips.map(trip => (
        <Card key={trip.id}>
          <Text style={styles.route}>{trip.route || 'Route'}</Text>
          <Text style={styles.meta}>Status: {trip.status || 'Unknown'}</Text>
          {trip.vehicle ? (
            <Text style={styles.meta}>Vehicle: {trip.vehicle}</Text>
          ) : null}
        </Card>
      ))}
      {!loading && trips.length === 0 ? (
        <Text style={styles.meta}>No trip data available.</Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  route: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  meta: { color: colors.muted, fontSize: 13 },
});
