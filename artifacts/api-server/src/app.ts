import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { mountSpaFallback } from "./middlewares/spaFallback";
import router from "./routes";
import { logger } from "./lib/logger";
import { isOriginAllowed } from "./lib/corsOrigins";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk proxy must be before body parsers (streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (isOriginAllowed(origin)) {
        callback(null, origin ?? true);
        return;
      }
      callback(new Error(`Not allowed by CORS: ${origin}`));
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Clerk auth is optional for local/demo: guest sessions work without Clerk keys.
if (process.env.CLERK_SECRET_KEY) {
  app.use(
    clerkMiddleware((req) => ({
      publishableKey: publishableKeyFromHost(
        getClerkProxyHost(req) ?? "",
        process.env.CLERK_PUBLISHABLE_KEY,
      ),
      secretKey: process.env.CLERK_SECRET_KEY,
    })),
  );
}

app.use("/api", router);

// Deep links (/partner, /upcoming, …) must resolve on this PORT too —
// preview/public URLs usually hit the API, not Vite's 5173.
mountSpaFallback(app);

export default app;
