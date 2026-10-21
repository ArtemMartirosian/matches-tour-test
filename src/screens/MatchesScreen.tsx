import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FavoriteButton } from '../components/FavoriteButton';
import { UpdatedAgo } from '../components/UpdatedAgo';
import { MATCHES_URL } from '../config';
import { useFavorites } from '../hooks/useFavorites';

type Team = {
  id: string;
  name: string;
  city: string;
};

type Match = {
  id: string;
  startsAt: string | null;
  status: string;
  minute?: number;
  home: Team;
  away: Team;
  score: { home: number; away: number } | null;
};

type MatchesResponse = {
  round: number;
  matches: Match[];
};

type Filter = 'all' | 'upcoming' | 'finished';

const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'upcoming', label: 'Предстоящие' },
  { id: 'finished', label: 'Завершённые' },
];

const statusLabels: Record<string, string> = {
  scheduled: 'Предстоящий',
  finished: 'Завершён',
  live: 'Идёт матч',
  postponed: 'Перенесён',
  cancelled: 'Отменён',
  canceled: 'Отменён',
};

function formatStart(value: string | null) {
  if (!value) return 'Дата уточняется';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Некорректная дата';

  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusLabel(match: Match) {
  const label = statusLabels[match.status] ?? `Статус: ${match.status}`;
  return match.status === 'live' && match.minute ? `${label} · ${match.minute}'` : label;
}

function belongsToFilter(match: Match, filter: Filter) {
  if (filter === 'upcoming') return match.status === 'scheduled';
  if (filter === 'finished') return match.status === 'finished';
  return true;
}

export function MatchesScreen() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [round, setRound] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const { favorites, isFavorite, toggle } = useFavorites();

  const loadMatches = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);

    try {
      const response = await fetch(MATCHES_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as Partial<MatchesResponse>;
      if (!Array.isArray(data.matches)) throw new Error('Некорректный формат ответа');

      setMatches(data.matches);
      setRound(typeof data.round === 'number' ? data.round : null);
      setLastUpdated(new Date());
    } catch {
      setError('Не удалось загрузить матчи. Проверьте подключение и попробуйте ещё раз.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadMatches();
  }, [loadMatches]);

  const visibleMatches = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru-RU');

    return matches.filter((match) => {
      const matchesFilter = belongsToFilter(match, filter);
      const matchesQuery =
        !normalizedQuery ||
        match.home.name.toLocaleLowerCase('ru-RU').includes(normalizedQuery) ||
        match.away.name.toLocaleLowerCase('ru-RU').includes(normalizedQuery);

      return matchesFilter && matchesQuery;
    });
  }, [filter, matches, query]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ef3124" />
        <Text style={styles.stateText}>Загружаем матчи…</Text>
      </View>
    );
  }

  if (error && matches.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Не получилось загрузить данные</Text>
        <Text style={styles.stateText}>{error}</Text>
        <Pressable style={styles.primaryButton} onPress={() => void loadMatches()}>
          <Text style={styles.primaryButtonText}>Повторить</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Матчи тура</Text>
          {round !== null && <Text style={styles.round}>Тур {round}</Text>}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Обновить матчи"
          disabled={refreshing}
          style={[styles.refreshButton, refreshing && styles.disabledButton]}
          onPress={() => void loadMatches(true)}
        >
          <Text style={styles.refreshButtonText}>{refreshing ? 'Обновляем…' : 'Обновить'}</Text>
        </Pressable>
      </View>

      {lastUpdated && <UpdatedAgo since={lastUpdated} />}
      {error && <Text style={styles.inlineError}>{error}</Text>}

      <TextInput
        accessibilityLabel="Поиск по клубам"
        value={query}
        onChangeText={setQuery}
        placeholder="Найти клуб"
        placeholderTextColor="#9ca3af"
        style={styles.search}
      />

      <View style={styles.filters}>
        {filters.map((item) => {
          const selected = item.id === filter;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.filterButton, selected && styles.filterButtonSelected]}
              onPress={() => setFilter(item.id)}
            >
              <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={visibleMatches}
        keyExtractor={(item) => item.id}
        extraData={favorites}
        contentContainerStyle={visibleMatches.length === 0 ? styles.emptyList : styles.list}
        refreshing={refreshing}
        onRefresh={() => void loadMatches(true)}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={[styles.status, item.status === 'live' && styles.liveStatus]}>
                {getStatusLabel(item)}
              </Text>
              <FavoriteButton active={isFavorite(item.id)} onPress={() => toggle(item.id)} />
            </View>

            <View style={styles.teamsRow}>
              <View style={styles.teamNames}>
                <Text style={styles.teamName}>{item.home.name}</Text>
                <Text style={styles.teamName}>{item.away.name}</Text>
              </View>
              <View style={styles.scoreColumn}>
                <Text style={styles.score}>{item.score?.home ?? '—'}</Text>
                <Text style={styles.score}>{item.score?.away ?? '—'}</Text>
              </View>
            </View>

            <Text style={styles.date}>{formatStart(item.startsAt)}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.errorTitle}>Матчей не найдено</Text>
            <Text style={styles.stateText}>Измените фильтр или поисковый запрос.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, backgroundColor: '#f6f7f9' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '800', color: '#111827' },
  round: { marginTop: 2, color: '#6b7280', fontSize: 14 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  refreshButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#111827',
  },
  refreshButtonText: { color: '#fff', fontWeight: '700' },
  disabledButton: { opacity: 0.55 },
  stateText: { marginTop: 10, color: '#6b7280', textAlign: 'center', lineHeight: 20 },
  errorTitle: { color: '#111827', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  primaryButton: {
    marginTop: 18,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#ef3124',
  },
  primaryButtonText: { color: '#fff', fontWeight: '700' },
  inlineError: { marginTop: 8, color: '#b42318', fontSize: 13 },
  search: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    color: '#111827',
  },
  filters: { flexDirection: 'row', gap: 8, marginVertical: 14 },
  filterButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#e5e7eb',
  },
  filterButtonSelected: { backgroundColor: '#ef3124' },
  filterText: { color: '#374151', fontSize: 13, fontWeight: '600' },
  filterTextSelected: { color: '#fff' },
  list: { paddingBottom: 24, gap: 12 },
  emptyList: { flexGrow: 1 },
  card: { padding: 16, borderRadius: 14, backgroundColor: '#fff', gap: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  status: { color: '#6b7280', fontSize: 13, fontWeight: '700' },
  liveStatus: { color: '#ef3124' },
  teamsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  teamNames: { flex: 1, gap: 8 },
  teamName: { color: '#111827', fontSize: 17, fontWeight: '600' },
  scoreColumn: { alignItems: 'flex-end', gap: 8, paddingLeft: 16 },
  score: { color: '#111827', fontSize: 18, fontWeight: '800' },
  date: { color: '#6b7280', fontSize: 13 },
});
