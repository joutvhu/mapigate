export interface MigrationOptions {
  source?: string;
  dest?: string;
  dryRun?: boolean;
  noBackup?: boolean;
  skipLogs?: boolean;
  replace?: boolean;
  verbose?: boolean;
}

export interface EntityCount {
  read: number;
  migrated: number;
  skipped: number;
}

export interface MigrationStats {
  sourcePath: string;
  destPath: string;
  backupPath?: string;
  dryRun: boolean;
  providers: EntityCount;
  accounts: EntityCount;
  combos: EntityCount;
  modelRules: EntityCount;
  mitmMappings: EntityCount;
  settings: EntityCount;
  gatewayApiKeys: EntityCount;
  requestLogs: EntityCount;
  requestDetails: EntityCount;
  warnings: string[];
  errors: string[];
}
