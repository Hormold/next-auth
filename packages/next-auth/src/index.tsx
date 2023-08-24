/**
 *
 * :::warning Note
 * This is the documentation for `next-auth@latest`. Check out the documentation of v4 [here](https://next-auth.js.org).
 * :::
 *
 * If you are looking for the migration guide, visit the [`next-auth@latest` Migration Guide](https://nextjs.authjs.dev/v5).
 *
 * ## Installation
 *
 * ```bash npm2yarn2pnpm
 * npm install next-auth@5 @auth/core
 * ```
 *
 * ## Signing in and signing out
 *
 * The App Router embraces Server Actions that can be leveraged to decrease the amount of JavaScript sent to the browser.
 *
 * :::info
 * [Next.js Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions) is **in alpha stage**. In the future, NextAuth.js will integrate with Server Actions and provide first-party APIs.
 * Until then, here is how you can use NextAuth.js to log in and log out without JavaScript.
 * :::
 *
 * ```ts title="app/auth-components.tsx"
 * import { CSRF_experimental } from "../auth"
 *
 * export function SignIn({ provider, ...props }: any) {
 *   return (
 *     <form action={`/api/auth/signin/${provider}`} method="post">
 *       <button {{...props}}/>
 *       <CSRF_experimental/>
 *     </form>
 *   )
 * }
 *
 * export function SignOut(props: any) {
 *   return (
 *     <form action="/api/auth/signout" method="post">
 *       <button {...props}/>
 *       <CSRF_experimental/>
 *     </form>
 *   )
 * }
 * ```
 *
 * Alternatively, you can create client components, using the `signIn()` and `signOut` methods:
 *
 * ```ts title="app/auth-components.tsx"
 * "use client"
 * import { signIn, signOut } from "next-auth/react"
 *
 * export function SignIn({provider, ...props}: any) {
 *   return <button {...props} onClick={() => signIn(provider)}/>
 * }
 *
 * export function SignOut(props: any) {
 *   return <button {...props} onClick={() => signOut()}/>
 * }
 * ```
 *
 * Then, you could for example use it like this:
 *
 * ```ts title=app/page.tsx
 * import { SignIn, SignOut } from "./auth-components"
 *
 * export default async function Page() {
 *   const session = await auth()
 *   if (session) {
 *     return (
 *       <>
 *         <pre>{JSON.stringify(session, null, 2)}</pre>
 *         <SignOut>Sign out</SignOut>
 *       </>
 *     )
 *   }
 *   return <SignIn provider="github">Sign in with GitHub</SignIn>
 * }
 * ```
 *
 *
 * ## Environment variable inferrence
 *
 * `NEXTAUTH_URL` and `NEXTAUTH_SECRET` have been inferred since v4.
 *
 * Since NextAuth.js v5 can also automatically infer environment variables that are prefiexed with `AUTH_`.
 *
 * For example `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` will be used as the `clientId` and `clientSecret` options for the GitHub provider.
 *
 * :::tip
 * The environment variable name inferring has the following format for OAuth providers: `AUTH_{PROVIDER}_{ID|SECRET}`.
 *
 * `PROVIDER` is the uppercase snake case version of the provider's id, followed by either `ID` or `SECRET` respectively.
 * :::
 *
 * `AUTH_SECRET` and `AUTH_URL` are also aliased for `NEXTAUTH_SECRET` and `NEXTAUTH_URL` for consistency.
 *
 * To add social login to your app, the configuration becomes:
 *
 * ```ts title="auth.ts"
 * import NextAuth from "next-auth"
 * import GitHub from "next-auth/providers/GitHub"
 * export const { handlers, auth } = NextAuth({ providers: [ GitHub ] })
 * ```
 *
 * And the `.env.local` file:
 *
 * ```sh title=".env.local"
 * AUTH_GITHUB_ID=...
 * AUTH_GITHUB_SECRET=...
 * AUTH_SECRET=...
 * ```
 *
 * :::tip
 * In production, `AUTH_SECRET` is a required environment variable - if not set, NextAuth.js will throw an error. See [MissingSecretError](https://authjs.dev/reference/core/errors#missingsecret) for more details.
 * :::
 *
 * If you need to override the default values for a provider, you can still call it as a function `GitHub({...})` as before.
 *
 * @module index
 */

import { Auth, skipCSRFCheck, raw } from "@auth/core"
import { cookies, headers } from "next/headers.js"
import { detectOrigin, reqWithEnvUrl, setEnvDefaults } from "./lib/env.js"
import { initAuth } from "./lib/index.js"

