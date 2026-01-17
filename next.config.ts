import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  async headers() {
    return [
      {
        source: "/overlay",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=*, microphone=*"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
