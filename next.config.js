/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["jszip"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

module.exports = nextConfig;
