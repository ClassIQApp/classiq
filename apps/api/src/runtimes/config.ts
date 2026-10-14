export interface RuntimeConfig {
    readonly databaseUrl?: string;
}

export function readRuntimeConfig(environment: NodeJS.ProcessEnv): RuntimeConfig {
    return {
        databaseUrl: environment.DATABASE_URL,
    };
}
