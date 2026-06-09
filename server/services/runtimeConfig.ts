type RuntimeEnv = Record<string, string | undefined>;

export const getServerBindHost = (env: RuntimeEnv) => {
  const explicitHost = env.HOST?.trim();
  if (explicitHost) return explicitHost;

  return env.RENDER ? "0.0.0.0" : "127.0.0.1";
};

export const getServerListenUrl = (host: string, port: number) => `http://${host}:${port}`;
