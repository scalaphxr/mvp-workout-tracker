module.exports = ({ config }) => {
  if (process.env.MVP_EXPO_GO !== '1') return config;

  return {
    ...config,
    extra: { ...config.extra, expoGoApiUrl: process.env.EXPO_PUBLIC_API_URL },
  };
};
