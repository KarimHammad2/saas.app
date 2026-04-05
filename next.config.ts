import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/",
        destination: "https://saassquared.com/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
