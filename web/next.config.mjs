/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The Worker API lives on a different host in production. The frontend
  // calls it directly (NEXT_PUBLIC_API_BASE + credentials:include).
  // For same-domain deployments, add a rewrite here, e.g.:
  // async rewrites() {
  //   return [{ source: '/worker/:path*', destination: `${process.env.WORKER_ORIGIN}/:path*` }];
  // },
};

export default nextConfig;
