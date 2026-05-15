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
