/**
 * ARES Metrics Collector
 * In-memory counters and timers for observability
 * Sprint R2
 */

interface Metrics {
  ingest_count_total: number;
  review_approved_total: number;
  review_dismissed_total: number;
  wiki_rebuild_count_total: number;
  wiki_rebuild_last_ms: number;
  heartbeat_last_updated_at: string;
  // Sprint R4: API counters
  api_list_entities_total: number;
  api_list_relations_total: number;
  api_get_entity_total: number;
  api_get_relation_total: number;
  // Sprint R6: Graph, Search, Bulk Review
  api_graph_neighborhood_total: number;
  api_graph_by_predicate_total: number;
  api_search_total: number;
  review_bulk_approved_total: number;
  review_bulk_dismissed_total: number;
  api_rate_limited_total: number;
  // Sprint R7: Notes and Seeds
  notes_created_total: number;
  notes_updated_total: number;
  notes_deleted_total: number;
  api_list_notes_total: number;
  api_get_note_total: number;
  seeds_added_total: number;
  seeds_removed_total: number;
  api_list_seeds_total: number;
  entity_rebuilt_total: number;
  review_queued_total: number;
  // Sprint R8: Theming, Gamification & Temporal
  api_list_themes_total: number;
  api_get_theme_total: number;
  theme_created_total: number;
  theme_updated_total: number;
  theme_deleted_total: number;
  api_get_progress_total: number;
  progress_action_recorded_total: number;
  progress_level_1_total: number;
  api_list_temporal_events_total: number;
  api_list_temporal_edges_total: number;
  temporal_events_extracted_total: number;
  temporal_edges_generated_total: number;
  // Sprint W2: Entity Mentions
  api_get_entity_mentions_total: number;
  api_get_mention_stats_total: number;
  entity_mentions_confirmed_total: number;
  entity_mentions_updated_total: number;
  entity_mentions_rejected_total: number;
  entity_type_updated_total: number;
  // Sprint S3 & S8: Alias Brain
  api_get_alias_version_total: number;
  api_get_alias_index_total: number;
  api_get_entity_aliases_total: number;
  alias_confirmed_total: number;
  alias_rejected_total: number;
  alias_reclassified_total: number;
  alias_index_rebuilt_total: number;
}

const metrics: Metrics = {
  ingest_count_total: 0,
  review_approved_total: 0,
  review_dismissed_total: 0,
  wiki_rebuild_count_total: 0,
  wiki_rebuild_last_ms: 0,
  heartbeat_last_updated_at: new Date().toISOString(),
  api_list_entities_total: 0,
  api_list_relations_total: 0,
  api_get_entity_total: 0,
  api_get_relation_total: 0,
  api_graph_neighborhood_total: 0,
  api_graph_by_predicate_total: 0,
  api_search_total: 0,
  review_bulk_approved_total: 0,
  review_bulk_dismissed_total: 0,
  api_rate_limited_total: 0,
  notes_created_total: 0,
  notes_updated_total: 0,
  notes_deleted_total: 0,
  api_list_notes_total: 0,
  api_get_note_total: 0,
  seeds_added_total: 0,
  seeds_removed_total: 0,
  api_list_seeds_total: 0,
  entity_rebuilt_total: 0,
  review_queued_total: 0,
  api_list_themes_total: 0,
  api_get_theme_total: 0,
  theme_created_total: 0,
  theme_updated_total: 0,
  theme_deleted_total: 0,
  api_get_progress_total: 0,
  progress_action_recorded_total: 0,
  progress_level_1_total: 0,
  api_list_temporal_events_total: 0,
  api_list_temporal_edges_total: 0,
  temporal_events_extracted_total: 0,
  temporal_edges_generated_total: 0,
  api_get_entity_mentions_total: 0,
  api_get_mention_stats_total: 0,
  entity_mentions_confirmed_total: 0,
  entity_mentions_updated_total: 0,
  entity_mentions_rejected_total: 0,
  entity_type_updated_total: 0,
  api_get_alias_version_total: 0,
  api_get_alias_index_total: 0,
  api_get_entity_aliases_total: 0,
  alias_confirmed_total: 0,
  alias_rejected_total: 0,
  alias_reclassified_total: 0,
  alias_index_rebuilt_total: 0
};

