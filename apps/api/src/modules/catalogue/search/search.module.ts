import { Module } from '@nestjs/common';
import { SEARCH_PROVIDER } from './search.provider';
import { PostgresSearchProvider } from './postgres-search.provider';

/**
 * Binds the search port. Phase 1 uses PostgreSQL FTS; swap the class here for a
 * Typesense/Elasticsearch adapter later without touching callers.
 */
@Module({
  providers: [
    PostgresSearchProvider,
    { provide: SEARCH_PROVIDER, useExisting: PostgresSearchProvider },
  ],
  exports: [SEARCH_PROVIDER],
})
export class SearchModule {}
