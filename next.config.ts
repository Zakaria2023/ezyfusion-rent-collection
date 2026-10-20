import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Bank-transfer slips may be up to 5 MB (the brief); the default
      // Server Action body limit is 1 MB. 6 MB leaves room for the other
      // form fields. The 5 MB rule itself is enforced in
      // src/lib/server/slips.ts and by the bucket's file_size_limit.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