import type { Session } from "@auth/core/types"
import type {
  GetServerSidePropsContext,
  NextApiRequest,
  NextApiResponse,
} from "next"
import type { AppRouteHandlerFn } from "next/dist/server/future/route-modules/app-route/module.js"
import { NextRequest, NextResponse } from "next/server"
import type { NextAuthConfig, NextAuthRequest } from "./lib/index.js"
import { redirect } from "next/navigation.js"

export type {
  Account,
  DefaultSession,
  Profile,
  Session,
  User,
} from "./types.js"

type AppRouteHandlers = Record<
  "GET" | "POST",
  (req: NextRequest) => Promise<Response>
>

export type { NextAuthConfig }

/**
 * The result of invoking {@link NextAuth|NextAuth}, initialized with the {@link NextAuthConfig}.
 * It contains methods to set up and interact with NextAuth.js in your Next.js app.
 */
export interface NextAuthResult {
  /**
   * The NextAuth.js [Route Handler](https://beta.nextjs.org/docs/routing/route-handlers) methods. These are used to expose an endpoint for OAuth/Email providers,
   * as well as REST API endpoints (such as `/api/auth/session`) that can be contacted from the client.
   *
   * After initializing NextAuth.js in `auth.ts`,
   * re-export these methods.
   *
   * In `app/api/auth/[...nextauth]/route.ts`:
   *
   * ```ts title="app/api/auth/[...nextauth]/route.ts"
   * export { GET, POST } from "../../../../auth"
   * export const runtime = "edge" // optional
   * ```
   * Then `auth.ts`:
   * ```ts title="auth.ts"
   * // ...
   * export const { handlers: { GET, POST }, auth } = NextAuth({...})
   * ```
   */
  handlers: AppRouteHandlers
  /**
   * A universal method to interact with NextAuth.js in your Next.js app.
   * After initializing NextAuth.js in `auth.ts`, use this method in Middleware, Server Components, Route Handlers (`app/`), and Edge or Node.js API Routes (`pages/`).
   *
   * #### In Middleware
   *
   * :::info
   * Adding `auth` to your Middleware is optional, but recommended to keep the user session alive.
   * :::
   *
   * Authentication is done by the {@link NextAuthConfig.callbacks|callbacks.authorized} callback.
   * @example
   * ```ts title="middleware.ts"
   * export { auth as middleware } from "./auth"
   * ```
   *
   * Alternatively you can wrap your own middleware with `auth`, where `req` is extended with `auth`:
   * @example
   * ```ts title="middleware.ts"
   * import { auth } from "./auth"
   * export default auth((req) => {
   *   // req.auth
   * })
   * ```
   *
   * ```ts
   * // Optionally, don't invoke Middleware on some paths
   * // Read more: https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
   * export const config = {
   *   matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
   * }
   * ```
   *
   * #### In Server Components
   *
   * @example
   * ```ts title="app/page.ts"
   * import { auth } from "../auth"
   *
   * export default async function Page() {
   *   const { user } = await auth()
   *   return <p>Hello {user?.name}</p>
   * }
   * ```
   *
   * #### In Route Handlers
   * @example
   * ```ts title="app/api/route.ts"
   * import { auth } from "../../auth"
   *
   * export const POST = auth((req) => {
   *   // req.auth
   * })
   * ```
   *
   * #### In Edge API Routes
   *
   * @example
   * ```ts title="pages/api/protected.ts"
   * import { auth } from "../../auth"
   *
   * export default auth((req) => {
   *   // req.auth
   * })
   *
   * export const config = { runtime: "edge" }
   * ```
   *
   * #### In API Routes
   *
   * @example
   * ```ts title="pages/api/protected.ts"
   * import { auth } from "../auth"
   * import type { NextApiRequest, NextApiResponse } from "next"
   *
   * export default async (req: NextApiRequest, res: NextApiResponse) => {
   *   const session = await auth(req, res)
   *   if (session) {
   *     // Do something with the session
   *     return res.json("This is protected content.")
   *   }
   *   res.status(401).json("You must be signed in.")
   * }
   * ```
   *
   * #### In `getServerSideProps`
   *
   * @example
   * ```ts title="pages/protected-ssr.ts"
   * import { auth } from "../auth"
   * //...
   * export const getServerSideProps: GetServerSideProps = async (context) => {
   *   const session = await auth(context)
   *
   *   if (session) {
   *     // Do something with the session
   *     return { props: { session, content: (await res.json()).content } }
   *   }
   *
   *   return { props: {} }
   * }
   * ```
   */
  auth: ((...args: [NextApiRequest, NextApiResponse]) => Promise<Session>) &
    ((...args: []) => Promise<Session>) &
    ((...args: [GetServerSidePropsContext]) => Promise<Session>) &
    ((
      ...args: [(req: NextAuthRequest) => ReturnType<AppRouteHandlerFn>]
    ) => AppRouteHandlerFn)
  /**
   * Returns a hidden `<input>` field with a CSRF token, that can be used in signin/signout forms.
   *
   * Read more about signing in and signing out in the [NextAuth.js docs](nextjs.authjs.dev/reference/nextjs#signing-in-and-signing-out).
   *
   * :::info
   * This API is not finalized yet. We are looking into
   * [Server Action](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions) support which might make this method unnecessary in the future.
   * :::
   *
   * @example
   * ```ts title="app/page.ts"
   * import { CSRF_experimental } from "../auth"
   * async function SignIn({ id, ...props }: { id: string } & JSX.IntrinsicElements["button"]) {
   *  return (
   *    <form action={`/api/auth/signin/${id}`} method="post">
   *      <button {...props} />
   *      <CSRF_experimental />
   *    </form>
   *  )
   * }
   *
   * async function SignOut({ id, ...props }: JSX.IntrinsicElements["button"]) {
   *  return (
   *    <form action="/api/auth/signout" method="post">
   *      <button {...props} />
   *      <CSRF_experimental />
   *    </form>
   *  )
   * }
   * ```
   */
  CSRF_experimental: () => Promise<ReturnType<React.FunctionComponent>>
  signIn: (
    provider?: string,
    params?: { redirectTo?: string; redirect?: boolean }
  ) => () => Promise<string | never>
  signOut: (params?: {
    redirectTo?: string
    redirect?: boolean
  }) => () => Promise<string | never>
}

