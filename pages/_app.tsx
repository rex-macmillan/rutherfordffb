import type { AppProps } from "next/app";
import Head from "next/head";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import Layout from "../components/Layout";
import UsernameGate from "../components/UsernameGate";
import { IdentityProvider } from "../lib/identity";
import "../styles/globals.css";

function MyApp({ Component, pageProps }: AppProps) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <IdentityProvider>
        <Head>
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1, viewport-fit=cover"
          />
          <meta name="theme-color" content="#0f172a" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta
            name="apple-mobile-web-app-status-bar-style"
            content="black-translucent"
          />
          <meta name="apple-mobile-web-app-title" content="Rutherford FFB" />
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <UsernameGate>
          <Layout>
            <Component {...pageProps} />
          </Layout>
        </UsernameGate>
      </IdentityProvider>
    </QueryClientProvider>
  );
}

export default MyApp;
