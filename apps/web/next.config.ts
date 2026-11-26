import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @tradeviw/core ships TypeScript source so the web app and the API can never
  // disagree about a contract; Next compiles it as part of the app.
  transpilePackages: ['@tradeviw/core'],
};

export default nextConfig;
