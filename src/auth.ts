import { createRemoteJWKSet, jwtVerify } from "jose";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const JWKS_URL = process.env.JWKS_URL!;

const jwks = createRemoteJWKSet(new URL(JWKS_URL));

export const tokenVerifier: OAuthTokenVerifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const { payload } = await jwtVerify(token, jwks, {
      requiredClaims: ["sub"],
    });

    return {
      token,
      clientId: (payload.aud as string) ?? "supabase",
      scopes: [],
      expiresAt: payload.exp,
      extra: { sub: payload.sub },
    };
  },
};

export function createUserSupabaseClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}