/**
 *  Initialize NextAuth.js.
 *
 *  @example
 * ```ts title="auth.ts"
 * import NextAuth from "next-auth"
 * import GitHub from "@auth/core/providers/github"
 *
 * export const { handlers, auth } = NextAuth({ providers: [GitHub] })
 * ```
 */
export default function NextAuth(config: NextAuthConfig): NextAuthResult {
  setEnvDefaults(config)
  const httpHandler = (req: NextRequest) => Auth(reqWithEnvUrl(req), config)
  return {
    handlers: { GET: httpHandler, POST: httpHandler } as const,
    // @ts-expect-error
    auth: initAuth(config),
    async CSRF_experimental() {
      const _headers = headers()
      const url = `${detectOrigin(_headers).origin}/api/auth/csrf`
      const value = await Auth(new Request(url, { headers: _headers }), config)
        .then((res) => res.json())
        .then((res) => res?.csrfToken)

      if (!value) throw new Error("CSRF token could not be found.")

      return <input type="hidden" name="csrfToken" value={value} />
    },
    signIn(provider, params) {
      return async () => {
        "use server"
        const _headers = new Headers(headers())
        _headers.set("Content-Type", "application/x-www-form-urlencoded")

        const origin = detectOrigin(_headers)
        const url = `${origin}/signin/${provider}`
        const res = (await Auth(
          new Request(url, {
            method: "POST",
            headers: _headers,
            body: new URLSearchParams({
              callbackUrl: params?.redirectTo ?? _headers.get("Referer") ?? "/",
            }),
          }),
          { ...config, raw, skipCSRFCheck }
        )) as any // TODO: fix return type when "raw" is set

        for (const c of res?.cookies ?? []) {
          cookies().set(c.name, c.value, c.options)
        }

        if (params?.redirect) return redirect(res.redirect)

        return res.redirect
      }
    },
    signOut(params) {
      return async () => {
        "use server"
        const _headers = new Headers(headers())
        _headers.set("Content-Type", "application/x-www-form-urlencoded")

        const origin = detectOrigin(_headers)
        const url = `${origin}/signout`
        const res = (await Auth(
          new Request(url, {
            method: "POST",
            headers: _headers,
            body: new URLSearchParams({
              callbackUrl: params?.redirectTo ?? _headers.get("Referer") ?? "/",
            }),
          }),
          { ...config, raw, skipCSRFCheck }
        )) as any // TODO: fix return type when "raw" is set

        for (const c of res?.cookies ?? []) {
          cookies().set(c.name, c.value, c.options)
        }

        if (params?.redirect) return redirect(res.redirect)

        return res.redirect
      }
    },
  }
}