/**
 * Increment ingest counter
 */
export function incrementIngest(): void {
  metrics.ingest_count_total++;
  updateHeartbeat();
}

/**
 * Increment approved review item counter
 */
export function incrementApproved(): void {
  metrics.review_approved_total++;
  updateHeartbeat();
}

/**
 * Increment dismissed review item counter
 */
export function incrementDismissed(): void {
  metrics.review_dismissed_total++;
  updateHeartbeat();
}

/**
 * Increment wiki rebuild counter and record duration
 */
export function recordWikiRebuild(durationMs: number): void {
  metrics.wiki_rebuild_count_total++;
  metrics.wiki_rebuild_last_ms = durationMs;
  updateHeartbeat();
}

/**
 * Sprint R4: Increment list entities API counter
 */
export function incrementListEntities(): void {
  metrics.api_list_entities_total++;
}

/**
 * Sprint R4: Increment list relations API counter
 */
export function incrementListRelations(): void {
  metrics.api_list_relations_total++;
}

/**
 * Sprint R4: Increment get entity API counter
 */
export function incrementGetEntity(): void {
  metrics.api_get_entity_total++;
}

/**
 * Sprint R4: Increment get relation API counter
 */
export function incrementGetRelation(): void {
  metrics.api_get_relation_total++;
}

/**
 * Sprint R6: Generic counter increment
 */
export function incrementCounter(name: keyof Metrics): void {
  if (typeof metrics[name] === 'number') {
    (metrics[name] as number)++;
  }
}

/**
 * Update heartbeat timestamp
 */
export function updateHeartbeat(): void {
  metrics.heartbeat_last_updated_at = new Date().toISOString();
}

/**
 * Bump heartbeat (alias for updateHeartbeat)
 */
export function bumpHeartbeat(): void {
  updateHeartbeat();
}

/**
 * Get heartbeat timestamp
 */
export function getHeartbeat(): string {
  return metrics.heartbeat_last_updated_at;
}

/**
 * Get all metrics as Prometheus text format
 */
