const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    // The old standalone pages merged into the Draft Center.
    return [
      { source: "/draftboard", destination: "/draft", permanent: false },
      { source: "/draft-order", destination: "/draft?tab=order", permanent: false },
    ];
  },
};

module.exports = nextConfig;
