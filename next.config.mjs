/** @type {import('next').NextConfig} */
const isStaticExport = process.env.STATIC_EXPORT === "1";

const nextConfig = isStaticExport
  ? {
      output: "export",
      distDir: "dist",
      images: { unoptimized: true },
      trailingSlash: true,
    }
  : {
      images: { unoptimized: true },
    };

export default nextConfig;