export function getPrometheusMetrics(): string {
  const lines: string[] = [];

  lines.push('# HELP ares_ingest_count_total Total documents ingested');
  lines.push('# TYPE ares_ingest_count_total counter');
  lines.push(`ares_ingest_count_total ${metrics.ingest_count_total}`);
  lines.push('');

  lines.push('# HELP ares_review_approved_total Total review items approved');
  lines.push('# TYPE ares_review_approved_total counter');
  lines.push(`ares_review_approved_total ${metrics.review_approved_total}`);
  lines.push('');

  lines.push('# HELP ares_review_dismissed_total Total review items dismissed');
  lines.push('# TYPE ares_review_dismissed_total counter');
  lines.push(`ares_review_dismissed_total ${metrics.review_dismissed_total}`);
  lines.push('');

  lines.push('# HELP ares_wiki_rebuild_count_total Total wiki rebuilds');
  lines.push('# TYPE ares_wiki_rebuild_count_total counter');
  lines.push(`ares_wiki_rebuild_count_total ${metrics.wiki_rebuild_count_total}`);
  lines.push('');

  lines.push('# HELP ares_wiki_rebuild_last_ms Duration of last wiki rebuild in milliseconds');
  lines.push('# TYPE ares_wiki_rebuild_last_ms gauge');
  lines.push(`ares_wiki_rebuild_last_ms ${metrics.wiki_rebuild_last_ms}`);
  lines.push('');

  lines.push('# HELP ares_heartbeat_last_updated_seconds Unix timestamp of last graph/queue update');
  lines.push('# TYPE ares_heartbeat_last_updated_seconds gauge');
  const heartbeatSec = new Date(metrics.heartbeat_last_updated_at).getTime() / 1000;
  lines.push(`ares_heartbeat_last_updated_seconds ${heartbeatSec}`);
  lines.push('');

  // Sprint R4: API counters
  lines.push('# HELP ares_api_list_entities_total Total listEntities API calls');
  lines.push('# TYPE ares_api_list_entities_total counter');
  lines.push(`ares_api_list_entities_total ${metrics.api_list_entities_total}`);
  lines.push('');

  lines.push('# HELP ares_api_list_relations_total Total listRelations API calls');
  lines.push('# TYPE ares_api_list_relations_total counter');
  lines.push(`ares_api_list_relations_total ${metrics.api_list_relations_total}`);
  lines.push('');

  lines.push('# HELP ares_api_get_entity_total Total getEntity API calls');
  lines.push('# TYPE ares_api_get_entity_total counter');
  lines.push(`ares_api_get_entity_total ${metrics.api_get_entity_total}`);
  lines.push('');

  lines.push('# HELP ares_api_get_relation_total Total getRelation API calls');
  lines.push('# TYPE ares_api_get_relation_total counter');
  lines.push(`ares_api_get_relation_total ${metrics.api_get_relation_total}`);
  lines.push('');

  // Sprint R6: Graph, Search, Bulk Review
  lines.push('# HELP ares_api_graph_neighborhood_total Total graphNeighborhood API calls');
  lines.push('# TYPE ares_api_graph_neighborhood_total counter');
  lines.push(`ares_api_graph_neighborhood_total ${metrics.api_graph_neighborhood_total}`);
  lines.push('');

  lines.push('# HELP ares_api_graph_by_predicate_total Total graphByPredicate API calls');
  lines.push('# TYPE ares_api_graph_by_predicate_total counter');
  lines.push(`ares_api_graph_by_predicate_total ${metrics.api_graph_by_predicate_total}`);
  lines.push('');

  lines.push('# HELP ares_api_search_total Total search API calls');
  lines.push('# TYPE ares_api_search_total counter');
  lines.push(`ares_api_search_total ${metrics.api_search_total}`);
  lines.push('');

  lines.push('# HELP ares_review_bulk_approved_total Total bulk review approvals');
  lines.push('# TYPE ares_review_bulk_approved_total counter');
  lines.push(`ares_review_bulk_approved_total ${metrics.review_bulk_approved_total}`);
  lines.push('');

  lines.push('# HELP ares_review_bulk_dismissed_total Total bulk review dismissals');
  lines.push('# TYPE ares_review_bulk_dismissed_total counter');
  lines.push(`ares_review_bulk_dismissed_total ${metrics.review_bulk_dismissed_total}`);
  lines.push('');

  lines.push('# HELP ares_api_rate_limited_total Total API calls rate limited');
  lines.push('# TYPE ares_api_rate_limited_total counter');
  lines.push(`ares_api_rate_limited_total ${metrics.api_rate_limited_total}`);
  lines.push('');

  // Sprint R7: Notes and Seeds
  lines.push('# HELP ares_notes_created_total Total notes created');
  lines.push('# TYPE ares_notes_created_total counter');
  lines.push(`ares_notes_created_total ${metrics.notes_created_total}`);
  lines.push('');

  lines.push('# HELP ares_notes_updated_total Total notes updated');
  lines.push('# TYPE ares_notes_updated_total counter');
  lines.push(`ares_notes_updated_total ${metrics.notes_updated_total}`);
  lines.push('');

  lines.push('# HELP ares_notes_deleted_total Total notes deleted');
  lines.push('# TYPE ares_notes_deleted_total counter');
  lines.push(`ares_notes_deleted_total ${metrics.notes_deleted_total}`);
  lines.push('');

  lines.push('# HELP ares_api_list_notes_total Total listNotes API calls');
  lines.push('# TYPE ares_api_list_notes_total counter');
  lines.push(`ares_api_list_notes_total ${metrics.api_list_notes_total}`);
  lines.push('');

  lines.push('# HELP ares_api_get_note_total Total getNote API calls');
  lines.push('# TYPE ares_api_get_note_total counter');
  lines.push(`ares_api_get_note_total ${metrics.api_get_note_total}`);
  lines.push('');

  lines.push('# HELP ares_seeds_added_total Total seeds added');
  lines.push('# TYPE ares_seeds_added_total counter');
  lines.push(`ares_seeds_added_total ${metrics.seeds_added_total}`);
  lines.push('');

  lines.push('# HELP ares_seeds_removed_total Total seeds removed');
  lines.push('# TYPE ares_seeds_removed_total counter');
  lines.push(`ares_seeds_removed_total ${metrics.seeds_removed_total}`);
  lines.push('');

  lines.push('# HELP ares_api_list_seeds_total Total listSeeds API calls');
  lines.push('# TYPE ares_api_list_seeds_total counter');
  lines.push(`ares_api_list_seeds_total ${metrics.api_list_seeds_total}`);
  lines.push('');

  lines.push('# HELP ares_entity_rebuilt_total Total entity wiki rebuilds');
  lines.push('# TYPE ares_entity_rebuilt_total counter');
  lines.push(`ares_entity_rebuilt_total ${metrics.entity_rebuilt_total}`);
  lines.push('');

  lines.push('# HELP ares_review_queued_total Total items queued for review');
  lines.push('# TYPE ares_review_queued_total counter');
  lines.push(`ares_review_queued_total ${metrics.review_queued_total}`);
  lines.push('');

  // Sprint R8: Theming, Gamification & Temporal
  lines.push('# HELP ares_api_list_themes_total Total listThemes API calls');
  lines.push('# TYPE ares_api_list_themes_total counter');
  lines.push(`ares_api_list_themes_total ${metrics.api_list_themes_total}`);
  lines.push('');

  lines.push('# HELP ares_api_get_theme_total Total getTheme API calls');
  lines.push('# TYPE ares_api_get_theme_total counter');
  lines.push(`ares_api_get_theme_total ${metrics.api_get_theme_total}`);
  lines.push('');

  lines.push('# HELP ares_theme_created_total Total themes created');
  lines.push('# TYPE ares_theme_created_total counter');
  lines.push(`ares_theme_created_total ${metrics.theme_created_total}`);
  lines.push('');

  lines.push('# HELP ares_theme_updated_total Total themes updated');
  lines.push('# TYPE ares_theme_updated_total counter');
  lines.push(`ares_theme_updated_total ${metrics.theme_updated_total}`);
  lines.push('');

  lines.push('# HELP ares_theme_deleted_total Total themes deleted');
  lines.push('# TYPE ares_theme_deleted_total counter');
  lines.push(`ares_theme_deleted_total ${metrics.theme_deleted_total}`);
  lines.push('');

  lines.push('# HELP ares_api_get_progress_total Total getProgress API calls');
  lines.push('# TYPE ares_api_get_progress_total counter');
  lines.push(`ares_api_get_progress_total ${metrics.api_get_progress_total}`);
  lines.push('');

  lines.push('# HELP ares_progress_action_recorded_total Total progress actions recorded');
  lines.push('# TYPE ares_progress_action_recorded_total counter');
  lines.push(`ares_progress_action_recorded_total ${metrics.progress_action_recorded_total}`);
  lines.push('');

  lines.push('# HELP ares_progress_level_1_total Players at level 1 (dynamic)');
  lines.push('# TYPE ares_progress_level_1_total counter');
  lines.push(`ares_progress_level_1_total ${metrics.progress_level_1_total}`);
  lines.push('');

  lines.push('# HELP ares_api_list_temporal_events_total Total listTemporalEvents API calls');
  lines.push('# TYPE ares_api_list_temporal_events_total counter');
  lines.push(`ares_api_list_temporal_events_total ${metrics.api_list_temporal_events_total}`);
  lines.push('');

  lines.push('# HELP ares_api_list_temporal_edges_total Total listTemporalEdges API calls');
  lines.push('# TYPE ares_api_list_temporal_edges_total counter');
  lines.push(`ares_api_list_temporal_edges_total ${metrics.api_list_temporal_edges_total}`);
  lines.push('');

  lines.push('# HELP ares_temporal_events_extracted_total Total temporal events extracted');
  lines.push('# TYPE ares_temporal_events_extracted_total counter');
  lines.push(`ares_temporal_events_extracted_total ${metrics.temporal_events_extracted_total}`);
  lines.push('');

  lines.push('# HELP ares_temporal_edges_generated_total Total temporal edges generated');
  lines.push('# TYPE ares_temporal_edges_generated_total counter');
  lines.push(`ares_temporal_edges_generated_total ${metrics.temporal_edges_generated_total}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Get raw metrics object (for testing)
 */
export function getRawMetrics(): Readonly<Metrics> {
  return { ...metrics };
}

/**
 * Reset all metrics (for testing)
 */
export function resetMetrics(): void {
  metrics.ingest_count_total = 0;
  metrics.review_approved_total = 0;
  metrics.review_dismissed_total = 0;
  metrics.wiki_rebuild_count_total = 0;
  metrics.wiki_rebuild_last_ms = 0;
  metrics.heartbeat_last_updated_at = new Date().toISOString();
  metrics.api_list_entities_total = 0;
  metrics.api_list_relations_total = 0;
  metrics.api_get_entity_total = 0;
  metrics.api_get_relation_total = 0;
  metrics.api_graph_neighborhood_total = 0;
  metrics.api_graph_by_predicate_total = 0;
  metrics.api_search_total = 0;
  metrics.review_bulk_approved_total = 0;
  metrics.review_bulk_dismissed_total = 0;
  metrics.api_rate_limited_total = 0;
  metrics.notes_created_total = 0;
  metrics.notes_updated_total = 0;
  metrics.notes_deleted_total = 0;
  metrics.api_list_notes_total = 0;
  metrics.api_get_note_total = 0;
  metrics.seeds_added_total = 0;
  metrics.seeds_removed_total = 0;
  metrics.api_list_seeds_total = 0;
  metrics.entity_rebuilt_total = 0;
  metrics.review_queued_total = 0;
  metrics.api_list_themes_total = 0;
  metrics.api_get_theme_total = 0;
  metrics.theme_created_total = 0;
  metrics.theme_updated_total = 0;
  metrics.theme_deleted_total = 0;
  metrics.api_get_progress_total = 0;
  metrics.progress_action_recorded_total = 0;
  metrics.progress_level_1_total = 0;
  metrics.api_list_temporal_events_total = 0;
  metrics.api_list_temporal_edges_total = 0;
  metrics.temporal_events_extracted_total = 0;
  metrics.temporal_edges_generated_total = 0;
  metrics.api_get_entity_mentions_total = 0;
  metrics.api_get_mention_stats_total = 0;
  metrics.entity_mentions_confirmed_total = 0;
  metrics.entity_mentions_updated_total = 0;
  metrics.entity_mentions_rejected_total = 0;
  metrics.entity_type_updated_total = 0;
  metrics.api_get_alias_version_total = 0;
  metrics.api_get_alias_index_total = 0;
  metrics.api_get_entity_aliases_total = 0;
  metrics.alias_confirmed_total = 0;
  metrics.alias_rejected_total = 0;
  metrics.alias_reclassified_total = 0;
  metrics.alias_index_rebuilt_total = 0;
}
